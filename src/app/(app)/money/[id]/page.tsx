import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LogButton } from "@/components/log-button";
import { getAccounts, getInstallmentPlans, installmentInputs } from "@/lib/data";
import { addDays, formatShortDay, today as getToday } from "@/lib/dates";
import { scheduledItems } from "@/lib/forecast";
import { dueText } from "@/lib/installments";
import { formatPeso, isDebt, roundCents } from "@/lib/money";
import { nextOccurrence } from "@/lib/schedule";
import { AccountActions, PayBillButton, RemovePlanButton, UpcomingPayments } from "./account-actions";

export const metadata = { title: "Credit line · Pong Money" };

// Design canvas 4.2 (SPayLater detail) and the same view for a loan: what
// you owe, the next bill with Pay bill, active plans and upcoming payments.
export default function AccountPage({ params, searchParams }: PageProps<"/money/[id]">) {
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <Link href="/money" className="flex h-10 w-fit items-center font-extrabold text-sea-dark">‹ Money</Link>
      <Suspense fallback={<div className="h-[560px] rounded-[20px] bg-line-soft" />}>
        <Account params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Account({ params, searchParams }: PageProps<"/money/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Read the clock only at request time (Cache Components).
  await connection();
  const today = getToday();
  const [accounts, plans] = await Promise.all([getAccounts({ includeArchived: true }), getInstallmentPlans(id)]);
  const account = accounts.find((a) => a.id === id);
  if (!account || !isDebt(account.type)) notFound();

  const owed = Math.max(0, roundCents(-account.balance));
  // Unpaid installments, late ones first, as forecast items for Mark paid.
  const upcoming = scheduledItems(
    { recurring: [], billPayments: [], planned: [], installments: installmentInputs(plans).filter((p) => !p.transactionId) },
    today,
    "9999-12-31",
  );
  // One bill per due date: everything due that day, like the provider's monthly statement.
  const bills = [...new Set(upcoming.map((p) => p.dueOn))].map((dueOn) => {
    const items = upcoming.filter((p) => p.dueOn === dueOn);
    return { dueOn, items, total: roundCents(items.reduce((sum, p) => sum + (p.amount ?? 0), 0)) };
  });
  const next = upcoming[0];
  const nextBill = bills[0]?.items ?? [];
  const nextTotal = bills[0]?.total ?? 0;
  const credit = account.type === "credit_line";
  // What you owe that no upcoming payment covers yet.
  const unscheduled = Math.max(
    0,
    roundCents(owed - plans.flatMap((p) => p.payments).filter((p) => !p.transactionId).reduce((sum, p) => sum + p.principalPart, 0)),
  );
  const defaultDue = account.dueDay
    ? nextOccurrence({ frequency: "monthly", day1: account.dueDay, day2: null }, today)
    : addDays(today, 30);

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-3xl font-semibold">{account.name}</h1>
        <span className="text-[15px] text-muted">
          {credit
            ? `Buy now, pay later${account.dueDay ? ` · bill due every ${account.dueDay}${account.dueDay === 1 ? "st" : "th"}` : ""}`
            : "Loan"}
          {account.archived && " · archived"}
        </span>
      </div>

      <section className="flex flex-col gap-2 rounded-[28px] bg-sea p-6 text-white">
        {credit && account.creditLimit ? (
          <>
            <div className="flex justify-between text-sm font-bold text-sea-text"><span>USED</span><span>LIMIT</span></div>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-4xl font-semibold">{formatPeso(owed)}</span>
              <span className="font-display text-xl font-semibold">{formatPeso(account.creditLimit)}</span>
            </div>
            <div
              role="progressbar"
              aria-label="Credit used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round((owed / account.creditLimit) * 100))}
              className="h-2.5 overflow-hidden rounded-full bg-sea-dark"
            >
              <div className="h-full rounded-full bg-sun" style={{ width: `${Math.min(100, (owed / account.creditLimit) * 100)}%` }} />
            </div>
            <span className="text-[15px] text-sea-text">
              Available: {formatPeso(Math.max(0, account.creditLimit - owed))}
            </span>
          </>
        ) : (
          <>
            <h2 className="text-sm font-bold text-sea-text">YOU STILL OWE</h2>
            <span className="font-display text-4xl font-semibold">{formatPeso(owed)}</span>
            <span className="text-[15px] text-sea-text">
              {credit ? "No limit saved" : "Principal left. Interest is counted as you pay."}
            </span>
          </>
        )}
      </section>

      {next && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white px-4 py-3.5">
          <div className="flex flex-col">
            <span className={`text-[13px] font-bold ${next.dueOn < today ? "text-coral-text" : "text-muted"}`}>
              Next bill · {formatShortDay(next.dueOn, today)} · {dueText(next.dueOn, today)}
              {nextBill.length > 1 && ` · ${nextBill.length} items`}
            </span>
            <span className="font-display text-2xl font-semibold">{formatPeso(nextTotal)}</span>
          </div>
          <PayBillButton ids={nextBill.map((p) => p.id)} total={nextTotal} />
        </section>
      )}
      <p className="-mt-2 text-xs leading-relaxed text-muted">
        Pay bill = a transfer from your wallet to {account.name}. It&apos;s not a new expense: the
        expense was logged when you {credit ? "bought the item" : "spent the money"}. Only the fee or
        interest part is an expense.
      </p>

      {credit && !account.archived && (
        <UpcomingPayments
          account={account}
          unscheduled={unscheduled}
          defaultDue={defaultDue}
          today={today}
          startOpen={query.add === "upcoming"}
        />
      )}

      <section aria-labelledby="plans-heading" className="flex flex-col gap-2">
        <h2 id="plans-heading" className="font-display text-xl font-semibold">{credit ? "Active plans" : "Payment plan"}</h2>
        <ul className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
          {plans.map((plan) => {
            const paidCount = plan.months - plan.payments.filter((p) => !p.transactionId).length;
            const each = plan.payments[0]?.amount ?? 0;
            return (
              <li key={plan.id} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{plan.name}</span>
                  <span className="text-[13px] text-muted">
                    {plan.months === 1 ? "One payment" : `${plan.months} months`} · {paidCount} of {plan.months} paid
                    {plan.feeTotal > 0 && ` · fees ${formatPeso(plan.feeTotal)}`}
                  </span>
                </span>
                <span className="font-display text-[17px] font-semibold">
                  {formatPeso(each)}{plan.months > 1 && <span className="text-sm text-muted">/mo</span>}
                </span>
                <RemovePlanButton id={plan.id} name={plan.name} />
              </li>
            );
          })}
          {!plans.length && (
            <li className="py-3 text-[15px] text-muted">
              {credit
                ? "No plans yet. Log a purchase with + and pay with this credit line, or add a bill you expect with + Upcoming payment."
                : "No payments scheduled."}
            </li>
          )}
        </ul>
      </section>

      {bills.length > 0 && (
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-2">
          <h2 id="upcoming-heading" className="font-display text-xl font-semibold">
            {credit ? "Bills by due date" : "Upcoming payments"}
          </h2>
          {bills.slice(0, 8).map((bill) => (
            <section
              key={bill.dueOn}
              aria-label={`${formatShortDay(bill.dueOn, today)} bill`}
              className="flex flex-col rounded-[20px] bg-white px-4 py-1.5"
            >
              <div className="flex items-baseline justify-between gap-3 border-b-2 border-line-soft py-2.5">
                <span className="flex flex-col">
                  <span className="font-display text-lg font-semibold">{formatShortDay(bill.dueOn, today)} bill</span>
                  <span className={`text-[13px] ${bill.dueOn < today ? "font-bold text-coral-text" : "text-muted"}`}>
                    {dueText(bill.dueOn, today)}
                    {bill.items.length > 1 && ` · ${bill.items.length} items`}
                  </span>
                </span>
                <span className="font-display text-2xl font-semibold">{formatPeso(bill.total)}</span>
              </div>
              <ul className="flex flex-col">
                {bill.items.map((item) => (
                  <li key={item.key} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
                    <span className="min-w-0 flex-1 truncate font-bold">{item.name}</span>
                    <span className="font-display text-[17px] font-semibold">{formatPeso(item.amount ?? 0)}</span>
                    <LogButton item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-xs text-muted">
            {credit
              ? "A purchase you log with + lands on the bill it's due with, and that bill's total goes up. All of these are in your forecast and Safe to spend."
              : "All of these are in your forecast and Safe to spend."}
          </p>
        </section>
      )}

      <AccountActions account={account} />
    </>
  );
}
