import "server-only";
import { connection } from "next/server";
import { addDays } from "@/lib/dates";
import { scheduledItems, sortItems, type ForecastItem, type ScheduleInputs } from "@/lib/forecast";
import type { PriceMemory } from "@/lib/grocery";
import {
  countsAsSpending,
  isInterestPayout,
  isSpendable,
  isWalletPurpose,
  roundCents,
  type AccountType,
  type InterestPayout,
  type TransactionType,
  type WalletPurpose,
} from "@/lib/money";
import { personItems, type EntryKind, type Person } from "@/lib/people";
import type { Frequency } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

// Reads for the signed-in user. Row-level security limits every query to the
// user's own rows. These read cookies, so callers must sit behind <Suspense>.

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: number;
  /** Below 0 on a credit line or loan: what you owe. */
  balance: number;
  /** Credit lines only. */
  creditLimit: number | null;
  /** Credit lines: the day of the month the bill is due. */
  dueDay: number | null;
  archived: boolean;
  /** Cash, bank and e-wallets: what the money is for. Only "spending" counts in Safe to spend. */
  purpose: WalletPurpose;
  /** Banks and e-wallets that pay daily interest: % a year. */
  interestRate: number | null;
  /** When the current rate was set: interest estimates start here. */
  interestSince: string | null;
  /** When the bank credits it: daily (MariBank) or on the 1st (GoTyme Go Save). */
  interestPayout: InterestPayout;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  toAccountId: string | null;
  category: string | null;
  note: string | null;
  occurredOn: string;
};

export type RecurringItem = {
  id: string;
  /** "bill" is any recurring expense; "income" any recurring income besides payday. */
  kind: "payday" | "bill" | "income";
  name: string;
  amount: number | null;
  amountVaries: boolean;
  accountId: string | null;
  category: string | null;
  frequency: Frequency;
  day1: number;
  day2: number | null;
  endsOn: string | null;
};

export type BillPayment = {
  recurringItemId: string;
  dueOn: string;
  transactionId: string;
};

/** A one-off planned cashflow: money out (expense) or in (income). */
export type PlannedExpense = {
  id: string;
  type: "expense" | "income";
  name: string;
  amount: number;
  category: string;
  dueOn: string;
  accountId: string | null;
  transactionId: string | null;
};

export type Budget = { id: string; category: string; amount: number };

/** A BNPL purchase or a loan, paid down in installments (Phase 3). */
export type InstallmentPlan = {
  id: string;
  kind: "bnpl" | "loan";
  accountId: string;
  name: string;
  principal: number;
  feeTotal: number;
  months: number;
  payFromAccountId: string | null;
  payments: ScheduledPayment[];
};

export type ScheduledPayment = {
  id: string;
  planId: string;
  seq: number;
  dueOn: string;
  amount: number;
  principalPart: number;
  feePart: number;
  /** The transfer or fee transaction once paid; null while unpaid. */
  transactionId: string | null;
};

/** A recent expense, income or transfer to repeat with one tap in Add. */
export type Template = Omit<Transaction, "id" | "occurredOn">;

/**
 * Supabase errors are plain objects; wrap them so error pages and logs show
 * the code and message. PGRST205 means a table is missing: a migration in
 * supabase/migrations hasn't been run yet.
 */
function dbError(error: { code?: string; message: string }) {
  return new Error(`Supabase ${error.code ?? "error"}: ${error.message}`, { cause: error });
}

async function db() {
  // Supabase checks token expiry with Date.now(); see lib/auth.ts.
  await connection();
  return createClient();
}

/**
 * Wallets, credit lines and loans. People (utang and pautang) are accounts
 * too, but only come back with `includePeople`: see getPeople.
 */
export async function getAccounts({ includeArchived = false, includePeople = false } = {}): Promise<Account[]> {
  const supabase = await db();
  const select = (columns: string) => {
    let query = supabase.from("accounts").select(columns).order("created_at");
    if (!includeArchived) query = query.eq("archived", false);
    if (!includePeople) query = query.neq("type", "person");
    return query;
  };
  const base = "id, name, type, starting_balance, credit_limit, due_day, archived";

  const wallet = `${base}, purpose, interest_rate, interest_since`;

  const [first, balances] = await Promise.all([
    select(`${wallet}, interest_payout`),
    supabase.from("account_balances").select("account_id, balance"),
  ]);
  // 42703: migration 0011 (or 0010) hasn't been run yet. Interest is then
  // credited daily, and without 0010 every wallet is spending money.
  const second = first.error?.code === "42703" ? await select(wallet) : first;
  const accounts = second.error?.code === "42703" ? await select(base) : second;
  if (accounts.error) throw dbError(accounts.error);
  if (balances.error) throw dbError(balances.error);

  const balanceById = new Map(
    balances.data.map((b) => [b.account_id as string, Number(b.balance)]),
  );
  return (accounts.data as unknown as AccountRow[]).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type as AccountType,
    startingBalance: Number(a.starting_balance),
    balance: balanceById.get(a.id) ?? Number(a.starting_balance),
    creditLimit: a.credit_limit === null ? null : Number(a.credit_limit),
    dueDay: a.due_day,
    archived: a.archived,
    purpose: isWalletPurpose(a.purpose) ? a.purpose : "spending",
    interestRate: a.interest_rate == null ? null : Number(a.interest_rate),
    interestSince: a.interest_since ?? null,
    interestPayout: isInterestPayout(a.interest_payout) ? a.interest_payout : "daily",
  }));
}

type AccountRow = {
  id: string;
  name: string;
  type: string;
  starting_balance: number | string;
  credit_limit: number | string | null;
  due_day: number | null;
  archived: boolean;
  purpose?: string;
  interest_rate?: number | string | null;
  interest_since?: string | null;
  interest_payout?: string;
};

/** The last day interest was logged on each wallet, by account id. */
export async function getLastInterest(): Promise<Map<string, string>> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("transactions")
    .select("account_id, occurred_on")
    .eq("type", "income")
    .eq("category", "interest")
    .order("occurred_on", { ascending: false })
    .limit(500);
  if (error) throw dbError(error);
  const last = new Map<string, string>();
  for (const row of data) if (!last.has(row.account_id)) last.set(row.account_id, row.occurred_on);
  return last;
}

export async function getRecurringItems(): Promise<RecurringItem[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("recurring_items")
    .select("id, kind, name, amount, amount_varies, account_id, category, frequency, day1, day2, ends_on")
    .order("created_at");
  if (error) throw dbError(error);
  return data.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    amount: r.amount === null ? null : Number(r.amount),
    amountVaries: r.amount_varies,
    accountId: r.account_id,
    category: r.category,
    frequency: r.frequency,
    day1: r.day1,
    day2: r.day2,
    endsOn: r.ends_on,
  }));
}

/** Bill payments for scheduled dates on or after `from`. */
export async function getBillPayments(from: string): Promise<BillPayment[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("bill_payments")
    .select("recurring_item_id, due_on, transaction_id")
    .gte("due_on", from);
  if (error) throw dbError(error);
  return data.map((p) => ({
    recurringItemId: p.recurring_item_id,
    dueOn: p.due_on,
    transactionId: p.transaction_id,
  }));
}

/** Planned items due on or after `from`, plus any still unlogged from before. */
export async function getPlannedExpenses(from: string): Promise<PlannedExpense[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("planned_expenses")
    .select("id, type, name, amount, category, due_on, account_id, transaction_id")
    .or(`due_on.gte.${from},transaction_id.is.null`)
    .order("due_on");
  if (error) throw dbError(error);
  return data.map((p) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    amount: Number(p.amount),
    category: p.category,
    dueOn: p.due_on,
    accountId: p.account_id,
    transactionId: p.transaction_id,
  }));
}

export async function getBudgets(): Promise<Budget[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("budgets")
    .select("id, category, amount")
    .order("created_at");
  if (error) throw dbError(error);
  return data.map((b) => ({ id: b.id, category: b.category, amount: Number(b.amount) }));
}

/**
 * Installment plans with their payments, oldest first. `accountId` limits
 * it to one credit line or loan.
 */
export async function getInstallmentPlans(accountId?: string): Promise<InstallmentPlan[]> {
  const supabase = await db();
  let plans = supabase
    .from("installment_plans")
    .select("id, kind, account_id, name, principal, fee_total, months, pay_from_account_id")
    .order("created_at");
  if (accountId) plans = plans.eq("account_id", accountId);
  const [p, s] = await Promise.all([
    plans,
    supabase
      .from("scheduled_payments")
      .select("id, plan_id, seq, due_on, amount, principal_part, fee_part, transfer_txn_id, fee_txn_id")
      .order("due_on"),
  ]);
  if (p.error) throw dbError(p.error);
  if (s.error) throw dbError(s.error);

  return p.data.map((plan) => ({
    id: plan.id,
    kind: plan.kind,
    accountId: plan.account_id,
    name: plan.name,
    principal: Number(plan.principal),
    feeTotal: Number(plan.fee_total),
    months: plan.months,
    payFromAccountId: plan.pay_from_account_id,
    payments: s.data
      .filter((row) => row.plan_id === plan.id)
      .map((row) => ({
        id: row.id,
        planId: row.plan_id,
        seq: row.seq,
        dueOn: row.due_on,
        amount: Number(row.amount),
        principalPart: Number(row.principal_part),
        feePart: Number(row.fee_part),
        transactionId: row.transfer_txn_id ?? row.fee_txn_id,
      })),
  }));
}

/** Installments as forecast inputs: "Running shoes (2 of 3)". */
export function installmentInputs(plans: InstallmentPlan[]): NonNullable<ScheduleInputs["installments"]> {
  return plans.flatMap((plan) =>
    plan.payments.map((p) => ({
      id: p.id,
      name: plan.months > 1 ? `${plan.name} (${p.seq} of ${plan.months})` : plan.name,
      dueOn: p.dueOn,
      amount: p.amount,
      payFromAccountId: plan.payFromAccountId,
      transactionId: p.transactionId,
    })),
  );
}

/** Everyone with utang or pautang, with their entries. */
export async function getPeople({ includeArchived = false } = {}): Promise<Person[]> {
  const supabase = await db();
  let accounts = supabase
    .from("accounts")
    .select("id, name, contact, starting_balance, archived")
    .eq("type", "person")
    .order("name");
  if (!includeArchived) accounts = accounts.eq("archived", false);
  const [a, b, e] = await Promise.all([
    accounts,
    supabase.from("account_balances").select("account_id, balance"),
    supabase
      .from("person_entries")
      .select("transaction_id, person_id, kind, due_on, count_in_forecast, split_total")
      .order("created_at"),
  ]);
  if (a.error) throw dbError(a.error);
  if (b.error) throw dbError(b.error);
  if (e.error) throw dbError(e.error);

  const balanceById = new Map(b.data.map((row) => [row.account_id as string, Number(row.balance)]));
  return a.data.map((p) => ({
    id: p.id,
    name: p.name,
    contact: p.contact,
    balance: balanceById.get(p.id) ?? Number(p.starting_balance),
    entries: e.data
      .filter((row) => row.person_id === p.id)
      .map((row) => ({
        transactionId: row.transaction_id,
        personId: row.person_id,
        kind: row.kind as EntryKind,
        dueOn: row.due_on,
        countInForecast: row.count_in_forecast,
        splitTotal: row.split_total === null ? null : Number(row.split_total),
      })),
  }));
}

/**
 * When the home screen widget key was made, or null when there's none.
 * `missing` means migration 0009 hasn't been run yet.
 */
export async function getWidgetKey(): Promise<{ createdAt: string } | null | "missing"> {
  const supabase = await db();
  const { data, error } = await supabase.from("widget_keys").select("created_at").maybeSingle();
  if (error?.code === "PGRST205") return "missing";
  if (error) throw dbError(error);
  return data ? { createdAt: data.created_at } : null;
}

/**
 * Grocery mode: price memory (barcode → name and latest price per store),
 * the stores you've shopped at, most recent first.
 */
export async function getPriceMemory(): Promise<{ memory: PriceMemory; stores: string[] }> {
  const supabase = await db();
  const [products, prices, trips] = await Promise.all([
    supabase.from("products").select("id, barcode, name").limit(2000),
    supabase.from("product_prices").select("product_id, store, price").order("seen_at", { ascending: false }).limit(5000),
    supabase.from("grocery_trips").select("store").order("created_at", { ascending: false }).limit(50),
  ]);
  if (products.error) throw dbError(products.error);
  if (prices.error) throw dbError(prices.error);
  if (trips.error) throw dbError(trips.error);

  const memory: PriceMemory = {};
  const byId = new Map(products.data.map((p) => [p.id, p]));
  // Newest first, so the first price seen per store is the latest.
  for (const row of prices.data) {
    const product = byId.get(row.product_id);
    if (!product) continue;
    const entry = (memory[product.barcode] ??= { name: product.name, prices: {}, last: Number(row.price) });
    entry.prices[row.store] ??= Number(row.price);
  }
  return { memory, stores: [...new Set(trips.data.map((t) => t.store as string))] };
}

export type PlanInputs = {
  accounts: Account[];
  /** Spending money in cash, bank and e-wallets right now. */
  inWallets: number;
  /** Savings, emergency fund and investments: yours, but not counted. */
  setAside: number;
  payday: RecurringItem | null;
  /** Everyone with utang or pautang. */
  people: Person[];
  /** Paydays, recurring and planned items, installments and utang from today for `days` days. */
  items: ForecastItem[];
};

/** Everything the forecast, Safe to spend and Due soon work from. */
export async function getPlanInputs(today: string, days: number): Promise<PlanInputs> {
  const [accounts, recurring, billPayments, planned, plans, people] = await Promise.all([
    getAccounts(),
    getRecurringItems(),
    getBillPayments(today),
    getPlannedExpenses(today),
    getInstallmentPlans(),
    getPeople(),
  ]);
  const installments = installmentInputs(plans);
  const until = addDays(today, days);
  return {
    accounts,
    inWallets: roundCents(
      accounts.filter((a) => countsAsSpending(a)).reduce((sum, a) => sum + a.balance, 0),
    ),
    setAside: roundCents(
      accounts
        .filter((a) => isSpendable(a.type) && !countsAsSpending(a))
        .reduce((sum, a) => sum + a.balance, 0),
    ),
    payday: recurring.find((r) => r.kind === "payday") ?? null,
    people,
    items: sortItems([
      ...scheduledItems({ recurring, billPayments, planned, installments }, today, until),
      ...personItems(people, today, until),
    ]),
  };
}

/** Plan › Scheduled: every recurring and planned item, and what's coming. */
export async function getScheduled(today: string) {
  const [accounts, recurring, billPayments, planned] = await Promise.all([
    getAccounts(),
    getRecurringItems(),
    getBillPayments(today),
    getPlannedExpenses(today),
  ]);
  // 45 days covers the next occurrence of every schedule.
  const items = scheduledItems({ recurring, billPayments, planned }, today, addDays(today, 45));
  return { accounts, recurring, planned, items };
}

const TXN_COLUMNS = "id, type, amount, account_id, to_account_id, category, note, occurred_on";

type TxnRow = {
  id: string;
  type: TransactionType;
  amount: number | string;
  account_id: string;
  to_account_id: string | null;
  category: string | null;
  note: string | null;
  occurred_on: string;
};

function toTransaction(r: TxnRow): Transaction {
  return {
    id: r.id,
    type: r.type,
    amount: Number(r.amount),
    accountId: r.account_id,
    toAccountId: r.to_account_id,
    category: r.category,
    note: r.note,
    occurredOn: r.occurred_on,
  };
}

/** Newest first. `from` and `to` are inclusive dates; `accountId` limits it to one account. */
export async function getTransactions({
  from,
  to,
  search,
  limit,
  accountId,
}: {
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  accountId?: string;
} = {}): Promise<Transaction[]> {
  const supabase = await db();
  let query = supabase
    .from("transactions")
    .select(TXN_COLUMNS)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);
  if (accountId) {
    // It goes into a PostgREST filter string, so only ever a uuid.
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) return [];
    query = query.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`);
  }
  if (search) {
    // Strip characters that have meaning in a PostgREST filter.
    const term = search.replace(/[%_,.()*\\:"]/g, " ").trim();
    if (term) query = query.or(`note.ilike.%${term}%,category.ilike.%${term}%`);
  }
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw dbError(error);
  return (data as TxnRow[]).map(toTransaction);
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await db();
  const { data, error } = await supabase
    .from("transactions")
    .select(TXN_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  return data ? toTransaction(data as TxnRow) : null;
}

/**
 * The expenses, income and transfers you log most often lately, most
 * frequent first. Amount, category, wallet and note must all match.
 */
export function templatesFrom(recent: Transaction[], walletIds: Set<string>, max = 4): Template[] {
  const seen = new Map<string, { template: Template; count: number; order: number }>();
  recent.forEach((t, order) => {
    if (!walletIds.has(t.accountId)) return;
    if (t.toAccountId && !walletIds.has(t.toAccountId)) return;
    const key = [t.type, t.amount, t.category, t.accountId, t.toAccountId, t.note ?? ""].join("|");
    const hit = seen.get(key);
    if (hit) hit.count += 1;
    else {
      const template: Template = {
        type: t.type,
        amount: t.amount,
        accountId: t.accountId,
        toAccountId: t.toAccountId,
        category: t.category,
        note: t.note,
      };
      seen.set(key, { template, count: 1, order });
    }
  });
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, max)
    .map((s) => s.template);
}
