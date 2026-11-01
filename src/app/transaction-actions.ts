"use server";

import { refresh } from "next/cache";
import { SIGNED_OUT_ERROR, signedInClient } from "@/lib/auth";
import { isCategoryFor } from "@/lib/categories";
import { isValidDate } from "@/lib/dates";
import { bnplFee, buildSchedule } from "@/lib/installments";
import { MAX_AMOUNT, isSpendable, roundCents, type AccountType, type TransactionType } from "@/lib/money";
import { savePlan } from "@/lib/server-writes";

export type TransactionInput = {
  type: TransactionType;
  amount: number;
  accountId: string;
  toAccountId: string | null;
  category: string | null;
  note: string;
  occurredOn: string;
};

export type ActionResult = { error?: string };

const NOTE_MAX = 120;

function validate(input: TransactionInput) {
  const { type, accountId, occurredOn } = input;
  if (type !== "expense" && type !== "income" && type !== "transfer") {
    return { error: "Pick Expense, Income or Transfer." };
  }
  const amount = roundCents(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount above ₱0." };
  if (amount > MAX_AMOUNT) return { error: "That amount is too big." };
  if (typeof accountId !== "string" || !accountId) {
    return { error: type === "income" ? "Pick where the money went." : "Pick a wallet." };
  }
  const toAccountId = type === "transfer" ? input.toAccountId : null;
  if (type === "transfer" && !toAccountId) return { error: "Pick where the money goes." };
  if (toAccountId === accountId) return { error: "Pick two different wallets." };
  const category = type === "transfer" ? null : input.category;
  if (category !== null && !isCategoryFor(type, category)) return { error: "Pick a category." };
  if (type === "expense" && !category) return { error: "Pick a category." };
  if (!isValidDate(occurredOn)) return { error: "Pick a date." };
  const note = String(input.note ?? "").replace(/\s+/g, " ").trim();
  if (note.length > NOTE_MAX) return { error: `Keep the note to ${NOTE_MAX} characters.` };

  return {
    row: {
      type,
      amount,
      account_id: accountId,
      to_account_id: toAccountId,
      category,
      note: note || null,
      occurred_on: occurredOn,
    },
  };
}

/**
 * Creates a transaction, or updates it when `id` is given. `link` is
 * "<recurring item id>|<date>" when it logs a scheduled occurrence (Add
 * income for a payday with no amount saved).
 */
export async function saveTransaction(
  input: TransactionInput,
  id?: string,
  link?: string,
): Promise<ActionResult> {
  const checked = validate(input);
  if (!checked.row) return { error: checked.error };

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  // RLS and the (account, owner) foreign keys reject other people's rows.
  const { data, error } = id
    ? await supabase.from("transactions").update(checked.row).eq("id", id).select("id")
    : await supabase.from("transactions").insert(checked.row).select("id");
  if (error || !data?.length) {
    return { error: "Couldn't save that. Please try again." };
  }

  if (link && !id) {
    const [itemId, dueOn] = link.split("|");
    const linked = isValidDate(dueOn)
      ? await supabase
          .from("bill_payments")
          .insert({ recurring_item_id: itemId, due_on: dueOn, transaction_id: data[0].id })
      : { error: { code: "invalid" } };
    if (linked.error) {
      // Logged already (another tab?): don't count it twice.
      await supabase.from("transactions").delete().eq("id", data[0].id);
      return {
        error: linked.error.code === "23505" ? "That's already logged." : "Couldn't save that. Please try again.",
      };
    }
  }

  refresh();
  return {};
}

export type BnplPlanInput = {
  /** 1 = pay next month in full. */
  months: number;
  /** Fee or interest as a flat % of the price per month. */
  ratePerMonth: number;
  firstDue: string;
  payFromAccountId: string | null;
};

/**
 * A purchase on SPayLater or Atome: the expense on the purchase date from
 * the credit line, plus its payment plan. Deleting the expense later
 * deletes the plan too.
 */
export async function saveBnplPurchase(input: TransactionInput, plan: BnplPlanInput): Promise<ActionResult> {
  const checked = validate(input);
  if (!checked.row) return { error: checked.error };
  if (checked.row.type !== "expense") return { error: "Payment plans are for expenses." };
  if (!Number.isInteger(plan.months) || plan.months < 1 || plan.months > 24) return { error: "Pick how many months." };
  if (!(plan.ratePerMonth >= 0 && plan.ratePerMonth <= 10)) return { error: "Check the monthly fee (0 to 10%)." };
  if (!isValidDate(plan.firstDue) || plan.firstDue < checked.row.occurred_on) {
    return { error: "The first payment can't be before the purchase." };
  }

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const ids = [checked.row.account_id, plan.payFromAccountId].filter((id): id is string => Boolean(id));
  const { data: accounts } = await supabase.from("accounts").select("id, type").in("id", ids);
  const typeOf = (id: string | null) => accounts?.find((a) => a.id === id)?.type as AccountType | undefined;
  if (typeOf(checked.row.account_id) !== "credit_line") return { error: "Pick a BNPL credit line to pay with." };
  const payFrom = plan.payFromAccountId && isSpendable(typeOf(plan.payFromAccountId)!) ? plan.payFromAccountId : null;

  const { data, error } = await supabase.from("transactions").insert(checked.row).select("id").single();
  if (error) return { error: "Couldn't save that. Please try again." };

  const amount = checked.row.amount;
  const saved = await savePlan(supabase, {
    kind: "bnpl",
    accountId: checked.row.account_id,
    name: checked.row.note ?? "Purchase",
    principal: amount,
    months: plan.months,
    payFromAccountId: payFrom,
    sourceTxnId: data.id,
    rows: buildSchedule({
      principal: amount,
      feeTotal: bnplFee(amount, plan.ratePerMonth, plan.months),
      months: plan.months,
      firstDue: plan.firstDue,
    }),
  });
  if (!saved) {
    await supabase.from("transactions").delete().eq("id", data.id);
    return { error: "Couldn't save the payment plan. Please try again." };
  }

  refresh();
  return {};
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    return { error: "Couldn't delete that. Please try again." };
  }

  refresh();
  return {};
}
