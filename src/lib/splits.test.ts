import { describe, expect, it } from "vitest";
import type { Transaction } from "@/lib/data";
import { groupSplits, splitNote, unpaidByRecord } from "@/lib/splits";

const t = (over: Partial<Transaction> & { id: string }): Transaction => ({
  type: "transfer",
  amount: 100,
  accountId: "atome",
  toAccountId: "toni",
  category: null,
  note: null,
  occurredOn: "2026-11-04",
  splitId: null,
  ...over,
});

describe("split bills in lists", () => {
  const mine = t({ id: "m", type: "expense", amount: 121.37, toAccountId: null, category: "food", note: "Chatukchak (my share)", splitId: "s1" });
  const toni = t({ id: "a", amount: 86.37, note: "Split: Chatukchak", splitId: "s1" });
  const aya = t({ id: "b", amount: 91.37, toAccountId: "aya", note: "Split: Chatukchak", splitId: "s1" });
  const coffee = t({ id: "c", type: "expense", amount: 150, toAccountId: null, category: "food" });

  it("folds a split's records into one item where the first one was", () => {
    const items = groupSplits([toni, coffee, aya, mine]);
    expect(items.map((i) => i.kind)).toEqual(["split", "one"]);
    const split = items[0].kind === "split" ? items[0].split : null;
    expect(split?.mine?.id).toBe("m");
    expect(split?.others.map((o) => o.id)).toEqual(["a", "b"]);
    expect(split?.total).toBe(299.11);
    expect(split?.title).toBe("Chatukchak");
    expect(split?.accountId).toBe("atome");
  });

  it("keeps a lone record of a split as a plain row", () => {
    expect(groupSplits([toni, coffee]).map((i) => i.kind)).toEqual(["one", "one"]);
  });

  it("clears a person's oldest pautang first", () => {
    // Newest first: Chatukchak today, lunch last week. Aya paid back ₱100 of ₱243.37.
    const lunch = t({ id: "old", amount: 152, toAccountId: "aya", occurredOn: "2026-10-28" });
    const unpaid = unpaidByRecord([{ id: "aya", balance: 143.37 }], [aya, lunch]);
    expect(unpaid.get("b")).toBe(91.37);
    expect(unpaid.get("old")).toBe(52);
    expect(unpaidByRecord([{ id: "aya", balance: 0 }], [aya]).get("b")).toBe(0);
  });

  it("reads the note from any record, or says Split bill", () => {
    expect(splitNote([toni])).toBe("Chatukchak");
    expect(splitNote([t({ id: "x", note: "Split bill" }), t({ id: "y", type: "expense", note: "My share" })])).toBe("Split bill");
  });
});
