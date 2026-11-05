-- The time of day a transaction happened, picked in Add / Edit. Run once in
-- Supabase after 0013.
--
-- Philippine time, like occurred_on. Empty for older records and anything the
-- app logs on its own: those show when they were logged (created_at) instead.

alter table public.transactions add column occurred_time time;
