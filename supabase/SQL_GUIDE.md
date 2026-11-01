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
