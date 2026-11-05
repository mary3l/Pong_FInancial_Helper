-- Savings goals on wallets, like GoTyme GoalSave. Run once in Supabase after 0015.
--
-- GoTyme lets you open up to 5 GoalSaves, each its own pocket with a name,
-- a target and a deadline. In Pong each one is a wallet (Savings, Emergency
-- fund or Investments) with:
--
-- goal_amount: the target, in pesos.
-- goal_date:   the deadline, optional. With one, Money works out what to
--              put in every day, week or month to get there, counting the
--              wallet's interest (GoTyme: daily on the end balance, added
--              on the 1st after the 20% tax).
--
-- Every wallet you already have starts with no goal, so nothing changes
-- until you set one.

alter table public.accounts
  add column goal_amount numeric(14, 2) check (goal_amount > 0),
  add column goal_date date;

-- Only your own money has a goal, and a deadline needs a target.
alter table public.accounts
  add constraint accounts_goal_type_check
    check (goal_amount is null or type in ('cash', 'bank', 'ewallet'));
alter table public.accounts
  add constraint accounts_goal_date_check
    check (goal_date is null or goal_amount is not null);
