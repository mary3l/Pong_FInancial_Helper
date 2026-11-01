-- Phase 2: Mark paid, planned expenses and budgets per kinsenas.
-- Run once in Supabase after 0002: SQL Editor > New query > paste > Run.
--
-- Mark paid logs the real expense as a transaction and links it here.
-- Deleting that transaction in Activity un-marks the bill or planned expense,
-- so a payment is never counted twice or lost.

-- Composite keys so the tables below can't point at someone else's rows.
alter table public.recurring_items add unique (id, user_id);
alter table public.transactions add unique (id, user_id);

-- One row per bill occurrence that was paid.
create table public.bill_payments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recurring_item_id uuid not null,
  -- The scheduled date this payment covers, not the day it was paid.
  due_on            date not null,
  transaction_id    uuid not null,
  created_at        timestamptz not null default now(),

  foreign key (recurring_item_id, user_id) references public.recurring_items (id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  unique (recurring_item_id, due_on)
);

create index bill_payments_transaction_idx on public.bill_payments (transaction_id);

-- One-off future expenses, added from "Can I afford this?". They count in
-- the forecast and Safe to spend until they're marked paid.
create table public.planned_expenses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 60),
  amount         numeric(14, 2) not null check (amount > 0),
  category       text not null,
  due_on         date not null,
  account_id     uuid,
  -- Set once paid. Null again if that transaction is deleted.
  transaction_id uuid,
  created_at     timestamptz not null default now(),

  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id)
    on delete set null (transaction_id)
);

create index planned_expenses_user_due_idx on public.planned_expenses (user_id, due_on);
create index planned_expenses_account_idx on public.planned_expenses (account_id);
create index planned_expenses_transaction_idx on public.planned_expenses (transaction_id);

-- Spending limit per expense category, per kinsenas. "This month" doubles it.
create table public.budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category   text not null,
  amount     numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category)
);

alter table public.bill_payments enable row level security;
alter table public.planned_expenses enable row level security;
alter table public.budgets enable row level security;

create policy "own bill payments: select" on public.bill_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own bill payments: insert" on public.bill_payments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own bill payments: update" on public.bill_payments
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own bill payments: delete" on public.bill_payments
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own planned expenses: select" on public.planned_expenses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own planned expenses: insert" on public.planned_expenses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own planned expenses: update" on public.planned_expenses
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own planned expenses: delete" on public.planned_expenses
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own budgets: select" on public.budgets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own budgets: insert" on public.budgets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own budgets: update" on public.budgets
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own budgets: delete" on public.budgets
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.bill_payments, public.planned_expenses, public.budgets to authenticated;
