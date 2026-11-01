import { describe, expect, it } from "vitest";
import { bnplFee, bnplFirstDue, buildSchedule, dueText, loanSchedule, loanSummary } from "@/lib/installments";
import { roundCents } from "@/lib/money";

const sum = (values: number[]) => roundCents(values.reduce((a, b) => a + b, 0));

describe("BNPL plans", () => {
  it("charges a flat fee per month on the price", () => {
    expect(bnplFee(3000, 1.5, 3)).toBe(135);
    expect(bnplFee(3000, 0, 3)).toBe(0);
  });

  it("splits principal and fee into monthly payments that add up exactly", () => {
    const rows = buildSchedule({ principal: 1000, feeTotal: 100, months: 3, firstDue: "2026-12-05" });
    expect(rows.map((r) => r.dueOn)).toEqual(["2026-12-05", "2027-01-05", "2027-02-05"]);
    expect(sum(rows.map((r) => r.principalPart))).toBe(1000);
    expect(sum(rows.map((r) => r.feePart))).toBe(100);
    expect(rows.every((r) => r.amount === roundCents(r.principalPart + r.feePart))).toBe(true);
  });

  it("bills on the next due day at least a week after buying", () => {
    expect(bnplFirstDue("2026-11-02", 5)).toBe("2026-12-05");
    expect(bnplFirstDue("2026-11-20", 5)).toBe("2026-12-05");
    expect(bnplFirstDue("2026-11-27", 5)).toBe("2026-12-05");
    expect(bnplFirstDue("2026-11-29", 5)).toBe("2027-01-05");
    expect(bnplFirstDue("2026-01-31", null)).toBe("2026-02-28");
  });
});

describe("loans", () => {
  const terms = { received: 20000, monthly: 1900, months: 12 };

  it("works out total, interest and the flat monthly rate", () => {
    expect(loanSummary(terms)).toEqual({ total: 22800, interest: 2800, ratePerMonth: 1.17 });
  });

  it("splits each amortization into principal (a transfer) and interest (an expense)", () => {
    const rows = loanSchedule(terms, "2026-11-25");
    expect(rows).toHaveLength(12);
    expect(sum(rows.map((r) => r.principalPart))).toBe(20000);
    expect(sum(rows.map((r) => r.feePart))).toBe(2800);
    expect(rows.every((r) => r.amount === 1900)).toBe(true);
  });

  it("skips payments already made and dates the rest from the next due date", () => {
    const rows = loanSchedule(terms, "2027-01-25", 2);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ seq: 3, dueOn: "2027-01-25" });
  });

  it("describes when a payment is due", () => {
    expect(dueText("2026-11-02", "2026-11-02")).toBe("Due today");
    expect(dueText("2026-11-05", "2026-11-02")).toBe("Due in 3 days");
    expect(dueText("2026-10-31", "2026-11-02")).toBe("2 days late");
  });
});
