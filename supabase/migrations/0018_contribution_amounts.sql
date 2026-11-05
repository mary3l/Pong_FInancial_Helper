-- Your own SSS, PhilHealth and Pag-IBIG amounts. Run once in Supabase after 0017.
--
-- The payroll calculator works these out at the standard self-paying rates.
-- Some companies take a different amount (say, while you're not yet
-- regular), so you can enter what yours actually takes. Null: calculated.

alter table public.payroll_settings
  add column sss_amount        numeric(14, 2) check (sss_amount > 0),
  add column philhealth_amount numeric(14, 2) check (philhealth_amount > 0),
  add column pagibig_amount    numeric(14, 2) check (pagibig_amount > 0);
