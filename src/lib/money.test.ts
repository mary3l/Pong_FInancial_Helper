import { describe, expect, it } from "vitest";
import {
  balanceEffect,
  canEarnInterest,
  cashflow,
  countsAsSpending,
  dailyInterest,
  formatPeso,
  interestEstimate,
  interestFor,
  isDebt,
  isSpendable,
  parseAmount,
  suggestedPayout,
} from "@/lib/money";

const txn = (type: "expense" | "income" | "transfer", amount: number, accountId: string, toAccountId: string | null = null) => ({
  type,
  amount,
  accountId,
  toAccountId,
});

describe("transfers vs expenses", () => {
  it("a transfer moves money between two accounts and is never spending", () => {
    const t = txn("transfer", 500, "gcash", "maribank");
    expect(balanceEffect(t, "gcash")).toBe(-500);
    expect(balanceEffect(t, "maribank")).toBe(500);
    expect(balanceEffect(t, "cash")).toBe(0);
    expect(cashflow([t])).toEqual({ in: 0, out: 0, net: 0 });
  });

  it("an expense only touches its own account and counts as money out", () => {
    const t = txn("expense", 120, "cash");
    expect(balanceEffect(t, "cash")).toBe(-120);
    expect(balanceEffect(t, "gcash")).toBe(0);
    expect(cashflow([t])).toEqual({ in: 0, out: 120, net: -120 });
  });

  it("income adds to its account and counts as money in", () => {
    const t = txn("income", 15000, "bank");
    expect(balanceEffect(t, "bank")).toBe(15000);
    expect(cashflow([t, txn("expense", 2000, "bank")])).toEqual({ in: 15000, out: 2000, net: 13000 });
  });
});

describe("BNPL and loans", () => {
  it("a BNPL purchase is spending now; paying the bill is a transfer, only the fee is spending", () => {
    const purchase = txn("expense", 3000, "spaylater");
    const installment = txn("transfer", 1000, "gcash", "spaylater");
    const fee = txn("expense", 45, "gcash");
    const spaylater = [purchase, installment].reduce((sum, t) => sum + balanceEffect(t, "spaylater"), 0);
    expect(spaylater).toBe(-2000); // still owed
    expect(cashflow([purchase, installment, fee]).out).toBe(3045); // the price once, plus the fee
  });

  it("a loan received is a transfer from the loan account, not income", () => {
    const received = txn("transfer", 20000, "sloan", "maribank");
    expect(balanceEffect(received, "sloan")).toBe(-20000);
    expect(balanceEffect(received, "maribank")).toBe(20000);
    expect(cashflow([received]).in).toBe(0);
  });

  it("only cash, banks and e-wallets are spendable", () => {
    expect(["cash", "bank", "ewallet"].every((t) => isSpendable(t as never))).toBe(true);
    expect(isSpendable("credit_line")).toBe(false);
    expect(isSpendable("loan")).toBe(false);
    expect(isSpendable("person")).toBe(false);
    expect(isDebt("credit_line") && isDebt("loan")).toBe(true);
    expect(isDebt("person")).toBe(false);
  });
});

describe("utang and pautang", () => {
  it("lending is a transfer to the person: not spending, and they owe you", () => {
    const lend = txn("transfer", 1000, "gcash", "ana");
    expect(balanceEffect(lend, "ana")).toBe(1000);
    expect(cashflow([lend])).toEqual({ in: 0, out: 0, net: 0 });
  });

  it("being paid back is a transfer, not income", () => {
    const back = txn("transfer", 400, "ana", "gcash");
    expect(balanceEffect(back, "ana")).toBe(-400);
    expect(cashflow([back]).in).toBe(0);
  });

  it("forgiving the rest is an expense from their account, leaving wallets alone", () => {
    const lend = txn("transfer", 1000, "gcash", "ana");
    const back = txn("transfer", 400, "ana", "gcash");
    const forgive = txn("expense", 600, "ana");
    const all = [lend, back, forgive];
    expect(all.reduce((sum, t) => sum + balanceEffect(t, "ana"), 0)).toBe(0);
    expect(balanceEffect(forgive, "gcash")).toBe(0);
    expect(cashflow(all).out).toBe(600);
  });
});

describe("parsing and formatting", () => {
  it("reads typed peso amounts", () => {
    expect(parseAmount("1,250.50")).toBe(1250.5);
    expect(parseAmount("₱ 300")).toBe(300);
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("1.234")).toBeNaN();
  });

  it("formats pesos with centavos only when there are some", () => {
    expect(formatPeso(1250)).toBe("₱1,250");
    expect(formatPeso(1250.5)).toBe("₱1,250.50");
    expect(formatPeso(-20)).toBe("−₱20");
  });
});

describe("wallet categories", () => {
  it("only spending money counts in Safe to spend", () => {
    expect(countsAsSpending({ type: "ewallet", purpose: "spending" })).toBe(true);
    expect(countsAsSpending({ type: "bank", purpose: "savings" })).toBe(false);
    expect(countsAsSpending({ type: "bank", purpose: "emergency" })).toBe(false);
    expect(countsAsSpending({ type: "bank", purpose: "investment" })).toBe(false);
    // Savings is still your money: it can pay bills and receive transfers.
    expect(isSpendable("bank")).toBe(true);
    expect(countsAsSpending({ type: "credit_line", purpose: "spending" })).toBe(false);
  });
});

describe("daily interest (MariBank, GoTyme)", () => {
  it("is the yearly rate over 365 days, less the 20% final tax", () => {
    // ₱100,000 at 3.65% a year: ₱10 a day before tax, ₱8 after.
    expect(dailyInterest(100_000, 3.65)).toBeCloseTo(8, 10);
    expect(interestFor(100_000, 3.65, 30)).toBe(240);
  });

  it("is nothing on an empty or overdrawn balance, or for no days", () => {
    expect(dailyInterest(0, 4)).toBe(0);
    expect(dailyInterest(-500, 4)).toBe(0);
    expect(interestFor(50_000, 4, 0)).toBe(0);
    expect(interestFor(50_000, 4, -3)).toBe(0);
  });

  it("only banks and e-wallets earn it", () => {
    expect(canEarnInterest("bank") && canEarnInterest("ewallet")).toBe(true);
    expect(canEarnInterest("cash")).toBe(false);
    expect(canEarnInterest("credit_line")).toBe(false);
  });
});

describe("monthly interest (GoTyme Go Save)", () => {
  // ₱100,000 at 3.65% a year: ₱8 a day after tax.
  const goTyme = { balance: 100_000, interestRate: 3.65, interestSince: "2026-10-15", interestPayout: "monthly" as const };

  it("splits what was credited on the 1st from what's building up", () => {
    expect(interestEstimate(goTyme, null, "2026-11-03")).toEqual({
      perDay: 8,
      since: "2026-11-01",
      days: 2,
      amount: 16,
      // Oct 15 to Oct 31: 17 days.
      credited: { on: "2026-11-01", from: "2026-10-15", amount: 136 },
      nextPayout: "2026-12-01",
    });
  });

  it("has nothing to log once the 1st's interest is logged", () => {
    const estimate = interestEstimate(goTyme, "2026-11-01", "2026-11-20");
    expect(estimate.credited).toBeNull();
    expect(estimate).toMatchObject({ since: "2026-11-01", days: 19, amount: 152 });
  });

  it("has nothing credited when the rate was set this month", () => {
    const estimate = interestEstimate({ ...goTyme, interestSince: "2026-11-01" }, null, "2026-11-01");
    expect(estimate).toMatchObject({ credited: null, days: 0, amount: 0, nextPayout: "2026-12-01" });
  });

  it("rolls the next payout over to January", () => {
    expect(interestEstimate(goTyme, "2026-12-01", "2026-12-10").nextPayout).toBe("2027-01-01");
  });

  it("covers every month missed in one credit", () => {
    expect(interestEstimate(goTyme, null, "2026-12-05").credited).toEqual({
      on: "2026-12-01",
      from: "2026-10-15",
      amount: 376, // 17 days in October + 30 in November
    });
  });

  it("leaves daily wallets (MariBank) as they were", () => {
    const mari = { ...goTyme, interestPayout: "daily" as const };
    expect(interestEstimate(mari, "2026-10-31", "2026-11-03")).toEqual({
      perDay: 8,
      since: "2026-10-31",
      days: 3,
      amount: 24,
      credited: null,
      nextPayout: null,
    });
  });

  it("starts a new GoTyme wallet as monthly", () => {
    expect(suggestedPayout("GoTyme Go Save")).toBe("monthly");
    expect(suggestedPayout("go tyme")).toBe("monthly");
    expect(suggestedPayout("MariBank")).toBe("daily");
  });
});
