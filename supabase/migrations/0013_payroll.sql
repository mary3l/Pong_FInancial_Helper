-- Payroll calculator. Run once in Supabase after 0012.
--
-- Pay is a daily rate × the days you worked in a cutoff (1st–15th, paid on
-- the 15th; 16th–end, paid on the 30th), minus late minutes, plus overtime.
-- No employer deducts anything: SSS, PhilHealth, Pag-IBIG and the 8% income
-- tax are bills you pay yourself. The calculator keeps them in Money going
-- out (payroll_key below) and recalculates them when your pay changes.

-- Your rate and what you pay yourself. One row per person.
create table public.payroll_settings (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  daily_rate      numeric(14, 2) not null check (daily_rate > 0),
  hours_per_day   numeric(4, 2) not null default 8 check (hours_per_day > 0 and hours_per_day <= 24),
  -- Every minute after this on a day you worked is deducted.
  start_time      time not null default '08:00',
  -- 1 = overtime at your hourly rate.
  overtime_rate   numeric(4, 2) not null default 1 check (overtime_rate between 1 and 5),
  -- What contributions are based on. Null: daily rate × 22 days.
  monthly_base    numeric(14, 2) check (monthly_base > 0),
  -- Days before this count as not working.
  started_on      date,
  pay_sss         boolean not null default true,
  pay_philhealth  boolean not null default true,
  pay_pagibig     boolean not null default true,
  pay_tax         boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- A day in a saved cutoff. Days with no row follow the work week:
-- weekdays worked, weekends off.
create table public.payroll_days (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  work_date   date not null,
  status      text not null check (status in ('worked', 'leave', 'off')),
  leave_type  text check (leave_type in ('sick', 'personal')),
  -- The reason for a leave, optional.
  note        text check (note is null or length(note) <= 100),
  -- When you clocked in, on a day you worked. Null = on time.
  time_in     time,

  primary key (user_id, work_date),
  check ((status = 'leave') = (leave_type is not null)),
  check (status = 'leave' or note is null),
  check (status = 'worked' or time_in is null)
);

-- Overtime, by time: 17:00 to 20:00. An end before the start runs past midnight.
create table public.payroll_overtime (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  work_date  date not null,
  starts_at  time not null,
  ends_at    time not null,
  created_at timestamptz not null default now(),

  check (starts_at <> ends_at)
);

create index payroll_overtime_user_date_idx on public.payroll_overtime (user_id, work_date);

-- Bills the calculator manages: 'sss', 'philhealth', 'pagibig' on
-- recurring_items, and '2026-Q3' (income tax) on planned_expenses.
alter table public.recurring_items
  add column payroll_key text check (payroll_key is null or length(payroll_key) <= 20);
alter table public.recurring_items
  add constraint recurring_items_payroll_key_unique unique (user_id, payroll_key);
alter table public.planned_expenses
  add column payroll_key text check (payroll_key is null or length(payroll_key) <= 20);
alter table public.planned_expenses
  add constraint planned_expenses_payroll_key_unique unique (user_id, payroll_key);

-- Row-level security: your own rows only.
alter table public.payroll_settings enable row level security;
alter table public.payroll_days enable row level security;
alter table public.payroll_overtime enable row level security;

create policy "own payroll settings" on public.payroll_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own payroll days" on public.payroll_days
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own payroll overtime" on public.payroll_overtime
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.payroll_settings, public.payroll_days, public.payroll_overtime to authenticated;
revoke all on public.payroll_settings, public.payroll_days, public.payroll_overtime from anon;
