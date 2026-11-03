-- Wallet categories and daily interest. Run once in Supabase after 0009.
--
-- purpose: what a wallet's money is for, in cashflow terms. Only 'spending'
--   money counts in Safe to spend and the forecast. Savings, an emergency
--   fund and investments are still yours (You have, Net worth), just set
--   aside. Every wallet you already have starts as 'spending', so nothing
--   changes until you pick another category.
--
-- interest_rate: % a year, for banks and e-wallets that pay interest daily
--   (MariBank, GoTyme, Maya Savings, GSave). Interest is INCOME (category
--   'interest') when you log it; the app only estimates what's built up.
-- interest_since: the day the current rate was set, so the estimate never
--   reaches back before it. The last logged interest moves it forward too.
--
-- BNPL upcoming payments (SPayLater, Atome) need nothing new: they're
-- installment_plans with no source transaction (0005).

alter table public.accounts
  add column purpose text not null default 'spending'
    check (purpose in ('spending', 'savings', 'emergency', 'investment')),
  add column interest_rate numeric(5, 2) check (interest_rate > 0 and interest_rate <= 100),
  add column interest_since date;

-- Only cash, bank and e-wallets have a category; only banks and e-wallets earn interest.
alter table public.accounts
  add constraint accounts_purpose_type_check
    check (purpose = 'spending' or type in ('cash', 'bank', 'ewallet'));
alter table public.accounts
  add constraint accounts_interest_type_check
    check (interest_rate is null or type in ('bank', 'ewallet'));
