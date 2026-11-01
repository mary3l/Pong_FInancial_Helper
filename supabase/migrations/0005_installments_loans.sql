-- Phase 3: BNPL (SPayLater, Atome), loans (SLoan, MariLoan) and their
-- payment schedules. Run once in Supabase after 0004.
--
-- How it's counted (design canvas row 4):
--   BNPL purchase  = an EXPENSE on the purchase date, paid from the
--                    credit_line account (its balance goes negative: you owe).
--   Installment    = a TRANSFER from GCash/bank to the credit line for the
--                    principal part, plus an EXPENSE for the fee part.
--   Loan received  = a TRANSFER from the loan account into your wallet. Not income.
--   Amortization   = principal part: TRANSFER to the loan account;
--                    interest part: EXPENSE.
--
-- accounts already has the credit_line and loan types, credit_limit and
-- due_day (0001). A credit line or loan balance below 0 is what you owe.

create table public.installment_plans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind                text not null check (kind in ('bnpl', 'loan')),
  -- The credit_line or loan account this plan pays down.
  account_id          uuid not null,
  name                text not null check (length(trim(name)) between 1 and 60),
  principal           numeric(14, 2) not null check (principal > 0),
  fee_total           numeric(14, 2) not null default 0 check (fee_total >= 0),
  months              smallint not null check (months between 1 and 60),
  first_due           date not null,
  -- The wallet installments are usually paid from.
  pay_from_account_id uuid,
  -- BNPL: the purchase expense. Loan: the transfer that brought the money in.
  -- Deleting that transaction in Activity deletes the plan and its schedule.
  source_txn_id       uuid,
  created_at          timestamptz not null default now(),

  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (pay_from_account_id, user_id) references public.accounts (id, user_id),
  foreign key (source_txn_id, user_id) references public.transactions (id, user_id) on delete cascade,
  unique (id, user_id)
);

create index installment_plans_user_idx on public.installment_plans (user_id);
create index installment_plans_account_idx on public.installment_plans (account_id);
create index installment_plans_pay_from_idx on public.installment_plans (pay_from_account_id);
create index installment_plans_source_idx on public.installment_plans (source_txn_id);

-- One row per installment. Paid once a transfer or fee transaction is linked;
-- late when unpaid after due_on. Deleting those transactions un-pays it.
create table public.scheduled_payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id         uuid not null,
  seq             smallint not null check (seq >= 1),
  due_on          date not null,
  amount          numeric(14, 2) not null check (amount > 0),
  principal_part  numeric(14, 2) not null check (principal_part >= 0),
  fee_part        numeric(14, 2) not null default 0 check (fee_part >= 0),
  transfer_txn_id uuid,
  fee_txn_id      uuid,
  created_at      timestamptz not null default now(),

  foreign key (plan_id, user_id) references public.installment_plans (id, user_id) on delete cascade,
  foreign key (transfer_txn_id, user_id) references public.transactions (id, user_id)
    on delete set null (transfer_txn_id),
  foreign key (fee_txn_id, user_id) references public.transactions (id, user_id)
    on delete set null (fee_txn_id),
  unique (plan_id, seq),
  check (amount = principal_part + fee_part)
);

create index scheduled_payments_user_due_idx on public.scheduled_payments (user_id, due_on);
create index scheduled_payments_transfer_idx on public.scheduled_payments (transfer_txn_id);
create index scheduled_payments_fee_idx on public.scheduled_payments (fee_txn_id);

alter table public.installment_plans enable row level security;
alter table public.scheduled_payments enable row level security;

create policy "own installment plans: select" on public.installment_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own installment plans: insert" on public.installment_plans
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own installment plans: update" on public.installment_plans
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own installment plans: delete" on public.installment_plans
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own scheduled payments: select" on public.scheduled_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own scheduled payments: insert" on public.scheduled_payments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own scheduled payments: update" on public.scheduled_payments
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own scheduled payments: delete" on public.scheduled_payments
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.installment_plans, public.scheduled_payments to authenticated;
