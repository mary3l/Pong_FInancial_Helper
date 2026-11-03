-- When a bank pays out its interest. Run once in Supabase after 0010.
--
-- interest_payout: every bank here works interest out daily on the day's
--   end balance, but they credit it differently.
--   'daily':   MariBank, Maya Savings, GSave add it to the balance every day.
--   'monthly': GoTyme Go Save adds the month's interest on the 1st, after
--              the 20% withholding tax.
--   Every wallet you already have starts as 'daily', so nothing changes
--   until you pick monthly.

alter table public.accounts
  add column interest_payout text not null default 'daily'
    check (interest_payout in ('daily', 'monthly'));
