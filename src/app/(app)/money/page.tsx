import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronIcon } from "@/components/icons";
import { getAccounts, getInstallmentPlans, getPeople, getRecurringItems, type Account, type InstallmentPlan } from "@/lib/data";
import { formatShortDay, today as getToday } from "@/lib/dates";
import { formatPeso, isDebt, isSpendable, roundCents } from "@/lib/money";
import { MoneyTabs } from "./money-tabs";
import { WalletManager } from "./wallet-manager";

export const metadata = { title: "Money · Pong Money" };

// Design canvas 4.1: money you have (cash, banks like MariBank and GoTyme,
// e-wallets like GCash and Maya) and money you owe (SPayLater, Atome, SLoan,
// MariLoan), with net worth.
export default function MoneyPage() {
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <h1 className="font-display text-3xl font-semibold">Money</h1>
      <MoneyTabs current="wallets" />
      <Suspense fallback={<div className="h-80 rounded-[20px] bg-line-soft" />}>
        <Wallets />
      </Suspense>
    </div>
  );
}

async function Wallets() {
  // Read the clock only at request time (Cache Components).
  await connection();
  const today = getToday();
  const [accounts, plans, recurring, people] = await Promise.all([
    getAccounts({ includeArchived: true }),
    getInstallmentPlans(),
    getRecurringItems(),
    getPeople(),
  ]);
  const active = accounts.filter((a) => !a.archived);
  const wallets = active.filter((a) => isSpendable(a.type));
  const debts = active.filter((a) => isDebt(a.type));
  const have = roundCents(wallets.reduce((sum, a) => sum + a.balance, 0));
  // Pautang is still your money; utang is money you owe.
  const owedToYou = roundCents(people.reduce((sum, p) => sum + Math.max(0, p.balance), 0));
  const owe = roundCents(
    debts.reduce((sum, a) => sum + Math.max(0, -a.balance), 0) + people.reduce((sum, p) => sum + Math.max(0, -p.balance), 0),
  );

  // What installments cost per month: the next unpaid payment of each plan.
  const perMonth = roundCents(
    plans.reduce((sum, p) => sum + (p.payments.find((x) => !x.transactionId)?.amount ?? 0), 0),
  );
  const payday = recurring.find((r) => r.kind === "payday");
  const payPerMonth = payday?.amount
    ? payday.amount * (payday.frequency === "weekly" ? 52 / 12 : payday.frequency === "twice_monthly" ? 2 : 1)
    : null;

  return (
    <>
      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: "You have", value: have },
          { label: "You owe", value: owe },
          { label: "Net worth", value: roundCents(have + owedToYou - owe) },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 rounded-2xl bg-white px-3 py-3">
            <dt className="text-xs font-bold text-muted">{s.label}</dt>
            <dd className={`font-display text-lg font-semibold sm:text-2xl ${s.value < 0 ? "text-coral-text" : ""}`}>
              {formatPeso(s.value)}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="have-heading" className="flex flex-col gap-2">
        <h2 id="have-heading" className="text-[13px] font-extrabold text-muted">MONEY YOU HAVE</h2>
        <WalletManager accounts={accounts.filter((a) => isSpendable(a.type) || a.archived)} />
      </section>

      <section aria-labelledby="owe-heading" className="flex flex-col gap-2">
        <h2 id="owe-heading" className="text-[13px] font-extrabold text-muted">
          MONEY YOU OWE
          {perMonth > 0 && (
            <>
              {" · "}
              {formatPeso(perMonth)}/mo
              {payPerMonth && ` = ${Math.round((perMonth / payPerMonth) * 100)}% of net pay`}
            </>
          )}
        </h2>
        {debts.length > 0 && (
          <ul className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
            {debts.map((a) => (
              <li key={a.id} className="border-b border-line-soft last:border-0">
                <Link href={`/money/${a.id}`} className="flex min-h-14 items-center gap-3 py-2.5 text-ink">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{a.name}</span>
                    <span className="text-[13px] text-muted">{debtDetail(a, plans, today)}</span>
                  </span>
                  <span className="font-display text-[17px] font-semibold">{formatPeso(Math.max(0, -a.balance))}</span>
                  <ChevronIcon size={20} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/money/credit/new"
            className="flex h-[52px] items-center justify-center rounded-[20px] border-2 border-dashed border-line font-extrabold text-ink hover:bg-white"
          >
            + BNPL (SPayLater, Atome)
          </Link>
          <Link
            href="/money/loan/new"
            className="flex h-[52px] items-center justify-center rounded-[20px] border-2 border-dashed border-line font-extrabold text-ink hover:bg-white"
          >
            + Loan (SLoan, MariLoan)
          </Link>
        </div>
        <p className="text-xs text-muted">
          A BNPL purchase is an expense on the day you buy. Paying the bill moves money to the
          credit line, so it&apos;s not spent twice. Only fees and interest count as spending.
        </p>
      </section>
    </>
  );
}

/** "BNPL · ₱4,000 of ₱10,000 used · due Dec 5" or "Loan · 4 of 6 paid · ₱1,900 on Nov 10". */
function debtDetail(account: Account, plans: InstallmentPlan[], today: string): string {
  const mine = plans.filter((p) => p.accountId === account.id);
  const next = mine
    .flatMap((p) => p.payments)
    .filter((p) => !p.transactionId)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
  if (account.type === "credit_line") {
    const used = Math.max(0, -account.balance);
    return [
      "BNPL",
      account.creditLimit ? `${formatPeso(used)} of ${formatPeso(account.creditLimit)} used` : null,
      next ? `due ${formatShortDay(next.dueOn, today)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const loan = mine[0];
  const total = loan?.months ?? 0;
  const left = loan?.payments.filter((p) => !p.transactionId).length ?? 0;
  return [
    "Loan",
    loan ? `${total - left} of ${total} paid` : null,
    next ? `${formatPeso(next.amount)} on ${formatShortDay(next.dueOn, today)}` : "paid off",
  ]
    .filter(Boolean)
    .join(" · ");
}
