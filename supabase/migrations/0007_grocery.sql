-- Phase 5: Grocery mode (scan as you shop). Run once in Supabase after 0006.
--
-- The trip you're on lives on your phone (IndexedDB) so it survives weak
-- signal inside the store and closing the app. Checkout saves it here:
-- ONE Groceries expense for the receipt total, with the items attached, and
-- the prices you scanned go into price memory.

-- Price memory: a barcode you've scanned before, and what it cost where.
create table public.products (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  barcode    text not null check (length(barcode) between 1 and 64),
  name       text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (user_id, barcode),
  unique (id, user_id)
);

create table public.product_prices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null,
  store      text not null check (length(trim(store)) between 1 and 60),
  price      numeric(14, 2) not null check (price > 0),
  seen_at    timestamptz not null default now(),

  foreign key (product_id, user_id) references public.products (id, user_id) on delete cascade
);

create index product_prices_product_idx on public.product_prices (product_id, seen_at desc);
create index product_prices_user_idx on public.product_prices (user_id);

-- A finished trip. Deleting its expense in Activity deletes the trip too.
create table public.grocery_trips (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store          text not null check (length(trim(store)) between 1 and 60),
  budget         numeric(14, 2) check (budget > 0),
  account_id     uuid not null,
  scanned_total  numeric(14, 2) not null check (scanned_total >= 0),
  transaction_id uuid not null unique,
  created_at     timestamptz not null default now(),

  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  unique (id, user_id)
);

create index grocery_trips_user_idx on public.grocery_trips (user_id);
create index grocery_trips_account_idx on public.grocery_trips (account_id);

create table public.grocery_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id    uuid not null,
  -- Null for items with no barcode (pabigat, palengke, loose veg).
  product_id uuid,
  name       text not null check (length(trim(name)) between 1 and 80),
  price      numeric(14, 2) not null check (price > 0),
  qty        smallint not null default 1 check (qty between 1 and 999),

  foreign key (trip_id, user_id) references public.grocery_trips (id, user_id) on delete cascade,
  foreign key (product_id, user_id) references public.products (id, user_id) on delete set null (product_id)
);

create index grocery_items_trip_idx on public.grocery_items (trip_id);
create index grocery_items_product_idx on public.grocery_items (product_id);

alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.grocery_trips enable row level security;
alter table public.grocery_items enable row level security;

create policy "own products: select" on public.products
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own products: insert" on public.products
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own products: update" on public.products
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own products: delete" on public.products
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own product prices: select" on public.product_prices
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own product prices: insert" on public.product_prices
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own product prices: update" on public.product_prices
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own product prices: delete" on public.product_prices
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own grocery trips: select" on public.grocery_trips
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own grocery trips: insert" on public.grocery_trips
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own grocery trips: update" on public.grocery_trips
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own grocery trips: delete" on public.grocery_trips
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own grocery items: select" on public.grocery_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own grocery items: insert" on public.grocery_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own grocery items: update" on public.grocery_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own grocery items: delete" on public.grocery_items
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete
  on public.products, public.product_prices, public.grocery_trips, public.grocery_items
  to authenticated;
