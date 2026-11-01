import { formatShortDay } from "@/lib/dates";
import type { ForecastItem } from "@/lib/forecast";
import { formatPeso, roundCents } from "@/lib/money";

// Utang and pautang (design canvas row 5). A person's balance is what they
// owe you (above 0) or what you owe them (below 0). Pure, so the server and
// the Add form share it. See 0006_people.sql.

export type EntryKind = "lend" | "borrow" | "split" | "payment" | "forgive";

export type PersonEntry = {
  transactionId: string;
  personId: string;
  kind: EntryKind;
  dueOn: string | null;
  countInForecast: boolean;
  splitTotal: number | null;
};

export type Person = {
  id: string;
  name: string;
  contact: string | null;
  /** Above 0: they owe you. Below 0: you owe them. */
  balance: number;
  entries: PersonEntry[];
};

/** When an open balance is due: the earliest promised date, if any. */
export function dueDate(person: Person): string | null {
  if (person.balance === 0) return null;
  const kinds: EntryKind[] = person.balance > 0 ? ["lend", "split"] : ["borrow", "split"];
  const dates = person.entries
    .filter((e) => kinds.includes(e.kind) && e.dueOn)
    .map((e) => e.dueOn!)
    .sort();
  return dates[0] ?? null;
}

/** Pautang past its promised date. */
export function isOverdue(person: Person, today: string): boolean {
  const due = dueDate(person);
  return person.balance > 0 && due !== null && due < today;
}

/**
 * Forecast items for people. Utang with a due date always counts: you'll
 * have to pay it. Pautang counts only when you turned on "Count it in my
 * forecast", and never once it's late: the app doesn't count on money until
 * it's paid back.
 */
export function personItems(people: Person[], from: string, until: string): ForecastItem[] {
  const items: ForecastItem[] = [];
  for (const p of people) {
    const due = dueDate(p);
    if (!due || due >= until) continue;
    if (p.balance < 0) {
      items.push(item(p, "utang", due));
    } else if (p.balance > 0 && due >= from && p.entries.some((e) => e.countInForecast && e.dueOn)) {
      items.push(item(p, "pautang", due));
    }
  }
  return items;
}

function item(p: Person, kind: "utang" | "pautang", dueOn: string): ForecastItem {
  return {
    key: `${kind}|${p.id}`,
    kind,
    flow: kind === "utang" ? "out" : "in",
    id: p.id,
    name: kind === "utang" ? `Pay back ${p.name}` : `${p.name} pays you back`,
    amount: Math.abs(p.balance),
    dueOn,
    accountId: null,
    category: null,
    estimate: false,
    transactionId: null,
  };
}

export type Share = {
  /** Null for you. */
  personId: string | null;
  amount: number;
};

/** Splits a bill evenly between you and `others`; you absorb the rounding. */
export function equalShares(total: number, others: string[]): Share[] {
  const count = others.length + 1;
  const each = Math.floor((total / count) * 100) / 100;
  return [
    { personId: null, amount: roundCents(total - each * others.length) },
    ...others.map((personId) => ({ personId, amount: each })),
  ];
}

/**
 * What a split does to the ledger. If you paid, your share is an expense and
 * each other share becomes pautang. If someone else paid, only your share
 * matters: it's an expense, and utang to them.
 */
export function splitEffects(shares: Share[], paidBy: string | null) {
  const mine = shares.find((s) => s.personId === null)?.amount ?? 0;
  if (paidBy === null) {
    return {
      expense: mine,
      lent: shares.filter((s) => s.personId !== null && s.amount > 0) as { personId: string; amount: number }[],
      owed: 0,
    };
  }
  return { expense: mine, lent: [], owed: mine };
}

/** A friendly message to paste in Messenger or SMS. */
export function reminderText(person: Person, today: string, myName: string | null): string {
  const due = dueDate(person);
  const when = due ? (due < today ? `, was due ${formatShortDay(due, today)}` : `, due ${formatShortDay(due, today)}`) : "";
  return `Hi ${person.name}! Friendly reminder lang about the ${formatPeso(person.balance)}${when}. No rush, just let me know when you can send it. Salamat!${myName ? ` - ${myName}` : ""}`;
}
