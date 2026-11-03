// Money rules shared by the server and the browser. See the design canvas,
// rows 4 and 5, and the comments in supabase/migrations.

/** "person" holds utang and pautang with one person (Phase 4). */
export type AccountType = "cash" | "bank" | "ewallet" | "credit_line" | "loan" | "person";
export type TransactionType = "expense" | "income" | "transfer";

/** Accounts that hold your own money. Credit lines and loans have their own forms. */
export const WALLET_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "ewallet", label: "E-wallet" },
] as const satisfies readonly { value: AccountType; label: string }[];

export type WalletType = (typeof WALLET_TYPES)[number]["value"];

export function isWalletType(value: unknown): value is WalletType {
  return WALLET_TYPES.some((t) => t.value === value);
}

export function accountTypeLabel(type: AccountType): string {
  return (
    WALLET_TYPES.find((t) => t.value === type)?.label ??
    (type === "credit_line" ? "BNPL" : type === "loan" ? "Loan" : "Person")
  );
}

/**
 * What a wallet's money is for, in cashflow terms. Only spending money
 * counts in Safe to spend and the forecast; the rest is still yours (You
 * have, Net worth) but set aside.
 */
export const WALLET_PURPOSES = [
  { value: "spending", label: "Spending" },
  { value: "savings", label: "Savings" },
  { value: "emergency", label: "Emergency fund" },
  { value: "investment", label: "Investments" },
] as const;

export type WalletPurpose = (typeof WALLET_PURPOSES)[number]["value"];

export function isWalletPurpose(value: unknown): value is WalletPurpose {
  return WALLET_PURPOSES.some((p) => p.value === value);
}

export function purposeLabel(purpose: WalletPurpose): string {
  return WALLET_PURPOSES.find((p) => p.value === purpose)?.label ?? "Spending";
}

/** Cash, bank and e-wallet money that's meant for spending: what Safe to spend works from. */
export function countsAsSpending(account: { type: AccountType; purpose: WalletPurpose }): boolean {
  return isSpendable(account.type) && account.purpose === "spending";
}

/** Digital banks (MariBank, GoTyme) and e-wallet savings (Maya, GSave) pay interest daily. */
export function canEarnInterest(type: AccountType): boolean {
  return type === "bank" || type === "ewallet";
}

/** Interest on Philippine deposits has a 20% final withholding tax. */
export const INTEREST_TAX = 0.2;

/**
 * Interest credited for one day on `balance` at `ratePerYear` % a year,
 * after tax. Not rounded: banks round the day's total, so callers round.
 */
export function dailyInterest(balance: number, ratePerYear: number): number {
  if (balance <= 0 || ratePerYear <= 0) return 0;
  return ((balance * ratePerYear) / 100 / 365) * (1 - INTEREST_TAX);
}

/** Interest after tax over `days` days on a steady balance. */
export function interestFor(balance: number, ratePerYear: number, days: number): number {
  return roundCents(dailyInterest(balance, ratePerYear) * Math.max(0, days));
}

/** Credit lines (SPayLater, Atome) and loans (SLoan, MariLoan): money you owe. */
export function isDebt(type: AccountType): boolean {
  return type === "credit_line" || type === "loan";
}

/** Money that's actually yours to spend. Credit limits and loans never count. */
export function isSpendable(type: AccountType): boolean {
  return type === "cash" || type === "bank" || type === "ewallet";
}

/** Largest amount numeric(14, 2) can hold. */
export const MAX_AMOUNT = 999_999_999_999.99;

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Parses a typed peso amount like "1,250.50" or "₱ 300". NaN when it isn't one. */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return NaN;
  return roundCents(Number(cleaned));
}

const WHOLE = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});
const CENTS = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₱1,250", or "₱1,250.50" when there are centavos. */
export function formatPeso(value: number): string {
  const rounded = roundCents(value);
  const text = Number.isInteger(rounded)
    ? WHOLE.format(Math.abs(rounded))
    : CENTS.format(Math.abs(rounded));
  return rounded < 0 ? `−${text}` : text;
}

/**
 * How a transaction changes one account's balance. Transfers move money
 * between your own wallets, so they're never spending, but they still change
 * both balances.
 */
export function balanceEffect(
  txn: {
    type: TransactionType;
    amount: number;
    accountId: string;
    toAccountId: string | null;
  },
  accountId: string,
): number {
  if (txn.type === "transfer") {
    if (txn.toAccountId === accountId) return txn.amount;
    if (txn.accountId === accountId) return -txn.amount;
    return 0;
  }
  if (txn.accountId !== accountId) return 0;
  return txn.type === "income" ? txn.amount : -txn.amount;
}

/** Money in and out for a list of transactions. Transfers count as neither. */
export function cashflow(txns: { type: TransactionType; amount: number }[]) {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const t of txns) {
    if (t.type === "income") moneyIn += t.amount;
    else if (t.type === "expense") moneyOut += t.amount;
  }
  return {
    in: roundCents(moneyIn),
    out: roundCents(moneyOut),
    net: roundCents(moneyIn - moneyOut),
  };
}
