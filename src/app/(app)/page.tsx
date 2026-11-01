import Link from "next/link";
import { Suspense } from "react";
import { DisplayNameForm } from "@/components/display-name-form";
import { Pong, type PongMood } from "@/components/pong";
import { TransactionList } from "@/components/transaction-list";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts, getRecurringItems, getTransactions } from "@/lib/data";
import { formatLongDay, formatShortDay, today as getToday } from "@/lib/dates";
import { accountTypeLabel, formatPeso, isSpendable, roundCents } from "@/lib/money";
import { safeToSpend, type SafeToSpend } from "@/lib/schedule";

// Design canvas 2.1: Safe to spend, wallet balances and recent activity.
export default function HomePage() {
  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

async function Header() {
  const user = await getCurrentUser();
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-muted">{formatLongDay(getToday())}</span>
          <h1 className="font-display text-2xl font-semibold lg:text-3xl">
            {user.name ? `Kumusta, ${user.name}!` : "Kumusta!"}
          </h1>
        </div>
        <Link
          href="/settings"
          aria-label="Settings and account"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sun font-display text-lg font-semibold text-ink"
        >
          {user.name ? user.name.charAt(0).toUpperCase() : <PersonIcon />}
        </Link>
      </div>

      {!user.name && (
        <section className="rounded-3xl bg-white p-5">
          <DisplayNameForm
            initialName={null}
            label="What should I call you?"
            hint="Pick any name or nickname. You can change it later in Settings."
          />
        </section>
      )}
    </>
  );
}

async function Dashboard() {
  const [accounts, items, recent] = await Promise.all([
    getAccounts(),
    getRecurringItems(),
    getTransactions({ limit: 6 }),
  ]);
  const today = getToday();
  const payday = items.find((i) => i.kind === "payday") ?? null;
  const sts = safeToSpend({
    inWallets: roundCents(
      accounts.filter((a) => isSpendable(a.type)).reduce((sum, a) => sum + a.balance, 0),
    ),
    payday,
    bills: items
      .filter((i) => i.kind === "bill" && i.amount !== null)
      .map((b) => ({ amount: b.amount!, schedule: b })),
    today,
  });
  const pong = pongSays(sts, accounts.length > 0, today);

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-5">
        <div className="flex items-end gap-1">
          <Pong mood={pong.mood} size={92} decorative />
          <p className="relative mb-5 flex-1 rounded-[20px_20px_20px_6px] bg-white px-3.5 py-3 text-[15px] leading-relaxed shadow-[0_2px_0_var(--color-line)]">
            {pong.message}{" "}
            {pong.link && (
              <Link href={pong.link.href} className="font-extrabold text-sea-dark underline">
                {pong.link.label}
              </Link>
            )}
          </p>
        </div>

        <SafeToSpendCard sts={sts} today={today} />

        <section aria-labelledby="wallets-heading" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 id="wallets-heading" className="font-display text-xl font-semibold">Wallets</h2>
            <Link href="/money" className="text-sm font-extrabold text-sea">Money ›</Link>
          </div>
          <div className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
            {accounts.length ? (
              accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 last:border-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-bold">{a.name}</span>
                    <span className="text-[13px] text-muted">{accountTypeLabel(a.type)}</span>
                  </span>
                  <span className={`font-display text-[17px] font-semibold ${a.balance < 0 ? "text-coral-text" : ""}`}>
                    {formatPeso(a.balance)}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-3 text-[15px] text-muted">
                No wallets yet. <Link href="/money" className="font-extrabold text-sea-dark underline">Add one</Link>
              </p>
            )}
          </div>
        </section>
      </div>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-heading" className="font-display text-xl font-semibold">Recent activity</h2>
          <Link href="/activity" className="text-sm font-extrabold text-sea">See all ›</Link>
        </div>
        <div className="rounded-[20px] bg-white px-4 py-1.5">
          {recent.length ? (
            <TransactionList transactions={recent} accounts={accounts} today={today} grouped={false} />
          ) : (
            <p className="py-3 text-[15px] text-muted">
              Nothing logged yet. Tap <strong className="text-ink">+</strong> to add your first expense.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SafeToSpendCard({ sts, today }: { sts: SafeToSpend; today: string }) {
  const hasPayday = sts.perDay !== null && sts.nextPayday;
  return (
    <section className="relative flex flex-col gap-1.5 overflow-hidden rounded-[28px] bg-sea p-6 text-white lg:p-7">
      <div aria-hidden="true" className="absolute -top-12 -right-10 h-40 w-40 rounded-full bg-sea-light" />
      <h2 className="relative text-sm font-bold text-sea-text">
        {hasPayday ? "SAFE TO SPEND TODAY" : "IN YOUR WALLETS"}
      </h2>
      <p className="relative font-display text-5xl leading-none font-semibold lg:text-6xl">
        {formatPeso(hasPayday ? sts.perDay! : sts.inWallets)}
      </p>
      <p className="relative text-[15px] text-sea-text">
        {hasPayday
          ? `a day until payday on ${formatShortDay(sts.nextPayday!, today)} · ${sts.daysLeft} ${sts.daysLeft === 1 ? "day" : "days"} left`
          : "Set your payday to see a daily amount."}
      </p>
      {hasPayday && (
        <div className="relative mt-2.5 grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5 rounded-[14px] bg-sea-dark px-3 py-2.5">
            <span className="text-xs text-sea-text">In wallets</span>
            <span className="font-display text-lg font-semibold">{formatPeso(sts.inWallets)}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-[14px] bg-sea-dark px-3 py-2.5">
            <span className="text-xs text-sea-text">Bills before payday</span>
            <span className="font-display text-lg font-semibold">{formatPeso(sts.dueBeforePayday)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function pongSays(
  sts: SafeToSpend,
  hasWallets: boolean,
  today: string,
): { mood: PongMood; message: string; link?: { href: string; label: string } } {
  if (!hasWallets) {
    return {
      mood: "ask",
      message: "Add your wallets and payday, and I'll work out how much you can safely spend each day.",
      link: { href: "/setup", label: "Set up wallets" },
    };
  }
  if (!sts.nextPayday || sts.perDay === null) {
    return {
      mood: "listen",
      message: "When's payday? Tell me and I'll spread your money across the days until then.",
      link: { href: "/setup/payday?from=settings", label: "Set payday" },
    };
  }
  if (sts.perDay === 0) {
    return {
      mood: "worried",
      message: `Bills before payday are more than what's in your wallets. Let's go easy until ${formatShortDay(sts.nextPayday, today)}.`,
    };
  }
  if (sts.daysLeft === 1) {
    return { mood: "proud", message: "Payday's tomorrow! You made it, kaya natin 'to." };
  }
  return {
    mood: "happy",
    message: `Payday's in ${sts.daysLeft} days. Stay under ${formatPeso(sts.perDay)} a day and you're set.`,
  };
}

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3" aria-hidden="true">
      <div className="h-8 w-48 rounded-lg bg-line-soft" />
      <div className="h-11 w-11 rounded-full bg-line-soft" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="h-24 rounded-[20px] bg-line-soft" />
      <div className="h-44 rounded-[28px] bg-line-soft" />
      <div className="h-40 rounded-[20px] bg-line-soft" />
    </div>
  );
}
