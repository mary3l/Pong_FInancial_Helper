import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DisplayNameForm } from "@/components/display-name-form";
import { ForecastChart } from "@/components/forecast-chart";
import { LogButton } from "@/components/log-button";
import { Pong, type PongMood } from "@/components/pong";
import { TransactionList } from "@/components/transaction-list";
import { getCurrentUser } from "@/lib/auth";
import { getPlanInputs, getTransactions, type Account } from "@/lib/data";
import {
  addDays,
  formatLongDay,
  formatRelativeDay,
  formatShortDay,
  today as getToday,
} from "@/lib/dates";
import { itemLabel, project, safeToSpend, type ForecastItem, type SafeToSpend } from "@/lib/forecast";
import { accountTypeLabel, formatPeso, isDebt, isSpendable, roundCents } from "@/lib/money";

// Design canvas 2.1: Safe to spend (with its breakdown), Coming up (bills and
// expenses with Mark paid, pay and income with Add income), the next 30 days,
// wallet balances and recent activity.
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
          aria-label="Settings and tools"
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
  // Read the clock only at request time (Cache Components).
  await connection();
  const today = getToday();
  const [{ accounts, inWallets, payday, items }, recent] = await Promise.all([
    getPlanInputs(today, 30),
    getTransactions({ limit: 6 }),
  ]);
  const sts = safeToSpend({ inWallets, payday, items, today });
  const forecast = project(inWallets, items, today, 30);
  const pong = pongSays(sts, accounts.length > 0, today);
  // Everything scheduled in the next 7 days, plus late planned items.
  const weekOut = addDays(today, 7);
  const dueSoon = items.filter((i) => i.dueOn < weekOut && (i.dueOn >= today || !i.transactionId));
  const hasScheduled = items.some((i) => i.kind !== "planned");
  const wallets = accounts.filter((a) => isSpendable(a.type));
  const owed = roundCents(accounts.filter((a) => isDebt(a.type)).reduce((sum, a) => sum + Math.max(0, -a.balance), 0));

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

        <section aria-labelledby="due-heading" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 id="due-heading" className="font-display text-xl font-semibold">Coming up</h2>
            <Link href="/plan/scheduled" className="text-sm font-extrabold text-sea">Scheduled ›</Link>
          </div>
          <div className="rounded-[20px] bg-white px-4 py-1.5">
            {dueSoon.length ? (
              <ul className="flex flex-col">
                {dueSoon.map((item) => (
                  <DueRow key={item.key} item={item} accounts={accounts} today={today} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[15px] text-muted">
                {hasScheduled ? (
                  "Nothing coming in or going out in the next 7 days."
                ) : (
                  <>
                    Nothing scheduled yet.{" "}
                    <Link href="/plan/scheduled" className="font-extrabold text-sea-dark underline">
                      Add bills, payroll and other income
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="wallets-heading" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 id="wallets-heading" className="font-display text-xl font-semibold">Wallets</h2>
            <Link href="/money" className="text-sm font-extrabold text-sea">Money ›</Link>
          </div>
          <div className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
            {wallets.length ? (
              wallets.map((a) => (
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
            {owed > 0 && (
              <Link href="/money" className="flex items-center justify-between gap-3 py-2.5 text-ink">
                <span className="flex flex-col">
                  <span className="font-bold">You owe</span>
                  <span className="text-[13px] text-muted">BNPL and loans</span>
                </span>
                <span className="font-display text-[17px] font-semibold text-coral-text">{formatPeso(owed)}</span>
              </Link>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-5">
        {accounts.length > 0 && (
          <Link
            href="/plan"
            className="flex flex-col gap-2.5 rounded-[20px] bg-white px-4 py-3.5 text-ink hover:ring-2 hover:ring-sea-tint"
          >
            <span className="flex items-baseline justify-between">
              <span className="font-display text-xl font-semibold">Next 30 days</span>
              <span className="text-sm font-extrabold text-sea">Forecast ›</span>
            </span>
            <ForecastChart
              days={forecast.days}
              low={forecast.lowest}
              paydays={items.filter((i) => i.kind === "payday").map((i) => i.dueOn)}
              height={64}
              label={`Projected balance for the next 30 days. Lowest ${formatPeso(forecast.lowest.balance)} on ${formatShortDay(forecast.lowest.date, today)}.`}
            />
            <span className="text-[15px]">
              Lowest:{" "}
              <strong className={forecast.lowest.balance < 0 ? "text-coral-text" : ""}>
                {formatPeso(forecast.lowest.balance)} on {formatShortDay(forecast.lowest.date, today)}
              </strong>
              {sts.nextPayday && forecast.lowest.date === addDays(sts.nextPayday, -1) && ", the day before payday"}
            </span>
          </Link>
        )}

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
    </div>
  );
}

function DueRow({ item, accounts, today }: { item: ForecastItem; accounts: Account[]; today: string }) {
  const paid = Boolean(item.transactionId);
  const late = item.dueOn < today && !paid;
  const wallet = accounts.find((a) => a.id === item.accountId);
  const incoming = item.flow === "in";
  const meta = [
    itemLabel(item),
    late ? `Late, was ${formatShortDay(item.dueOn, today)}` : formatRelativeDay(item.dueOn, today),
    wallet && `${incoming ? "to" : "from"} ${wallet.name}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate font-bold ${paid ? "text-muted line-through" : ""}`}>{item.name}</span>
        <span className={`text-[13px] ${late ? "font-bold text-coral-text" : "text-muted"}`}>{meta}</span>
      </span>
      <span className={`font-display text-[17px] font-semibold ${paid ? "text-muted line-through" : incoming ? "text-sea" : ""}`}>
        {item.estimate && !paid && (
          <>
            <span aria-hidden="true">~</span>
            <span className="sr-only">about </span>
          </>
        )}
        {item.amount === null ? "₱?" : `${incoming ? "+" : ""}${formatPeso(item.amount)}`}
      </span>
      <LogButton item={item} />
    </li>
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
        <details className="group relative">
          <summary className="flex h-11 w-fit cursor-pointer list-none items-center text-[15px] font-extrabold text-white underline underline-offset-4 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">How is this computed?</span>
            <span className="hidden group-open:inline">Hide breakdown</span>
          </summary>
          <dl className="flex flex-col gap-1.5 rounded-[18px] bg-sea-dark px-4 py-3.5 text-[15px]">
            <BreakdownLine label="In your wallets" value={formatPeso(sts.inWallets)} />
            <BreakdownLine label={`− Due before payday (${sts.dueCount})`} value={formatPeso(sts.dueBeforePayday)} />
            <BreakdownLine
              label={`= Free until ${formatShortDay(sts.nextPayday!, today)}`}
              value={formatPeso(sts.free)}
              strong
              divider
            />
            <BreakdownLine
              label={`÷ ${sts.daysLeft} ${sts.daysLeft === 1 ? "day" : "days"}`}
              value={`${formatPeso(sts.perDay!)} / day`}
              strong
            />
          </dl>
          <p className="pt-2 text-[13px] leading-snug text-sea-text">
            Only cash, bank and e-wallets count. Pautang, credit limits and loans never do,
            and neither does income you haven&apos;t received yet. A bill stops counting once
            you mark it paid.
          </p>
        </details>
      )}
    </section>
  );
}

function BreakdownLine({
  label,
  value,
  strong = false,
  divider = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  divider?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-extrabold" : ""} ${divider ? "border-t border-sea-light pt-1.5" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
      message: `What's due before payday is more than what's in your wallets. Let's go easy until ${formatShortDay(sts.nextPayday, today)}.`,
      link: { href: "/plan", label: "See forecast" },
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
