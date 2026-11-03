"use server";

import { refresh } from "next/cache";
import { SIGNED_OUT_ERROR, signedInClient } from "@/lib/auth";
import { today } from "@/lib/dates";
import {
  MAX_AMOUNT,
  canEarnInterest,
  isInterestPayout,
  isWalletPurpose,
  isWalletType,
  roundCents,
  type InterestPayout,
  type WalletPurpose,
  type WalletType,
} from "@/lib/money";

export type WalletInput = {
  name: string;
  type: WalletType;
  balance: number;
  /** Left out by first-run setup: new wallets are spending money. */
  purpose?: WalletPurpose;
  /** % a year, banks and e-wallets only; null for none. */
  interestRate?: number | null;
  /** When the bank credits the interest: daily (MariBank) or on the 1st (GoTyme). */
  interestPayout?: InterestPayout;
};
export type WalletResult = { error?: string; archived?: boolean };

const NAME_MAX = 60;

// 42703: the purpose and interest columns from migration 0010 (or the payout
// column from 0011) are missing.
const NEEDS_MIGRATION = "Run steps 10 and 11 in supabase/SQL_GUIDE.md first, then try again.";

function cleanName(name: unknown) {
  return String(name ?? "").replace(/\s+/g, " ").trim();
}

function checkWallet(w: WalletInput): string | null {
  const name = cleanName(w.name);
  if (!name) return "Give each wallet a name.";
  if (name.length > NAME_MAX) return `Keep wallet names to ${NAME_MAX} characters.`;
  if (!isWalletType(w.type)) return `Pick a type for ${name}.`;
  if (!Number.isFinite(w.balance) || Math.abs(w.balance) > MAX_AMOUNT) {
    return `Check the amount for ${name}.`;
  }
  if (w.purpose !== undefined && !isWalletPurpose(w.purpose)) return `Pick a category for ${name}.`;
  const rate = w.interestRate ?? null;
  if (rate !== null) {
    if (!canEarnInterest(w.type)) return "Only banks and e-wallets earn interest.";
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return `Check the interest rate for ${name}.`;
  }
  if (w.interestPayout !== undefined && !isInterestPayout(w.interestPayout)) {
    return `Pick when ${name} pays interest.`;
  }
  return null;
}

/**
 * The purpose and interest columns, only when the form sent them. A daily
 * payout is the column's default, so it's only sent when it changes: wallets
 * still save before migration 0011.
 */
function extras(w: WalletInput, payoutBefore = "daily") {
  return {
    ...(w.purpose !== undefined && { purpose: w.purpose }),
    ...(w.interestRate !== undefined && {
      interest_rate: w.interestRate === null ? null : Math.round(w.interestRate * 100) / 100,
    }),
    ...(w.interestPayout !== undefined && w.interestPayout !== payoutBefore && { interest_payout: w.interestPayout }),
  };
}

/** Adds wallets with what's in them right now (onboarding and Money). */
export async function addWallets(wallets: WalletInput[]): Promise<WalletResult> {
  for (const w of wallets) {
    const problem = checkWallet(w);
    if (problem) return { error: problem };
  }
  if (!wallets.length) return {};

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { error } = await supabase.from("accounts").insert(
    wallets.map((w) => ({
      name: cleanName(w.name),
      type: w.type,
      starting_balance: roundCents(w.balance),
      ...extras(w),
      ...(w.interestRate && { interest_since: today() }),
    })),
  );
  if (error?.code === "42703") return { error: NEEDS_MIGRATION };
  if (error) return { error: "Couldn't save your wallets. Please try again." };

  refresh();
  return {};
}

/**
 * Renames a wallet and sets what's in it now. The starting balance is
 * adjusted so past transactions stay as they are.
 */
export async function updateWallet(id: string, input: WalletInput): Promise<WalletResult> {
  const { name, type, balance } = input;
  const problem = checkWallet(input);
  if (problem) return { error: problem };

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const [account, current] = await Promise.all([
    // "*" so this still works before migration 0010 adds interest_rate.
    supabase.from("accounts").select("*").eq("id", id).maybeSingle(),
    supabase.from("account_balances").select("balance").eq("account_id", id).maybeSingle(),
  ]);
  if (account.error || current.error || !account.data || !current.data) {
    return { error: "Couldn't find that wallet." };
  }

  const starting =
    Number(account.data.starting_balance) + (balance - Number(current.data.balance));
  const row = extras(input, account.data.interest_payout ?? "daily");
  // A new rate starts a new estimate; without one there's nothing to estimate.
  if ("interest_rate" in row) {
    const before = account.data.interest_rate == null ? null : Number(account.data.interest_rate);
    if (row.interest_rate === null) Object.assign(row, { interest_since: null });
    else if (row.interest_rate !== before) Object.assign(row, { interest_since: today() });
  }
  const { error } = await supabase
    .from("accounts")
    .update({ name: cleanName(name), type, starting_balance: roundCents(starting), ...row })
    .eq("id", id);
  if (error?.code === "42703") return { error: NEEDS_MIGRATION };
  if (error) return { error: "Couldn't save that wallet. Please try again." };

  refresh();
  return {};
}

/**
 * Deletes a wallet that was never used. One with transactions or bills is
 * archived instead, so its history and balances stay right.
 */
export async function removeWallet(id: string): Promise<WalletResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const deleted = await supabase.from("accounts").delete().eq("id", id).select("id");
  if (!deleted.error && deleted.data.length) {
    refresh();
    return {};
  }
  // 23503: still referenced by a transaction or a bill.
  if (deleted.error?.code !== "23503") {
    return { error: "Couldn't remove that wallet. Please try again." };
  }

  const archived = await setArchived(id, true);
  return archived.error ? archived : { archived: true };
}

export async function restoreWallet(id: string): Promise<WalletResult> {
  return setArchived(id, false);
}

async function setArchived(id: string, archived: boolean): Promise<WalletResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data, error } = await supabase
    .from("accounts")
    .update({ archived })
    .eq("id", id)
    .select("id");
  if (error || !data.length) return { error: "Couldn't update that wallet. Please try again." };

  refresh();
  return {};
}
