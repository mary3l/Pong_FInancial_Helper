import type { Transaction } from "@/lib/data";
import { roundCents } from "@/lib/money";

// A split bill you paid is several records: the expense for your share and a
// transfer (pautang) to each person. They share a split_id (migration 0012),
// so lists can show the bill once and open its breakdown.

export type SplitBill = {
  splitId: string;
  /** Your share: the only part that's spending. Missing if your share was ₱0. */
  mine: Transaction | undefined;
  /** Each person's share, as a transfer to them. */
  others: Transaction[];
  /** The whole bill. */
  total: number;
  /** The note you typed, without "(my share)" / "Split:". "Split bill" if none. */
  title: string;
  /** The wallet it was paid from. */
  accountId: string;
  occurredOn: string;
};

export type ListItem = { kind: "one"; txn: Transaction } | { kind: "split"; split: SplitBill };

/** The note typed in Add, from any record of the split; "" if none was. */
export function typedNote(records: { note: string | null }[]): string {
  for (const t of records) {
    const note = t.note?.trim() ?? "";
    const mine = note.match(/^(.*) \(my share\)$/);
    if (mine?.[1].trim()) return mine[1].trim();
    const theirs = note.match(/^Split: (.*)$/);
    if (theirs?.[1].trim()) return theirs[1].trim();
  }
  return "";
}

/** The split's name: its note, or "Split bill". */
export function splitNote(records: Transaction[]): string {
  return typedNote(records) || "Split bill";
}

export function toSplitBill(splitId: string, records: Transaction[]): SplitBill {
  const mine = records.find((t) => t.type === "expense");
  return {
    splitId,
    mine,
    others: records.filter((t) => t !== mine),
    total: roundCents(records.reduce((s, t) => s + t.amount, 0)),
    title: splitNote(records),
    accountId: (mine ?? records[0]).accountId,
    occurredOn: records[0].occurredOn,
  };
}

/**
 * What each pautang record still has unpaid. Payments go to a person, not to
 * one bill, so they clear the oldest pautang first: what's left of their
 * balance sits on the newest records. `transactions` must be newest first
 * (as getTransactions returns them).
 */
export function unpaidByRecord(people: { id: string; balance: number }[], transactions: Transaction[]): Map<string, number> {
  const unpaid = new Map<string, number>();
  for (const p of people) {
    let left = Math.max(0, p.balance);
    for (const t of transactions) {
      if (t.type !== "transfer" || t.toAccountId !== p.id) continue;
      const owed = roundCents(Math.min(t.amount, left));
      unpaid.set(t.id, owed);
      left = roundCents(left - owed);
    }
  }
  return unpaid;
}

/**
 * Folds the records of each split into one item, where the first of them
 * was. A split with only one record in the list stays a plain row.
 */
export function groupSplits(transactions: Transaction[]): ListItem[] {
  const bySplit = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.splitId) bySplit.set(t.splitId, [...(bySplit.get(t.splitId) ?? []), t]);
  }
  const items: ListItem[] = [];
  const done = new Set<string>();
  for (const t of transactions) {
    const records = t.splitId ? bySplit.get(t.splitId) : undefined;
    if (!t.splitId || !records || records.length < 2) {
      items.push({ kind: "one", txn: t });
    } else if (!done.has(t.splitId)) {
      done.add(t.splitId);
      items.push({ kind: "split", split: toSplitBill(t.splitId, records) });
    }
  }
  return items;
}
