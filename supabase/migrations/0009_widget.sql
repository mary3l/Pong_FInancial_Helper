-- Home screen widget (Scriptable on iPhone). Run once in Supabase after 0008.
--
-- The widget can't sign in, so Settings makes a widget key for it instead.
-- Only a SHA-256 hash of the key is stored. With the key, the widget can read
-- one thing: what you spent today. It can't see balances or change anything.
-- Making a new key replaces the old one; turning the widget off deletes it.

create table public.widget_keys (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  key_hash   text not null unique check (length(key_hash) = 64),
  created_at timestamptz not null default now()
);

alter table public.widget_keys enable row level security;

create policy "own widget key: select" on public.widget_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own widget key: insert" on public.widget_keys
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own widget key: update" on public.widget_keys
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own widget key: delete" on public.widget_keys
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.widget_keys from anon;

-- Today's expenses (Philippine time) for the owner of `widget_key`, or null
-- when the key is wrong. Only expenses count: transfers between your own
-- wallets, lending and paying back are never spending (see 0001 and 0006).
-- security definer so the widget, which isn't signed in, can call it; it
-- only ever reads the rows of the user the key belongs to.
create function public.widget_spent_today(widget_key text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with owner as (
    select user_id
    from public.widget_keys
    where key_hash = encode(sha256(convert_to(widget_key, 'UTF8')), 'hex')
  ),
  day as (
    select (now() at time zone 'Asia/Manila')::date as on_date
  ),
  spent as (
    select t.amount, t.category, t.note, a.name as wallet, t.created_at
    from public.transactions t
    join owner o on o.user_id = t.user_id
    join public.accounts a on a.id = t.account_id
    cross join day d
    where t.type = 'expense' and t.occurred_on = d.on_date
  )
  select json_build_object(
    'date', (select on_date from day),
    'total', coalesce((select sum(amount) from spent), 0),
    'count', (select count(*) from spent),
    'items', coalesce(
      (select json_agg(json_build_object(
                'amount', s.amount, 'category', s.category, 'note', s.note, 'wallet', s.wallet)
              order by s.created_at desc)
       from (select * from spent order by created_at desc limit 8) s),
      '[]'::json)
  )
  where exists (select 1 from owner);
$$;

revoke all on function public.widget_spent_today(text) from public;
grant execute on function public.widget_spent_today(text) to anon, authenticated;
