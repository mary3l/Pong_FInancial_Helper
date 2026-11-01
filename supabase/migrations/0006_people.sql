-- Phase 4: utang (you owe), pautang (owed to you) and split bills.
-- Run once in Supabase after 0005.
--
-- Each person is an account of type 'person': their balance is what they
-- owe you (above 0) or what you owe them (below 0). That way the money rules
-- from 0001 hold without exceptions (design canvas row 5):
--
--   Lend (pautang)      TRANSFER wallet -> person. Not spending: still your money.
--   Borrow (utang)      TRANSFER person -> wallet. Not income.
--   Paid back           TRANSFER person -> wallet (or wallet -> person). Partial OK.
--   Split, you paid     EXPENSE for your share from your wallet, and a TRANSFER
--                       wallet -> person for each person's share.
--   Split, they paid    EXPENSE for your share, from that person's account.
--   Forgive             The rest becomes an EXPENSE (Gifts) from their account.
--
-- Person accounts never count as spendable money, so Safe to spend and the
-- forecast ignore pautang until it's actually paid back.

alter table public.accounts drop constraint accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('cash', 'bank', 'ewallet', 'credit_line', 'loan', 'person'));

-- Optional: a phone number or handle, for reminders.
alter table public.accounts add column contact text check (contact is null or length(contact) <= 100);

-- Details for each utang / pautang transaction: what kind it is, when it's
-- due, and whether to count on it in the forecast. Deleting the transaction
-- in Activity deletes its entry.
create table public.person_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id    uuid not null unique,
  -- The person's account.
  person_id         uuid not null,
  kind              text not null check (kind in ('lend', 'borrow', 'split', 'payment', 'forgive')),
  -- When they promised to pay (pautang) or you promised to (utang).
  due_on            date,
  -- Off by default: the app won't count on money until it's paid back.
  count_in_forecast boolean not null default false,
  -- For splits: the whole bill, so history can say "her share of ₱900".
  split_total       numeric(14, 2) check (split_total > 0),
  created_at        timestamptz not null default now(),

  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  foreign key (person_id, user_id) references public.accounts (id, user_id) on delete cascade
);

create index person_entries_user_idx on public.person_entries (user_id);
create index person_entries_person_idx on public.person_entries (person_id);

alter table public.person_entries enable row level security;

create policy "own person entries: select" on public.person_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own person entries: insert" on public.person_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own person entries: update" on public.person_entries
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own person entries: delete" on public.person_entries
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.person_entries to authenticated;
