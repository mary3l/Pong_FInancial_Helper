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
- `src/app/(app)/plan/` is Plan: Forecast, Scheduled (recurring and planned income and
  expenses), Can I afford this? and Budgets per kinsenas.
- `src/lib/money.ts`, `schedule.ts`, `forecast.ts`, `dates.ts` and `calculator.ts` are pure helpers:
  money rules, pay and bill schedules, the forecast and Safe to spend, Philippine-time dates and the
  keypad.
- `src/components/pong.tsx` is Pong, with every mood. Swap the art there.
- `scripts/make-icons.mjs` regenerates the app icons.

## Money rules

Transfers between your own wallets are never spending. See the comments in the migrations.

Safe to spend = money in cash, bank and e-wallets, minus unpaid bills and expenses due
before the next payday, divided by the days until payday. Income you haven't received yet
never counts. Coming up on Home lists the next 7 days: **Mark paid** logs the real expense
and **Add income** logs the real income, so the item stops counting and the wallet balance
changes instead. Deleting that transaction in Activity un-marks it. Log pay with Add income
(not with +) so it isn't counted twice on payday.

The forecast starts from the same wallet money, adds each payday (if net pay is saved) and
each expected income, and subtracts each unpaid bill and expense on its date.
