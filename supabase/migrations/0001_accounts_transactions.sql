-- Phase 0: wallets (accounts) and transactions.
-- Run once in Supabase: SQL Editor > New query > paste > Run.
--
-- Money rules (see the design canvas, rows 4 and 5):
--   expense / income touch one account.
--   transfer moves money between two of YOUR accounts and is never spending.

create table public.accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 60),
  type             text not null check (type in ('cash', 'bank', 'ewallet', 'credit_line', 'loan')),
  starting_balance numeric(14, 2) not null default 0,
  credit_limit     numeric(14, 2) check (credit_limit >= 0),
  due_day          smallint check (due_day between 1 and 31),
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  -- Lets transactions reference (account, owner) so they can't point at
  -- someone else's account. Foreign keys bypass RLS, so this matters.
  unique (id, user_id)
);

create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type          text not null check (type in ('income', 'expense', 'transfer')),
  amount        numeric(14, 2) not null check (amount > 0),
  account_id    uuid not null,
  to_account_id uuid,
  category      text,
  note          text,
  occurred_on   date not null default current_date,
  created_at    timestamptz not null default now(),

  -- Default NO ACTION: an account with transactions can't be deleted (archive
  -- it instead), but deleting the user still cascades cleanly.
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id),

  -- A transfer needs a destination; income and expense must not have one.
  check ((type = 'transfer') = (to_account_id is not null)),
  check (to_account_id is distinct from account_id)
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id);

-- Row-level security: each person sees and changes only their own rows.
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;

create policy "own accounts: select" on public.accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own accounts: insert" on public.accounts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own accounts: update" on public.accounts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own accounts: delete" on public.accounts
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own transactions: select" on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own transactions: insert" on public.transactions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own transactions: update" on public.transactions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own transactions: delete" on public.transactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Current balance per account. security_invoker makes the view obey the
-- caller's RLS, so it only ever sums your own rows.
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.starting_balance
    + coalesce(sum(case
        when t.type = 'income'   and t.account_id    = a.id then t.amount
        when t.type = 'expense'  and t.account_id    = a.id then -t.amount
        when t.type = 'transfer' and t.account_id    = a.id then -t.amount
        when t.type = 'transfer' and t.to_account_id = a.id then t.amount
      end), 0) as balance
from public.accounts a
left join public.transactions t
  on t.account_id = a.id or t.to_account_id = a.id
group by a.id;

grant select, insert, update, delete on public.accounts, public.transactions to authenticated;
grant select on public.account_balances to authenticated;
