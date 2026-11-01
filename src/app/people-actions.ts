"use server";

import { refresh } from "next/cache";
import { SIGNED_OUT_ERROR, signedInClient } from "@/lib/auth";
import { isCategoryFor } from "@/lib/categories";
import { isValidDate, today } from "@/lib/dates";
import { MAX_AMOUNT, isSpendable, roundCents, type AccountType } from "@/lib/money";
import type { EntryKind } from "@/lib/people";
import { pickWallet, type Client } from "@/lib/server-writes";

// Phase 4: utang, pautang and split bills. Every one of these is a transfer
// or an expense on the person's account: see 0006_people.sql.

export type PeopleResult = { error?: string; personId?: string };

const FAILED = { error: "Couldn't save that. Please try again." };
const NOTE_MAX = 120;

function cleanName(name: unknown) {
  return String(name ?? "").replace(/\s+/g, " ").trim();
}

function cleanNote(note: unknown) {
  return String(note ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) || null;
}

function validAmount(value: number) {
  return Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT;
}

/** Who: an existing person by id, or a new one by name. */
export type Who = { personId: string } | { name: string };

/** The person's account id, adding them first if they're new. */
async function personFor(supabase: Client, who: Who): Promise<string | null> {
  if ("personId" in who) {
    const { data } = await supabase.from("accounts").select("id").eq("id", who.personId).eq("type", "person").maybeSingle();
    return data?.id ?? null;
  }
  const name = cleanName(who.name);
  if (!name || name.length > 60) return null;
  // Reuse someone with the same name instead of adding them twice.
  const { data: existing } = await supabase
    .from("accounts")
    .select("id, archived")
    .eq("type", "person")
    .ilike("name", name.replace(/[%_\\]/g, (c) => `\\${c}`))
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (existing.archived) await supabase.from("accounts").update({ archived: false }).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await supabase
    .from("accounts")
    .insert({ name, type: "person", starting_balance: 0 })
    .select("id")
    .single();
  return error ? null : data.id;
}

/** A cash, bank or e-wallet you own. */
async function isWallet(supabase: Client, id: string): Promise<boolean> {
  const { data } = await supabase.from("accounts").select("type").eq("id", id).maybeSingle();
  return Boolean(data && isSpendable(data.type as AccountType));
}

async function balanceOf(supabase: Client, personId: string): Promise<number | null> {
  const { data } = await supabase.from("account_balances").select("balance").eq("account_id", personId).maybeSingle();
  return data ? Number(data.balance) : null;
}

/** Inserts a transaction and its person entry; removes the transaction if the entry fails. */
async function record(
  supabase: Client,
  row: Record<string, unknown>,
  entry: { personId: string; kind: EntryKind; dueOn?: string | null; countInForecast?: boolean; splitTotal?: number | null },
): Promise<string | null> {
  const { data, error } = await supabase.from("transactions").insert(row).select("id").single();
  if (error) return null;
  const linked = await supabase.from("person_entries").insert({
    transaction_id: data.id,
    person_id: entry.personId,
    kind: entry.kind,
    due_on: entry.dueOn ?? null,
    count_in_forecast: entry.countInForecast ?? false,
    split_total: entry.splitTotal ?? null,
  });
  if (linked.error) {
    await supabase.from("transactions").delete().eq("id", data.id);
    return null;
  }
  return data.id;
}

export type LendInput = {
  /** "lend" = pautang, "borrow" = utang. */
  direction: "lend" | "borrow";
  who: Who;
  amount: number;
  walletId: string;
  occurredOn: string;
  dueOn: string | null;
  countInForecast: boolean;
  note: string;
};

/** Design canvas 5.2: lending is a transfer to the person, borrowing one from them. */
export async function lendOrBorrow(input: LendInput): Promise<PeopleResult> {
  const amount = roundCents(Number(input.amount));
  if (!validAmount(amount)) return { error: "Enter an amount above ₱0." };
  if (!isValidDate(input.occurredOn)) return { error: "Pick a date." };
  if (input.dueOn !== null && !isValidDate(input.dueOn)) return { error: "Check the due date, or leave it blank." };
  if ("name" in input.who && !cleanName(input.who.name)) return { error: "Who is it?" };

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };
  if (!(await isWallet(supabase, input.walletId))) return { error: "Pick a wallet." };
  const personId = await personFor(supabase, input.who);
  if (!personId) return { error: "Check the name (up to 60 characters)." };

  const lend = input.direction === "lend";
  const txnId = await record(
    supabase,
    {
      type: "transfer",
      amount,
      account_id: lend ? input.walletId : personId,
      to_account_id: lend ? personId : input.walletId,
      note: cleanNote(input.note) ?? (lend ? "Pautang" : "Utang"),
      occurred_on: input.occurredOn,
    },
    {
      personId,
      kind: lend ? "lend" : "borrow",
      dueOn: input.dueOn,
      countInForecast: lend && input.countInForecast && input.dueOn !== null,
    },
  );
  if (!txnId) return FAILED;

  refresh();
  return { personId };
}

/**
 * Money back: they paid you (into `walletId`) or you paid them (from it).
 * Partial payments are fine; more than the balance isn't.
 */
export async function recordPayment(personId: string, amount: number, walletId: string, occurredOn = today()): Promise<PeopleResult> {
  const value = roundCents(Number(amount));
  if (!validAmount(value)) return { error: "Enter an amount above ₱0." };
  if (!isValidDate(occurredOn)) return { error: "Pick a date." };

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };
  if (!(await isWallet(supabase, walletId))) return { error: "Pick a wallet." };
  const balance = await balanceOf(supabase, personId);
  if (balance === null || balance === 0) return { error: "You're all square with them." };
  if (value > Math.abs(balance)) return { error: "That's more than the balance." };

  const theyPay = balance > 0;
  const txnId = await record(
    supabase,
    {
      type: "transfer",
      amount: value,
      account_id: theyPay ? personId : walletId,
      to_account_id: theyPay ? walletId : personId,
      note: theyPay ? "Paid me back" : "Paid back",
      occurred_on: occurredOn,
    },
    { personId, kind: "payment" },
  );
  if (!txnId) return FAILED;

  refresh();
  return { personId };
}

/** One tap from Coming up: settles the whole balance with your usual wallet. */
export async function settlePerson(personId: string): Promise<PeopleResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };
  const [balance, wallet] = await Promise.all([balanceOf(supabase, personId), pickWallet(supabase, null)]);
  if (!wallet) return { error: "Add a wallet first." };
  if (!balance) return {};
  return recordPayment(personId, Math.abs(balance), wallet);
}

/**
 * Forgive what's left. Pautang you forgive becomes an expense (Gifts); utang
 * they forgive becomes income (Gift). Either way the balance goes to 0.
 */
export async function forgive(personId: string): Promise<PeopleResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };
  const balance = await balanceOf(supabase, personId);
  if (!balance) return { error: "There's nothing left to forgive." };

  const txnId = await record(
    supabase,
    {
      type: balance > 0 ? "expense" : "income",
      amount: roundCents(Math.abs(balance)),
      account_id: personId,
      category: balance > 0 ? "gifts" : "gift",
      note: "Forgiven",
      occurred_on: today(),
    },
    { personId, kind: "forgive" },
  );
  if (!txnId) return FAILED;

  refresh();
  return { personId };
}

export type SplitInput = {
  total: number;
  category: string;
  note: string;
  occurredOn: string;
  /** Null when you paid. */
  paidBy: Who | null;
  /** The wallet you paid from, when you paid. */
  walletId: string | null;
  /** Your share. */
  myShare: number;
  /** Everyone else's share. */
  others: { who: Who; amount: number }[];
};

/**
 * Split a bill (the Split toggle in Add). You paid: your share is an
 * expense from your wallet and each other share is pautang. Someone else
 * paid: your share is an expense, and utang to them.
 */
export async function saveSplit(input: SplitInput): Promise<PeopleResult> {
  const total = roundCents(Number(input.total));
  const mine = roundCents(Number(input.myShare));
  if (!validAmount(total)) return { error: "Enter an amount above ₱0." };
  if (!isCategoryFor("expense", input.category)) return { error: "Pick a category." };
  if (!isValidDate(input.occurredOn)) return { error: "Pick a date." };
  if (!input.others.length) return { error: "Pick who you split it with." };
  if (!(mine >= 0) || input.others.some((o) => !(o.amount >= 0))) return { error: "Check the shares." };
  const sum = roundCents(mine + input.others.reduce((s, o) => s + roundCents(o.amount), 0));
  if (sum !== total) return { error: `The shares add up to ₱${sum}, not ₱${total}.` };

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };
  const note = cleanNote(input.note);
  const created: string[] = [];
  const undo = async () => {
    if (created.length) await supabase.from("transactions").delete().in("id", created);
  };

  if (input.paidBy === null) {
    if (!input.walletId || !(await isWallet(supabase, input.walletId))) return { error: "Pick the wallet you paid with." };
    if (mine > 0) {
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          type: "expense",
          amount: mine,
          account_id: input.walletId,
          category: input.category,
          note: note ? `${note} (my share)` : "My share",
          occurred_on: input.occurredOn,
        })
        .select("id")
        .single();
      if (error) return FAILED;
      created.push(data.id);
    }
    for (const other of input.others) {
      const amount = roundCents(other.amount);
      if (!amount) continue;
      const personId = await personFor(supabase, other.who);
      const txnId =
        personId &&
        (await record(
          supabase,
          {
            type: "transfer",
            amount,
            account_id: input.walletId,
            to_account_id: personId,
            note: note ? `Split: ${note}` : "Split bill",
            occurred_on: input.occurredOn,
          },
          { personId, kind: "split", splitTotal: total },
        ));
      if (!txnId) {
        await undo();
        return FAILED;
      }
      created.push(txnId);
    }
  } else {
    const payer = await personFor(supabase, input.paidBy);
    if (!payer) return { error: "Check who paid." };
    if (mine > 0) {
      const txnId = await record(
        supabase,
        {
          type: "expense",
          amount: mine,
          account_id: payer,
          category: input.category,
          note: note ? `${note} (my share)` : "My share",
          occurred_on: input.occurredOn,
        },
        { personId: payer, kind: "split", splitTotal: total },
      );
      if (!txnId) return FAILED;
    }
  }

  refresh();
  return {};
}

export async function renamePerson(personId: string, name: string, contact: string): Promise<PeopleResult> {
  const clean = cleanName(name);
  if (!clean || clean.length > 60) return { error: "Check the name (up to 60 characters)." };
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };
  const { data, error } = await supabase
    .from("accounts")
    .update({ name: clean, contact: cleanName(contact).slice(0, 100) || null })
    .eq("id", personId)
    .eq("type", "person")
    .select("id");
  if (error || !data.length) return FAILED;
  refresh();
  return { personId };
}
