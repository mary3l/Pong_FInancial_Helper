import type { TransactionType } from "@/lib/money";

// Categories are stored by key so labels and icons can change freely.
// `icon` is a 24×24 stroke path; `tint` is the background class behind it.

export type Category = {
  key: string;
  label: string;
  icon: string;
  tint: string;
};

export const EXPENSE_CATEGORIES: Category[] = [
  { key: "food", label: "Food", tint: "bg-sun-tint", icon: "M3 11h18a9 9 0 0 1-18 0zM8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4" },
  { key: "groceries", label: "Groceries", tint: "bg-sea-tint", icon: "M2 3h3l2.5 12h11L21 7H6M9 20h.01M18 20h.01" },
  { key: "transport", label: "Transpo", tint: "bg-sky-tint", icon: "M6 3h12a2 2 0 0 1 2 2v10H4V5a2 2 0 0 1 2-2zM4 10h16M8 21l1-4M16 21l-1-4" },
  { key: "bills", label: "Bills", tint: "bg-coral-tint", icon: "M13 2 4 14h7l-1 8 9-12h-7z" },
  { key: "load", label: "Load", tint: "bg-plum-tint", icon: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2" },
  { key: "shopping", label: "Shopping", tint: "bg-sun-tint", icon: "M6 8h12l-1 13H7zM9 8V6a3 3 0 0 1 6 0v2" },
  { key: "health", label: "Health", tint: "bg-coral-tint", icon: "M12 20s-7-4.4-9.2-8.7A4.8 4.8 0 0 1 12 6.3a4.8 4.8 0 0 1 9.2 5C19 15.6 12 20 12 20z" },
  { key: "family", label: "Family", tint: "bg-sky-tint", icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5" },
  { key: "fun", label: "Fun", tint: "bg-plum-tint", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" },
  // Forgiven pautang ends up here.
  { key: "gifts", label: "Gifts", tint: "bg-coral-tint", icon: "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z" },
  // BNPL fees and loan interest: the only part of an installment that's spending.
  { key: "fees", label: "Fees & interest", tint: "bg-coral-tint", icon: "M19 5 5 19M7 7h.01M17 17h.01M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" },
  // SSS, PhilHealth, Pag-IBIG and BIR: what the payroll calculator schedules.
  { key: "gov", label: "Gov't & tax", tint: "bg-sky-tint", icon: "M3 10 12 4l9 6M5 10v9M19 10v9M9.5 10v9M14.5 10v9M3 21h18" },
  { key: "other", label: "Other", tint: "bg-line-soft", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

export const INCOME_CATEGORIES: Category[] = [
  { key: "salary", label: "Salary", tint: "bg-sea-tint", icon: "M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" },
  { key: "side_income", label: "Side income", tint: "bg-sun-tint", icon: "M8 21V3h5a5 5 0 0 1 0 10H8M5 7h14M5 10h14" },
  { key: "gift", label: "Gift", tint: "bg-coral-tint", icon: "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z" },
  { key: "refund", label: "Refund", tint: "bg-sky-tint", icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" },
  // Daily interest from MariBank, GoTyme and other digital banks.
  { key: "interest", label: "Interest", tint: "bg-mint", icon: "M12 21v-9M12 12C12 8 9 5 4 5c0 4 3 7 8 7zM12 12c0-3 2.5-6 8-6 0 3.5-2.5 6-8 6z" },
  { key: "other_income", label: "Other", tint: "bg-line-soft", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

export const TRANSFER_ICON: Omit<Category, "key" | "label"> = {
  tint: "bg-line-soft",
  icon: "M7 7h13l-4-4M17 17H4l4 4",
};

export function categoriesFor(type: TransactionType): Category[] {
  if (type === "expense") return EXPENSE_CATEGORIES;
  if (type === "income") return INCOME_CATEGORIES;
  return [];
}

export function isCategoryFor(type: TransactionType, key: unknown): boolean {
  return categoriesFor(type).some((c) => c.key === key);
}

/** Display info for a stored transaction, including old or unknown keys. */
export function categoryInfo(type: TransactionType, key: string | null) {
  if (type === "transfer") return { label: "Transfer", ...TRANSFER_ICON };
  const found = categoriesFor(type).find((c) => c.key === key);
  if (found) return found;
  const fallback = categoriesFor(type).at(-1)!;
  return { ...fallback, label: key ?? (type === "income" ? "Income" : "Expense") };
}
