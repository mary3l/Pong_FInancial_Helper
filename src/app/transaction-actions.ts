"use server";

import { refresh } from "next/cache";
import { SIGNED_OUT_ERROR, signedInClient } from "@/lib/auth";
import { isCategoryFor } from "@/lib/categories";
import { isValidDate } from "@/lib/dates";
import { MAX_AMOUNT, roundCents, type TransactionType } from "@/lib/money";

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

/** Creates a transaction, or updates it when `id` is given. */
export async function saveTransaction(
  input: TransactionInput,
  id?: string,
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
