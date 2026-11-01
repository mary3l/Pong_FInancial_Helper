import {
  addDays,
  dateInMonth,
  daysBetween,
  weekdayOf,
} from "@/lib/dates";
import { roundCents } from "@/lib/money";

// Payday and bill schedules (recurring_items). See 0002_recurring_items.sql.

export type Frequency = "weekly" | "monthly" | "twice_monthly";

export type Schedule = {
  frequency: Frequency;
  /** Weekday 0–6 for weekly, else a day of the month. */
  day1: number;
  /** Second day of the month for twice_monthly. */
  day2: number | null;
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function isValidSchedule(s: Schedule): boolean {
  const day = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 31;
  if (s.frequency === "weekly") {
    return Number.isInteger(s.day1) && s.day1 >= 0 && s.day1 <= 6 && s.day2 === null;
  }
  if (s.frequency === "monthly") return day(s.day1) && s.day2 === null;
  if (s.frequency === "twice_monthly") return day(s.day1) && day(s.day2) && s.day1 < s.day2!;
  return false;
}

/** Every date the schedule falls on, from `from` up to but not including `until`. */
export function occurrences(s: Schedule, from: string, until: string): string[] {
  const dates: string[] = [];
  if (from >= until) return dates;

  if (s.frequency === "weekly") {
    let d = addDays(from, (s.day1 - weekdayOf(from) + 7) % 7);
    while (d < until) {
      dates.push(d);
      d = addDays(d, 7);
    }
    return dates;
  }

  const days = s.frequency === "twice_monthly" ? [s.day1, s.day2!] : [s.day1];
  let [year, month] = from.split("-").map(Number);
  for (;;) {
    for (const day of days) {
      const d = dateInMonth(year, month, day);
      if (d >= until) return dates;
      if (d >= from) dates.push(d);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

/** The first date strictly after `date`. Every schedule repeats within 31 days. */
export function nextOccurrence(s: Schedule, date: string): string {
  return occurrences(s, addDays(date, 1), addDays(date, 40))[0];
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "Every Friday", "Every 5th", "Every 15th & 30th" */
export function describeSchedule(s: Schedule): string {
  if (s.frequency === "weekly") return `Every ${WEEKDAYS[s.day1]}`;
  if (s.frequency === "monthly") return `Every ${ordinal(s.day1)}`;
  return `Every ${ordinal(s.day1)} & ${ordinal(s.day2!)}`;
}

export type SafeToSpend = {
  /** Spendable money across cash, bank and e-wallets. */
  inWallets: number;
  /** Bills scheduled from today until the day before payday. */
  dueBeforePayday: number;
  nextPayday: string | null;
  /** Days from today until payday, counting today. */
  daysLeft: number | null;
  /** What's free per day until payday; null without a payday. */
  perDay: number | null;
};

/**
 * Basic Safe to spend (Phase 1): wallet money, minus bills due before the
 * next payday, spread over the days until then. Pautang, credit limits and
 * loans never count. Bills are assumed unpaid until Mark paid arrives in
 * Phase 2, so a bill paid early is subtracted until its due date passes.
 */
export function safeToSpend({
  inWallets,
  payday,
  bills,
  today,
}: {
  inWallets: number;
  payday: Schedule | null;
  bills: { amount: number; schedule: Schedule }[];
  today: string;
}): SafeToSpend {
  if (!payday) {
    return { inWallets, dueBeforePayday: 0, nextPayday: null, daysLeft: null, perDay: null };
  }
  const nextPayday = nextOccurrence(payday, today);
  const daysLeft = daysBetween(today, nextPayday);
  const due = roundCents(
    bills.reduce(
      (sum, b) => sum + b.amount * occurrences(b.schedule, today, nextPayday).length,
      0,
    ),
  );
  const free = inWallets - due;
  return {
    inWallets,
    dueBeforePayday: due,
    nextPayday,
    daysLeft,
    perDay: free > 0 ? Math.floor(free / daysLeft) : 0,
  };
}
