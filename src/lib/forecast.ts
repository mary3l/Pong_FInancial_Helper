import { addDays, dateInMonth, daysBetween } from "@/lib/dates";
import { roundCents } from "@/lib/money";
import { nextOccurrence, occurrences, type Schedule } from "@/lib/schedule";

// The forecast (design canvas 3.1), Safe to spend and "Can I afford this?".
// Pure, so the server and the browser share it.
//
// Only cash, bank and e-wallet money is counted. Bills and planned expenses
// count until Mark paid logs the real expense: then the wallet balance
// already reflects it and the item drops out.

/** Something scheduled to move money on a date. */
export type ForecastItem = {
  /** Unique within one forecast. */
  key: string;
  kind: "payday" | "bill" | "planned";
  /** The recurring_items or planned_expenses row. */
  id: string;
  name: string;
  /** Always positive. Null for a payday with no net pay saved. */
  amount: number | null;
  /** The scheduled date. A late planned expense keeps its own date. */
  dueOn: string;
  accountId: string | null;
  category: string | null;
  /** Bills whose amount changes, like electricity. */
  estimate: boolean;
  /** Set once Mark paid logged the expense. */
  transactionId: string | null;
};

export type ScheduleInputs = {
  recurring: (Schedule & {
    id: string;
    kind: "payday" | "bill";
    name: string;
    amount: number | null;
    amountVaries: boolean;
    accountId: string | null;
  })[];
  billPayments: { recurringItemId: string; dueOn: string; transactionId: string }[];
  planned: {
    id: string;
    name: string;
    amount: number;
    category: string;
    dueOn: string;
    accountId: string | null;
    transactionId: string | null;
  }[];
};

/**
 * Every payday, bill and planned expense from `from` up to but not including
 * `until`, by date. Paydays start the day after `from`: today's pay is
 * assumed already logged. Unpaid planned expenses from before `from` are
 * included too, since they're still owed.
 */
export function scheduledItems(
  { recurring, billPayments, planned }: ScheduleInputs,
  from: string,
  until: string,
): ForecastItem[] {
  const paidBills = new Map(billPayments.map((p) => [`${p.recurringItemId}|${p.dueOn}`, p.transactionId]));
  const items: ForecastItem[] = [];

  for (const r of recurring) {
    const start = r.kind === "payday" ? addDays(from, 1) : from;
    for (const date of occurrences(r, start, until)) {
      items.push({
        key: `${r.kind}|${r.id}|${date}`,
        kind: r.kind,
        id: r.id,
        name: r.kind === "payday" ? "Payday" : r.name,
        amount: r.amount,
        dueOn: date,
        accountId: r.accountId,
        category: r.kind === "bill" ? "bills" : "salary",
        estimate: r.amountVaries,
        transactionId: r.kind === "bill" ? (paidBills.get(`${r.id}|${date}`) ?? null) : null,
      });
    }
  }

  for (const p of planned) {
    const late = p.dueOn < from && !p.transactionId;
    if (!late && (p.dueOn < from || p.dueOn >= until)) continue;
    items.push({
      key: `planned|${p.id}`,
      kind: "planned",
      id: p.id,
      name: p.name,
      amount: p.amount,
      dueOn: p.dueOn,
      accountId: p.accountId,
      category: p.category,
      estimate: false,
      transactionId: p.transactionId,
    });
  }

  return items.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name));
}

/** What an item does to your wallets: + for pay, − for money out, 0 once paid. */
export function itemEffect(item: ForecastItem): number {
  if (item.amount === null || item.transactionId) return 0;
  return item.kind === "payday" ? item.amount : -item.amount;
}

/** Unpaid bills and planned expenses: what you still owe. */
export function isOwed(item: ForecastItem): boolean {
  return item.kind !== "payday" && !item.transactionId;
}

export type DayBalance = { date: string; balance: number };

export type Projection = {
  /** Projected balance at the end of each day, starting today. */
  days: DayBalance[];
  /** Items that change the balance, each with the balance after it. */
  rows: { item: ForecastItem; date: string; balanceAfter: number }[];
  lowest: DayBalance;
};

/**
 * Projects wallet money day by day from `from` for `length` days. Late
 * planned expenses land on the first day.
 */
export function project(
  start: number,
  items: ForecastItem[],
  from: string,
  length: number,
): Projection {
  const until = addDays(from, length);
  const events = items
    .map((item) => ({ item, date: item.dueOn < from ? from : item.dueOn, change: itemEffect(item) }))
    .filter((e) => e.date < until && (e.change !== 0 || (e.item.kind === "payday" && e.item.amount === null)))
    .sort((a, b) => a.date.localeCompare(b.date));

  const rows: Projection["rows"] = [];
  let running = start;
  for (const e of events) {
    running = roundCents(running + e.change);
    rows.push({ item: e.item, date: e.date, balanceAfter: running });
  }

  const days: DayBalance[] = [];
  let balance = start;
  let i = 0;
  for (let d = 0; d < length; d++) {
    const date = addDays(from, d);
    while (i < events.length && events[i].date === date) balance = roundCents(balance + events[i++].change);
    days.push({ date, balance });
  }

  return { days, rows, lowest: lowestOf(days) };
}

function lowestOf(days: DayBalance[]): DayBalance {
  return days.reduce((low, d) => (d.balance < low.balance ? d : low), days[0]);
}

/** The lowest end-of-day balance from `from` up to but not including `until`. */
export function lowestBetween(days: DayBalance[], from: string, until: string): DayBalance | null {
  const window = days.filter((d) => d.date >= from && d.date < until);
  return window.length ? lowestOf(window) : null;
}

export type SafeToSpend = {
  /** Spendable money across cash, bank and e-wallets. */
  inWallets: number;
  /** Unpaid bills and planned expenses from today until the day before payday. */
  dueBeforePayday: number;
  dueCount: number;
  nextPayday: string | null;
  /** Days from today until payday, counting today. */
  daysLeft: number | null;
  /** Wallet money minus what's due, never below 0. */
  free: number;
  /** What's free per day until payday; null without a payday. */
  perDay: number | null;
};

/**
 * Safe to spend: wallet money, minus unpaid bills and planned expenses due
 * before the next payday, spread over the days until then. Pautang, credit
 * limits and loans never count.
 */
export function safeToSpend({
  inWallets,
  payday,
  items,
  today,
}: {
  inWallets: number;
  payday: Schedule | null;
  items: ForecastItem[];
  today: string;
}): SafeToSpend {
  if (!payday) {
    return { inWallets, dueBeforePayday: 0, dueCount: 0, nextPayday: null, daysLeft: null, free: inWallets, perDay: null };
  }
  const nextPayday = nextOccurrence(payday, today);
  const daysLeft = daysBetween(today, nextPayday);
  const due = items.filter((i) => isOwed(i) && i.amount !== null && i.dueOn < nextPayday);
  const dueBeforePayday = roundCents(due.reduce((sum, i) => sum + i.amount!, 0));
  const free = Math.max(0, roundCents(inWallets - dueBeforePayday));
  return {
    inWallets,
    dueBeforePayday,
    dueCount: due.length,
    nextPayday,
    daysLeft,
    free,
    perDay: Math.floor(free / daysLeft),
  };
}

/** `count` monthly dates on the same day as `first`, short months clamped. */
export function monthlyDates(first: string, count: number): string[] {
  const [y, m, d] = first.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const month = m - 1 + i;
    return dateInMonth(y + Math.floor(month / 12), (month % 12) + 1, d);
  });
}

/** Splits an amount into `count` payments; the last absorbs the rounding. */
export function splitAmount(amount: number, count: number): number[] {
  const each = Math.floor((amount / count) * 100) / 100;
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? roundCents(amount - each * (count - 1)) : each,
  );
}

export type Purchase = { name: string; amount: number; first: string; months: number };

/** The purchase as planned expenses: one, or one per installment. */
export function purchaseItems(p: Purchase): ForecastItem[] {
  const amounts = splitAmount(p.amount, p.months);
  return monthlyDates(p.first, p.months).map((date, i) => ({
    key: `purchase|${i}`,
    kind: "planned",
    id: `purchase-${i}`,
    name: p.months > 1 ? `${p.name} (${i + 1} of ${p.months})` : p.name,
    amount: amounts[i],
    dueOn: date,
    accountId: null,
    category: null,
    estimate: false,
    transactionId: null,
  }));
}

export type Verdict = {
  tone: "comfortable" | "tight" | "wait" | "no";
  title: string;
  before: Projection;
  after: Projection;
  /** For "wait": the payday that makes it work. */
  waitUntil?: string;
};

/**
 * Tests a purchase against the forecast. Tight means the low point after
 * buying is under half of what it was.
 */
export function affordVerdict({
  start,
  items,
  purchase,
  today,
  nextPayday,
}: {
  start: number;
  items: ForecastItem[];
  purchase: Purchase;
  today: string;
  nextPayday: string | null;
}): Verdict {
  const last = monthlyDates(purchase.first, purchase.months).at(-1)!;
  const length = Math.min(400, Math.max(60, daysBetween(today, last) + 31));
  const before = project(start, items, today, length);
  const after = project(start, [...items, ...purchaseItems(purchase)], today, length);
  const low = after.lowest.balance;

  if (low >= 0) {
    const tight = low === 0 || low < before.lowest.balance * 0.5;
    return { tone: tight ? "tight" : "comfortable", title: tight ? "Yes, but tight" : "Yes, comfortably", before, after };
  }
  if (nextPayday && purchase.first < nextPayday && before.lowest.balance >= 0) {
    const later = project(start, [...items, ...purchaseItems({ ...purchase, first: nextPayday })], today, length);
    if (later.lowest.balance >= 0) {
      return { tone: "wait", title: "Wait until payday", before, after, waitUntil: nextPayday };
    }
  }
  return { tone: "no", title: "No, you'd go below ₱0", before, after };
}
