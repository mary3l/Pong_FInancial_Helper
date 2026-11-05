-- Subcategories you type yourself, like Transpo › Jeep or Food › Merienda.
-- Run once in Supabase after 0014.
--
-- There's no list to manage: Add offers the subcategories you've used before
-- in each category, most used first. A subcategory needs a category, so
-- transfers never have one.

alter table public.transactions
  add column subcategory text
    check (subcategory is null or (category is not null and length(subcategory) between 1 and 40));
