  -- US dollar wallets and time deposits, like a GoTyme USD Time Deposit.
  -- Run once in Supabase after 0016. Safe to run again if it stopped partway.
  --
  -- currency:   'PHP' (every wallet you already have) or 'USD'. A wallet's
  --             balance and its transactions are in its own currency, so a
  --             USD wallet holds dollars.
  -- fx_rate:    pesos per US$1, which you set on a USD wallet. Pong uses it to
  --             count the dollars in You have and Net worth. Dollars are never
  --             spending money, so a USD wallet is never in Safe to spend.
  -- matures_on: the day a time deposit matures. With interest_payout
  --             'maturity', interest builds up daily and is added on that day.
  --             Interest on dollar deposits has a 15% final tax, not 20%.
  -- to_amount:  on a transfer between a peso and a dollar wallet, what landed
  --             in the destination, in its currency (₱5,800 → $100). Null when
  --             both wallets use the same currency.
  
  alter table public.accounts
    add column if not exists currency text not null default 'PHP',
    add column if not exists fx_rate numeric(10, 4),
    add column if not exists matures_on date;
  
  alter table public.transactions
    add column if not exists to_amount numeric(14, 2);
  
  -- Constraints are dropped first so this can run again.
  alter table public.accounts
    drop constraint if exists accounts_currency_check,
    drop constraint if exists accounts_fx_rate_check,
    drop constraint if exists accounts_currency_type_check,
    drop constraint if exists accounts_usd_fx_rate_check,
    drop constraint if exists accounts_usd_purpose_check,
    drop constraint if exists accounts_interest_payout_check,
    drop constraint if exists accounts_maturity_check;
  
  alter table public.transactions
    drop constraint if exists transactions_to_amount_check,
    drop constraint if exists transactions_to_amount_transfer_check;
  
  alter table public.accounts
    add constraint accounts_currency_check check (currency in ('PHP', 'USD')),
    add constraint accounts_fx_rate_check check (fx_rate > 0),
    -- Only your own money can be in dollars.
    add constraint accounts_currency_type_check
      check (currency = 'PHP' or type in ('cash', 'bank', 'ewallet')),
    -- A USD wallet always has a rate; a peso wallet never does.
    add constraint accounts_usd_fx_rate_check
      check ((currency = 'USD') = (fx_rate is not null)),
    -- Dollars are set aside, never spending money.
    add constraint accounts_usd_purpose_check
      check (currency = 'PHP' or purpose <> 'spending'),
    -- Time deposits pay interest when they mature, so they need the date.
    add constraint accounts_interest_payout_check
      check (interest_payout in ('daily', 'monthly', 'maturity')),
    add constraint accounts_maturity_check
      check (interest_payout <> 'maturity' or matures_on is not null);
  
  alter table public.transactions
    add constraint transactions_to_amount_check check (to_amount > 0),
    add constraint transactions_to_amount_transfer_check check (to_amount is null or type = 'transfer');
  
  -- Transfers between currencies need what landed; dollar wallets don't pay
  -- for things (only balance adjustments come out of one). This guards every
  -- way in, so a dollar can never be counted as a peso.
  create or replace function public.check_transaction_currency()
  returns trigger
  language plpgsql
  set search_path = ''
  as $$
  declare
    from_currency text;
    to_currency text;
  begin
    select currency into from_currency from public.accounts where id = new.account_id;
    if new.to_account_id is not null then
      select currency into to_currency from public.accounts where id = new.to_account_id;
    end if;
  
    if new.type = 'transfer' then
      if from_currency is distinct from to_currency and new.to_amount is null then
        raise exception 'A transfer between pesos and dollars needs the amount that landed'
          using errcode = '23514';
      end if;
      if from_currency is not distinct from to_currency then
        new.to_amount := null;
      end if;
    elsif new.type = 'expense' and from_currency = 'USD' and new.category is distinct from 'adjustment' then
      raise exception 'Dollar wallets can only move money by transfer'
        using errcode = '23514';
    end if;
    return new;
  end;
  $$;
  
  drop trigger if exists transactions_currency_check on public.transactions;
  create trigger transactions_currency_check
    before insert or update on public.transactions
    for each row execute function public.check_transaction_currency();
  
  -- Balances: a transfer adds what landed (to_amount) when it's in another currency.
  create or replace view public.account_balances with (security_invoker = true) as
  select
    a.id as account_id,
    a.user_id,
    a.starting_balance
      + coalesce(sum(case
          when t.type = 'income'   and t.account_id    = a.id then t.amount
          when t.type = 'expense'  and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.account_id    = a.id then -t.amount
          when t.type = 'transfer' and t.to_account_id = a.id then coalesce(t.to_amount, t.amount)
        end), 0) as balance
  from public.accounts a
  left join public.transactions t
    on t.account_id = a.id or t.to_account_id = a.id
  group by a.id;
