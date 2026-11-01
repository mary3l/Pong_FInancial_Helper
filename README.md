# Pong Money

A cashflow helper with Pong the turtle. Next.js 16 (App Router, Cache Components) + Supabase.
Screens and the phased dev plan live on the design canvas.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. In Supabase, open **SQL Editor** and run each file in `supabase/migrations/` once, in
   order. [`supabase/SQL_GUIDE.md`](supabase/SQL_GUIDE.md) walks through it step by step,
   with a check query for each phase.
4. In Supabase, open **Authentication > URL Configuration** and add
   `http://localhost:3000/auth/callback` to **Redirect URLs**.
5. Optional, for "Continue with Google": enable the Google provider under
   **Authentication > Sign In / Providers** (needs a Google Cloud OAuth client).
   Email sign-in links work without this.
6. `npm run dev` and open http://localhost:3000
7. `npm test` runs the money-rule tests in `src/lib/*.test.ts`.

## Layout

- `src/proxy.ts` refreshes the session and sends signed-out visitors to `/login`.
- `src/lib/supabase/` has the browser, server and proxy clients.
- `src/lib/auth.ts` has `getCurrentUser()`. It reads cookies, so call it inside `<Suspense>`.
- `src/app/(app)/` holds the signed-in screens: bottom nav on phones, sidebar from `lg` (1024px) up.
- `src/app/(app)/@modal/(.)add` opens Add over the current page when you tap +. Loading `/add`
  directly shows it as a page. Both render `src/components/transaction-form.tsx`.
- `src/app/setup/` is first-run setup (wallets, then payday and bills). The proxy sends Home there
  until the user finishes or skips it, which sets `setup_done` in their user metadata.
- `src/lib/data.ts` has the reads; `src/app/*-actions.ts` have the writes.
- `src/app/(app)/money/` is Money: wallets, BNPL credit lines and loans (with their
  payment plans in `[id]`), and `people/` for utang & pautang.
- `src/app/(app)/grocery/` is Grocery mode: start a trip, scan (BarcodeDetector, with
  `@zxing/browser` as the fallback for iPhone Safari), check out. The trip in progress lives in
  IndexedDB (`src/lib/active-trip.ts`) until checkout saves one Groceries expense.
- `src/app/(app)/plan/` is Plan: Forecast, Scheduled (recurring and planned income and
  expenses), Can I afford this? and Budgets per kinsenas.
- `src/lib/money.ts`, `schedule.ts`, `forecast.ts`, `dates.ts` and `calculator.ts` are pure helpers:
  money rules, pay and bill schedules, the forecast and Safe to spend, Philippine-time dates and the
  keypad.
- `src/components/pong.tsx` is Pong, with every mood. Swap the art there.
- `scripts/make-icons.mjs` regenerates the app icons.
- `public/sw.js` is the service worker (production only): it caches the hashed build files
  and shows `public/offline.html` when a page is opened with no signal. Pages themselves are
  never cached, since they hold your money data. `experimental.useOffline` makes saves and
  page loads wait and retry while offline, with a banner (`src/components/offline.tsx`).

## Money rules

Transfers between your own wallets are never spending. See the comments in the migrations.

BNPL (SPayLater, Atome): the purchase is an expense on the day you buy, paid from the credit
line, so its balance goes below 0 (what you owe). Each installment is a transfer from a
wallet to the credit line, plus an expense for the fee. Loans (SLoan, MariLoan): the money
received is a transfer from the loan account, never income; each amortization is a transfer
for the principal plus an expense for the interest. `src/lib/installments.ts` has the math.

Utang & pautang: each person is an account of type `person` whose balance is what they owe
you (or, below 0, what you owe them). Lending is a transfer to them, borrowing a transfer
from them, and being paid back a transfer again, so none of it is spending or income. In a
split you paid, only your share is an expense and the rest is pautang; if they paid, your
share is an expense from their account (utang). Forgiving turns what's left into Gifts.
Safe to spend and the forecast never count pautang unless you switch on "Count it in my
forecast", and never once it's late.

Safe to spend = money in cash, bank and e-wallets, minus unpaid bills and expenses due
before the next payday, divided by the days until payday. Income you haven't received yet
never counts. Coming up on Home lists the next 7 days: **Mark paid** logs the real expense
and **Add income** logs the real income, so the item stops counting and the wallet balance
changes instead. Deleting that transaction in Activity un-marks it. Log pay with Add income
(not with +) so it isn't counted twice on payday.

The forecast starts from the same wallet money, adds each payday (if net pay is saved) and
each expected income, and subtracts each unpaid bill and expense on its date.
