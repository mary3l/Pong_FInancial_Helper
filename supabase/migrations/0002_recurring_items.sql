-- Phase 1: payday and regular bills (onboarding step 1.3).
-- Run once in Supabase after 0001: SQL Editor > New query > paste > Run.
--
-- These power Safe to spend now and the forecast in Phase 2. They are
-- schedules, not money movements: nothing here changes a balance until the
-- user logs the actual income or expense.

create table public.recurring_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('payday', 'bill')),
  name          text not null check (length(trim(name)) between 1 and 60),
  -- Net pay can be left blank; a bill needs an amount (an estimate is fine).
  amount        numeric(14, 2) check (amount > 0),
  amount_varies boolean not null default false,
  -- Payday: the wallet it lands in. Bill: the wallet it's usually paid from.
  account_id    uuid,
  -- weekly:        day1 = weekday, 0 (Sunday) to 6
  -- monthly:       day1 = day of month
  -- twice_monthly: day1 < day2, both days of month (e.g. 15 and 30)
  -- Days past the end of a short month fall on its last day.
  frequency     text not null check (frequency in ('weekly', 'monthly', 'twice_monthly')),
  day1          smallint not null,
  day2          smallint,
  created_at    timestamptz not null default now(),

  foreign key (account_id, user_id) references public.accounts (id, user_id),

  check (kind = 'payday' or amount is not null),
  check (
    (frequency = 'weekly' and day1 between 0 and 6 and day2 is null)
    or (frequency = 'monthly' and day1 between 1 and 31 and day2 is null)
    or (frequency = 'twice_monthly' and day1 between 1 and 31 and day2 between 1 and 31 and day1 < day2)
  )
);

-- One payday schedule per person. "Irregular" pay means no row.
create unique index recurring_items_one_payday_idx on public.recurring_items (user_id) where kind = 'payday';
create index recurring_items_user_idx on public.recurring_items (user_id);
create index recurring_items_account_idx on public.recurring_items (account_id);

alter table public.recurring_items enable row level security;

create policy "own recurring items: select" on public.recurring_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own recurring items: insert" on public.recurring_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own recurring items: update" on public.recurring_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own recurring items: delete" on public.recurring_items
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.recurring_items to authenticated;
