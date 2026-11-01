# Pong Money

A cashflow helper with Pong the turtle. Next.js 16 (App Router, Cache Components) + Supabase.
Screens and the phased dev plan live on the design canvas.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. In Supabase, open **SQL Editor** and run each file in `supabase/migrations/` in order
   (`0001_accounts_transactions.sql`, then `0002_recurring_items.sql`).
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
- `src/lib/money.ts`, `schedule.ts`, `dates.ts` and `calculator.ts` are pure helpers: money rules,
  Safe to spend, Philippine-time dates and the keypad.
- `src/components/pong.tsx` is Pong, with every mood. Swap the art there.
- `scripts/make-icons.mjs` regenerates the app icons.

## Money rules

Transfers between your own wallets are never spending. See the comments in the migrations.

Safe to spend (basic, Phase 1) = money in cash, bank and e-wallets, minus bills due before the
next payday, divided by the days until payday. Until Mark paid arrives in Phase 2, a bill paid
early still counts as due until its date passes.
