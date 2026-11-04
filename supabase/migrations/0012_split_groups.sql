-- One id for every record a split bill makes. Run once in Supabase after 0011.
--
-- A split you paid is several transactions: the EXPENSE for your share and a
-- TRANSFER to each person (see 0006_people.sql). split_id ties them together
-- so Activity can show the bill as one row and open its breakdown.

alter table public.transactions add column split_id uuid;

create index transactions_split_idx on public.transactions (user_id, split_id) where split_id is not null;

-- Splits saved before this step: link each one's transfers (same wallet, day
-- and bill total, saved within a minute of each other) and the "my share"
-- expense that went with them.
with parts as (
  select t.id, t.user_id, t.account_id, t.occurred_on, t.amount, t.created_at, pe.split_total
  from public.transactions t
  join public.person_entries pe on pe.transaction_id = t.id
  where pe.kind = 'split' and t.type = 'transfer' and t.split_id is null
),
bills as (
  select user_id, account_id, occurred_on, split_total,
         gen_random_uuid() as split_id,
         min(created_at) as first_at, max(created_at) as last_at,
         sum(amount) as others
  from parts
  group by user_id, account_id, occurred_on, split_total
  having max(created_at) - min(created_at) < interval '1 minute'
),
linked_transfers as (
  update public.transactions t
  set split_id = b.split_id
  from parts p
  join bills b using (user_id, account_id, occurred_on, split_total)
  where t.id = p.id
  returning t.id
)
update public.transactions t
set split_id = b.split_id
from bills b
where t.split_id is null
  and t.type = 'expense'
  and t.user_id = b.user_id
  and t.account_id = b.account_id
  and t.occurred_on = b.occurred_on
  and t.amount = b.split_total - b.others
  and (t.note = 'My share' or t.note like '% (my share)')
  and t.created_at between b.first_at - interval '1 minute' and b.last_at + interval '1 minute';
