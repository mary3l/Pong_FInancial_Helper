import "server-only";
import { connection } from "next/server";
import { type AccountType, type TransactionType } from "@/lib/money";
import type { Frequency } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

// Reads for the signed-in user. Row-level security limits every query to the
// user's own rows. These read cookies, so callers must sit behind <Suspense>.

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: number;
  balance: number;
  archived: boolean;
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
  kind: "payday" | "bill";
  name: string;
  amount: number | null;
  amountVaries: boolean;
  accountId: string | null;
  frequency: Frequency;
  day1: number;
  day2: number | null;
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

export async function getAccounts({ includeArchived = false } = {}): Promise<Account[]> {
  const supabase = await db();
  let query = supabase
    .from("accounts")
    .select("id, name, type, starting_balance, archived")
    .order("created_at");
  if (!includeArchived) query = query.eq("archived", false);

  const [accounts, balances] = await Promise.all([
    query,
    supabase.from("account_balances").select("account_id, balance"),
  ]);
  if (accounts.error) throw dbError(accounts.error);
  if (balances.error) throw dbError(balances.error);

  const balanceById = new Map(
    balances.data.map((b) => [b.account_id as string, Number(b.balance)]),
  );
  return accounts.data.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type as AccountType,
    startingBalance: Number(a.starting_balance),
    balance: balanceById.get(a.id) ?? Number(a.starting_balance),
    archived: a.archived,
  }));
}

export async function getRecurringItems(): Promise<RecurringItem[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("recurring_items")
    .select("id, kind, name, amount, amount_varies, account_id, frequency, day1, day2")
    .order("created_at");
  if (error) throw dbError(error);
  return data.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    amount: r.amount === null ? null : Number(r.amount),
    amountVaries: r.amount_varies,
    accountId: r.account_id,
    frequency: r.frequency,
    day1: r.day1,
    day2: r.day2,
  }));
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

/** Newest first. `from` and `to` are inclusive dates. */
export async function getTransactions({
  from,
  to,
  search,
  limit,
}: {
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
} = {}): Promise<Transaction[]> {
  const supabase = await db();
  let query = supabase
    .from("transactions")
    .select(TXN_COLUMNS)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);
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
