"use server";

import { refresh } from "next/cache";
import { SIGNED_OUT_ERROR, signedInClient } from "@/lib/auth";
import { EXPENSE_CATEGORIES, isCategoryFor } from "@/lib/categories";
import { isValidDate, today } from "@/lib/dates";
import { monthlyDates, splitAmount } from "@/lib/forecast";
import { MAX_AMOUNT, isSpendable, roundCents, type AccountType } from "@/lib/money";

export type PlanResult = { error?: string };

type Client = NonNullable<Awaited<ReturnType<typeof signedInClient>>>;

const FAILED = { error: "Couldn't save that. Please try again." };

/**
 * The wallet a payment comes from: the one saved with the bill if it's still
 * in use, else your first cash, bank or e-wallet.
 */
async function payingWallet(supabase: Client, preferred: string | null): Promise<string | null> {
  const { data } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("archived", false)
    .order("created_at");
  const wallets = (data ?? []).filter((a) => isSpendable(a.type as AccountType));
  return wallets.find((a) => a.id === preferred)?.id ?? wallets[0]?.id ?? null;
}

async function logExpense(
  supabase: Client,
  { amount, accountId, category, note }: { amount: number; accountId: string; category: string; note: string },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({ type: "expense", amount, account_id: accountId, category, note, occurred_on: today() })
    .select("id")
    .single();
  return error ? null : data.id;
}

/**
 * Mark paid for a bill: logs the expense today and links it to the bill's
 * scheduled date. Undo deletes that transaction, which un-marks the bill.
 */
export async function markBillPaid(recurringItemId: string, dueOn: string): Promise<PlanResult> {
  if (!isValidDate(dueOn)) return FAILED;
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data: bill } = await supabase
    .from("recurring_items")
    .select("name, amount, account_id")
    .eq("id", recurringItemId)
    .eq("kind", "bill")
    .maybeSingle();
  if (!bill?.amount) return { error: "Couldn't find that bill." };

  const accountId = await payingWallet(supabase, bill.account_id);
  if (!accountId) return { error: "Add a wallet first, so I know where the money came from." };

  const txnId = await logExpense(supabase, {
    amount: Number(bill.amount),
    accountId,
    category: "bills",
    note: bill.name,
  });
  if (!txnId) return FAILED;

  const { error } = await supabase
    .from("bill_payments")
    .insert({ recurring_item_id: recurringItemId, due_on: dueOn, transaction_id: txnId });
  if (error) {
    // Already marked (another tab?): don't leave a second expense behind.
    await supabase.from("transactions").delete().eq("id", txnId);
    if (error.code !== "23505") return FAILED;
  }

  refresh();
  return {};
}

/** Mark paid for a planned expense: logs it today and links the two. */
export async function markPlannedPaid(id: string): Promise<PlanResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data: planned } = await supabase
    .from("planned_expenses")
    .select("name, amount, category, account_id, transaction_id")
    .eq("id", id)
    .maybeSingle();
  if (!planned) return { error: "Couldn't find that planned expense." };
  if (planned.transaction_id) {
    refresh();
    return {};
  }

  const accountId = await payingWallet(supabase, planned.account_id);
  if (!accountId) return { error: "Add a wallet first, so I know where the money came from." };

  const txnId = await logExpense(supabase, {
    amount: Number(planned.amount),
    accountId,
    category: planned.category,
    note: planned.name,
  });
  if (!txnId) return FAILED;

  const { error } = await supabase
    .from("planned_expenses")
    .update({ transaction_id: txnId })
    .eq("id", id)
    .is("transaction_id", null);
  if (error) {
    await supabase.from("transactions").delete().eq("id", txnId);
    return FAILED;
  }

  refresh();
  return {};
}

export type PlannedInput = {
  name: string;
  amount: number;
  category: string;
  /** The date of the first (or only) payment. */
  first: string;
  /** 1 for one-time; more splits it into monthly payments. */
  months: number;
};

/** "Add as planned expense" from Can I afford this?. */
export async function addPlannedExpense(input: PlannedInput): Promise<PlanResult> {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim() || "Planned purchase";
  const amount = roundCents(Number(input.amount));
  if (name.length > 50) return { error: "Keep the name to 50 characters." };
  if (!(amount > 0 && amount <= MAX_AMOUNT)) return { error: "Enter an amount above ₱0." };
  if (!isCategoryFor("expense", input.category)) return { error: "Pick a category." };
  if (!isValidDate(input.first) || input.first < today()) return { error: "Pick today or a later date." };
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 24) {
    return { error: "Pick how many months." };
  }

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const amounts = splitAmount(amount, input.months);
  const rows = monthlyDates(input.first, input.months).map((date, i) => ({
    name: input.months > 1 ? `${name} (${i + 1} of ${input.months})` : name,
    amount: amounts[i],
    category: input.category,
    due_on: date,
  }));
  const { error } = await supabase.from("planned_expenses").insert(rows);
  if (error) return FAILED;

  refresh();
  return {};
}

export async function removePlannedExpense(id: string): Promise<PlanResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data, error } = await supabase.from("planned_expenses").delete().eq("id", id).select("id");
  if (error || !data.length) return { error: "Couldn't remove that. Please try again." };

  refresh();
  return {};
}

/** Sets the budget per kinsenas for an expense category. */
export async function saveBudget(category: string, amount: number): Promise<PlanResult> {
  if (!EXPENSE_CATEGORIES.some((c) => c.key === category)) return { error: "Pick a category." };
  const value = roundCents(Number(amount));
  if (!(value > 0 && value <= MAX_AMOUNT)) return { error: "Enter an amount above ₱0." };

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { error } = await supabase
    .from("budgets")
    .upsert({ category, amount: value }, { onConflict: "user_id,category" });
  if (error) return FAILED;

  refresh();
  return {};
}

export async function removeBudget(id: string): Promise<PlanResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data, error } = await supabase.from("budgets").delete().eq("id", id).select("id");
  if (error || !data.length) return { error: "Couldn't remove that budget. Please try again." };

  refresh();
  return {};
}
