-- Recurring and planned income and expenses (anticipated cashflows).
-- Run once in Supabase after 0003: SQL Editor > New query > paste > Run.
--
-- Payday and bills (0002) become the general case:
--   recurring_items.kind  payday | bill (a recurring expense) | income (any
--                         other recurring income, like a second payroll)
--   planned_expenses.type expense | income, for one-off cashflows you expect,
--                         like a 13th month pay or a tuition payment
--
-- Everything here only feeds the forecast. "Add income" / "Mark paid" logs
-- the real transaction and links it, exactly like Mark paid in 0003.

alter table public.recurring_items drop constraint recurring_items_kind_check;
alter table public.recurring_items
  add constraint recurring_items_kind_check check (kind in ('payday', 'bill', 'income'));

-- Category key from src/lib/categories.ts. Null falls back to Bills for a
-- bill and Salary for pay.
alter table public.recurring_items add column category text;

-- Optional: no occurrences after this date (e.g. tuition until March).
alter table public.recurring_items add column ends_on date;

-- bill_payments (0003) now records any logged occurrence: a bill paid, a
-- payday or recurring income received. The name stays so nothing breaks.
comment on table public.bill_payments is
  'One row per logged occurrence of a recurring item (bill paid, pay or income received).';

alter table public.planned_expenses
  add column type text not null default 'expense' check (type in ('expense', 'income'));

comment on table public.planned_expenses is
  'One-off planned cashflows: type expense (money out) or income (money in).';
