import { addDays, daysBetween } from "@/lib/dates";
import { monthlyDates, splitAmount } from "@/lib/forecast";
import { roundCents } from "@/lib/money";
import { nextOccurrence } from "@/lib/schedule";

// BNPL and loan schedules (design canvas row 4). Pure, so the Add form can
// preview exactly what the server will save. See 0005_installments_loans.sql.

export type PaymentRow = {
  seq: number;
  dueOn: string;
  amount: number;
  /** Paid down by a transfer to the credit line or loan: not spending. */
  principalPart: number;
  /** Fee or interest: an expense. */
  feePart: number;
};

/** Fee for a BNPL plan charged as a flat % of the price per month. */
export function bnplFee(principal: number, ratePerMonth: number, months: number): number {
  return roundCents((principal * ratePerMonth * months) / 100);
}

/** Even monthly payments: principal and fee each split, the last absorbing the rounding. */
export function buildSchedule({
  principal,
  feeTotal,
  months,
  firstDue,
}: {
  principal: number;
  feeTotal: number;
  months: number;
  firstDue: string;
}): PaymentRow[] {
  const principals = splitAmount(principal, months);
  const fees = splitAmount(feeTotal, months);
  return monthlyDates(firstDue, months).map((dueOn, i) => ({
    seq: i + 1,
    dueOn,
    principalPart: principals[i],
    feePart: fees[i],
    amount: roundCents(principals[i] + fees[i]),
  }));
}

/**
 * When a BNPL purchase is first billed: the next due day at least a week
 * after buying (statements need time to close), or a month later when the
 * credit line has no due day saved.
 */
export function bnplFirstDue(purchasedOn: string, dueDay: number | null): string {
  if (!dueDay) return monthlyDates(purchasedOn, 2)[1];
  return nextOccurrence({ frequency: "monthly", day1: dueDay, day2: null }, addDays(purchasedOn, 6));
}

/**
 * The bill an older, unpaid purchase goes on when you add it now: the one
 * after the purchase, or the next one from today if that date has passed.
 */
export function catchUpDue(purchasedOn: string, dueDay: number | null, today: string): string {
  const afterPurchase = bnplFirstDue(purchasedOn, dueDay);
  const nextBill = dueDay ? nextOccurrence({ frequency: "monthly", day1: dueDay, day2: null }, addDays(today, -1)) : today;
  return afterPurchase < nextBill ? nextBill : afterPurchase;
}

export type LoanTerms = {
  /** What landed in your wallet. */
  received: number;
  /** The fixed amortization. */
  monthly: number;
  months: number;
};

export type LoanSummary = {
  total: number;
  /** Interest and fees: what borrowing costs you. */
  interest: number;
  /** Flat rate per month on what you received, in %. */
  ratePerMonth: number;
};

export function loanSummary({ received, monthly, months }: LoanTerms): LoanSummary {
  const total = roundCents(monthly * months);
  const interest = roundCents(Math.max(0, total - received));
  return {
    total,
    interest,
    ratePerMonth: received > 0 && months > 0 ? Math.round((interest / received / months) * 10000) / 100 : 0,
  };
}

/**
 * A loan's amortizations: the principal is split evenly and the rest of
 * each payment is interest. With `alreadyPaid`, only the remaining ones,
 * the first due on `nextDue`.
 */
export function loanSchedule(
  { received, monthly, months }: LoanTerms,
  nextDue: string,
  alreadyPaid = 0,
): PaymentRow[] {
  const principals = splitAmount(received, months);
  const dates = monthlyDates(nextDue, months - alreadyPaid);
  return principals.slice(alreadyPaid).map((principalPart, i) => {
    const feePart = roundCents(Math.max(0, monthly - principalPart));
    return {
      seq: alreadyPaid + i + 1,
      dueOn: dates[i],
      principalPart,
      feePart,
      amount: roundCents(principalPart + feePart),
    };
  });
}

/**
 * A loan you were already paying before adding it here: every due date
 * before today counts as paid, and the next one is when the rest start.
 */
export function runningLoan(firstDue: string, months: number, today: string): { paid: number; nextDue: string } {
  const dates = monthlyDates(firstDue, months);
  const paid = dates.filter((d) => d < today).length;
  return { paid, nextDue: dates[Math.min(paid, months - 1)] };
}

/** "Due in 3 days", "Due today", "3 days late". */
export function dueText(dueOn: string, today: string): string {
  const days = daysBetween(today, dueOn);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `Due in ${days} days`;
  return days === -1 ? "1 day late" : `${-days} days late`;
}

export type UpcomingTerms = {
  /** Each payment, interest or fee included. */
  amount: number;
  /** The interest or fee inside each payment: an expense when paid. */
  fee: number;
  /** The whole installment: 1 for a single bill. */
  months: number;
  /** Payments made before you added it here. */
  alreadyPaid: number;
};

/**
 * An installment already running on SPayLater, Atome or a bank's credit
 * line: the payments still to make, numbered "4 of 6", the next due on
 * `nextDue`.
 */
export function upcomingSchedule({ amount, fee, months, alreadyPaid }: UpcomingTerms, nextDue: string): PaymentRow[] {
  const feePart = roundCents(Math.min(fee, amount));
  const principalPart = roundCents(amount - feePart);
  return monthlyDates(nextDue, months - alreadyPaid).map((dueOn, i) => ({
    seq: alreadyPaid + i + 1,
    dueOn,
    amount: roundCents(principalPart + feePart),
    principalPart,
    feePart,
  }));
}
