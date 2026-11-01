"use server";

import { refresh } from "next/cache";
import { SIGNED_OUT_ERROR, signedInClient } from "@/lib/auth";
import { MAX_AMOUNT, isWalletType, roundCents, type WalletType } from "@/lib/money";

export type WalletInput = { name: string; type: WalletType; balance: number };
export type WalletResult = { error?: string; archived?: boolean };

const NAME_MAX = 60;

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
  return null;
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
    })),
  );
  if (error) return { error: "Couldn't save your wallets. Please try again." };

  refresh();
  return {};
}

/**
 * Renames a wallet and sets what's in it now. The starting balance is
 * adjusted so past transactions stay as they are.
 */
export async function updateWallet(
  id: string,
  { name, type, balance }: WalletInput,
): Promise<WalletResult> {
  const problem = checkWallet({ name, type, balance });
  if (problem) return { error: problem };

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const [account, current] = await Promise.all([
    supabase.from("accounts").select("starting_balance").eq("id", id).maybeSingle(),
    supabase.from("account_balances").select("balance").eq("account_id", id).maybeSingle(),
  ]);
  if (account.error || current.error || !account.data || !current.data) {
    return { error: "Couldn't find that wallet." };
  }

  const starting =
    Number(account.data.starting_balance) + (balance - Number(current.data.balance));
  const { error } = await supabase
    .from("accounts")
    .update({ name: cleanName(name), type, starting_balance: roundCents(starting) })
    .eq("id", id);
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
