import { describe, expect, it } from "vitest";
import { balanceEffect, cashflow, formatPeso, isDebt, isSpendable, parseAmount } from "@/lib/money";

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
