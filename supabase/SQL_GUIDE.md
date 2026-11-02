# Database setup, step by step

Every phase of the app adds tables or columns. Each one is a file in
`supabase/migrations/`. Run them **once each, in order**, in the Supabase SQL Editor.
Pick up from the first step you haven't run yet.

## How to run one file

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. In the left sidebar click **SQL Editor**, then **+ New query** (or the **+** tab).
3. Open the migration file from this folder in your editor, select everything
   (`Ctrl+A`), copy it, and paste it into the query box.
4. Click **Run** (or press `Ctrl+Enter`).
5. You should see **Success. No rows returned**.
6. Paste the **Check** query for that step into a new query and run it. It should
   return what the step says.

If Supabase asks *"This query has destructive operations, run anyway?"*, that's the
`drop constraint` lines that swap a rule for a wider one. No data is deleted; click
**Run this query**.

### If something goes wrong

| Error | What it means | What to do |
| --- | --- | --- |
| `relation "..." already exists` / `column "..." already exists` | That file was already run. | Skip to the next step. |
| `relation "public.xyz" does not exist` | An earlier file wasn't run. | Run the earlier steps first, in order. |
| `constraint "..." does not exist` | The file ran halfway before. | Tell Claude which step and the full error. |
| App shows `Supabase PGRST205` | A table the screen needs is missing. | Run the step that creates it. |

After the last step, reload the app. If a screen still says a table is missing, wait a
few seconds (Supabase refreshes its API cache) and reload again.

---

## Step 1 · Phase 0: wallets and transactions

File: `migrations/0001_accounts_transactions.sql`

Adds `accounts` (your wallets), `transactions` and the `account_balances` view.

**Check**

```sql
select count(*) from information_schema.tables
where table_schema = 'public' and table_name in ('accounts', 'transactions', 'account_balances');
```

Expect `3`.

## Step 2 · Phase 1: payday and bills

File: `migrations/0002_recurring_items.sql`

Adds `recurring_items` (your payday schedule and monthly bills).

**Check**

```sql
select to_regclass('public.recurring_items') is not null as ok;
```

Expect `true`.

## Step 3 · Phase 2: planning

File: `migrations/0003_planning.sql`

Adds `bill_payments` (Mark paid), `planned_expenses` and `budgets`.

**Check**

```sql
select count(*) from information_schema.tables
where table_schema = 'public' and table_name in ('bill_payments', 'planned_expenses', 'budgets');
```

Expect `3`.

## Step 4 · Recurring and planned income & expenses

File: `migrations/0004_scheduled_cashflows.sql`

Powers **Plan › Scheduled**: payroll, allowance, rent, tuition, once or on repeat, with
**Add income** / **Mark paid** to log them in one tap.

- `recurring_items` can now be `income` too, and gets `category` and `ends_on`.
- `planned_expenses` gets `type` (`expense` or `income`), so one-off income like a 13th
  month pay can be planned too.

Supabase will warn about a destructive operation (it swaps the rule for which kinds are
allowed). Click **Run this query**. Nothing is deleted.

**Check**

```sql
select
  (select count(*) from information_schema.columns
   where table_name = 'recurring_items' and column_name in ('category', 'ends_on')) as recurring_columns,
  (select count(*) from information_schema.columns
   where table_name = 'planned_expenses' and column_name = 'type') as planned_columns;
```

Expect `recurring_columns = 2` and `planned_columns = 1`.

## Step 5 · Phase 3: BNPL, loans and digital banks

File: `migrations/0005_installments_loans.sql`

Powers SPayLater / Atome payment plans in Add, **Money › + BNPL**, **Money › + Loan**,
the credit line and loan screens, and installments in Coming up and the forecast.

- `installment_plans`: one row per BNPL purchase or loan.
- `scheduled_payments`: one row per installment, linked to the transfer (and fee
  expense) once you pay it.

MariBank, GoTyme, GCash and Maya need nothing new: add them as normal wallets.

**Check**

```sql
select count(*) from information_schema.tables
where table_schema = 'public' and table_name in ('installment_plans', 'scheduled_payments');
```

Expect `2`.

## Step 6 · Phase 4: utang, pautang and split bills

File: `migrations/0006_people.sql`

Powers **Money › Utang & pautang**, Lend / borrow, the person screen (Record payment,
Send reminder, Forgive), the **Split this bill** toggle in Add, and the overdue nudge
on Home.

- `accounts` can now be of type `person`: each person's balance is what they owe you
  (above 0) or what you owe them (below 0). Adds an optional `contact` column.
- `person_entries`: due date, kind (lend, borrow, split, payment, forgive) and the
  "count it in my forecast" switch for each utang / pautang transaction.

Supabase will warn about a destructive operation (it swaps the rule for which account
types are allowed). Click **Run this query**. Nothing is deleted.

**Check**

```sql
select
  to_regclass('public.person_entries') is not null as entries_table,
  exists (select 1 from information_schema.columns
          where table_name = 'accounts' and column_name = 'contact') as contact_column;
```

Expect `true` and `true`.

## Step 7 · Phase 5: Grocery mode

File: `migrations/0007_grocery.sql`

Powers **Grocery mode** checkout and price memory.

- `products` and `product_prices`: each barcode you've scanned, and what it cost at
  each store, so next time it fills in by itself.
- `grocery_trips` and `grocery_items`: a finished trip and its items, attached to the one
  Groceries expense it saves. Deleting that expense in Activity deletes the trip too.

The trip you're on is kept on your phone until checkout, so nothing is saved here while
you shop.

**Check**

```sql
select count(*) from information_schema.tables
where table_schema = 'public'
  and table_name in ('products', 'product_prices', 'grocery_trips', 'grocery_items');
```

Expect `4`.

## Step 8 · Phase 6: security hardening

File: `migrations/0008_hardening.sql`

No new screens. It tightens per-user data security:

- Signed-out visitors (Supabase's `anon` role) lose all access to the app's tables and
  the balances view. Row-level security already hid everything from them; now the
  grants are gone too, including for tables you add later.
- The balances view is re-confirmed to run with your own rights, so RLS applies.
- Notes and categories have length limits, a credit limit only fits a credit line, and
  only lending, borrowing and splits can carry a due date. These apply to new and edited
  rows; rows you already have are left as they are.

**Check**

```sql
-- Tables in public without row-level security. Expect no rows.
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- Anything signed-out visitors can still touch. Expect no rows.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';
```

Run them one at a time: both should say **Success. No rows returned**.

## Step 9 · Home screen widget

File: `migrations/0009_widget.sql`

Adds `widget_keys` and the `widget_spent_today` function for the iPhone widget
(Settings › Home screen widget). Only a hash of each widget key is stored, and the key can
read one thing: what you spent today.

**Check**

```sql
select to_regclass('public.widget_keys') is not null
   and to_regprocedure('public.widget_spent_today(text)') is not null as ok;
```

Expect `true`.

---

## All done?

This one query shows which steps have been run. Every column should be `true`.

```sql
select
  to_regclass('public.accounts') is not null                as step_1,
  to_regclass('public.recurring_items') is not null         as step_2,
  to_regclass('public.budgets') is not null                 as step_3,
  exists (select 1 from information_schema.columns
          where table_name = 'planned_expenses' and column_name = 'type') as step_4,
  to_regclass('public.scheduled_payments') is not null      as step_5,
  to_regclass('public.person_entries') is not null          as step_6,
  to_regclass('public.grocery_items') is not null           as step_7,
  exists (select 1 from pg_constraint
          where conname = 'accounts_credit_limit_type_check') as step_8,
  to_regclass('public.widget_keys') is not null             as step_9;
```

The first `false` is the step to run next.
