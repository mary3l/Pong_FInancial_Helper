-- Phase 6: per-user data security review. Run once in Supabase after 0007.
--
-- Every table already has row-level security with policies for the signed-in
-- owner only, and composite (id, user_id) foreign keys so a row can never
-- point at someone else's. This closes the remaining gaps.

-- 1. Signed-out visitors (the anon role) get no access at all. RLS already
--    returned nothing to them; now the grants are gone too.
revoke all on
  public.accounts,
  public.transactions,
  public.recurring_items,
  public.bill_payments,
  public.planned_expenses,
  public.budgets,
  public.installment_plans,
  public.scheduled_payments,
  public.person_entries,
  public.products,
  public.product_prices,
  public.grocery_trips,
  public.grocery_items,
  public.account_balances
from anon;

-- Tables added later in the SQL Editor don't get anon access by default.
alter default privileges in schema public revoke all on tables from anon;

-- 2. The balances view must run with the caller's rights, so RLS applies.
alter view public.account_balances set (security_invoker = true);

-- 3. Keep stored text bounded. NOT VALID: new and edited rows are checked;
--    rows you already have are left alone.
alter table public.transactions
  add constraint transactions_note_length_check check (note is null or length(note) <= 200) not valid;
alter table public.transactions
  add constraint transactions_category_length_check check (category is null or length(category) <= 40) not valid;
alter table public.recurring_items
  add constraint recurring_items_category_length_check check (category is null or length(category) <= 40) not valid;
alter table public.planned_expenses
  add constraint planned_expenses_category_length_check check (length(category) <= 40) not valid;

-- 4. A credit limit only makes sense on a credit line.
alter table public.accounts
  add constraint accounts_credit_limit_type_check check (credit_limit is null or type = 'credit_line') not valid;

-- 5. Only lending, borrowing and splits carry a due date.
alter table public.person_entries
  add constraint person_entries_kind_due_check check (kind in ('lend', 'borrow', 'split') or due_on is null) not valid;
