import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LogButton } from "@/components/log-button";
import { getAccounts, getInstallmentPlans, installmentInputs } from "@/lib/data";
import { formatShortDay, today as getToday } from "@/lib/dates";
import { scheduledItems } from "@/lib/forecast";
import { dueText } from "@/lib/installments";
import { formatPeso, isDebt, roundCents } from "@/lib/money";
import { AccountActions, PayBillButton, RemovePlanButton } from "./account-actions";

export const metadata = { title: "Credit line · Pong Money" };

// Design canvas 4.2 (SPayLater detail) and the same view for a loan: what
// you owe, the next bill with Pay bill, active plans and upcoming payments.
export default function AccountPage({ params }: PageProps<"/money/[id]">) {
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <Link href="/money" className="flex h-10 w-fit items-center font-extrabold text-sea-dark">‹ Money</Link>
      <Suspense fallback={<div className="h-[560px] rounded-[20px] bg-line-soft" />}>
        <Account params={params} />
      </Suspense>
    </div>
  );
}

async function Account({ params }: Pick<PageProps<"/money/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
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
  const next = upcoming[0];
  const nextBill = next ? upcoming.filter((p) => p.dueOn === next.dueOn) : [];
  const nextTotal = roundCents(nextBill.reduce((sum, p) => sum + (p.amount ?? 0), 0));
  const credit = account.type === "credit_line";

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
                    {plan.months === 1 ? "Pay next month" : `${plan.months} months`} · {paidCount} of {plan.months} paid
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
                ? "No plans yet. Tap + and pay with this credit line to add a purchase and its payment plan."
                : "No payments scheduled."}
            </li>
          )}
        </ul>
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-2">
          <h2 id="upcoming-heading" className="font-display text-xl font-semibold">Upcoming payments</h2>
          <ul className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
            {upcoming.slice(0, 12).map((item) => (
              <li key={item.key} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{item.name}</span>
                  <span className={`text-[13px] ${item.dueOn < today ? "font-bold text-coral-text" : "text-muted"}`}>
                    {formatShortDay(item.dueOn, today)} · {dueText(item.dueOn, today)}
                  </span>
                </span>
                <span className="font-display text-[17px] font-semibold">{formatPeso(item.amount ?? 0)}</span>
                <LogButton item={item} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">All of these are in your forecast and Safe to spend.</p>
        </section>
      )}

      <AccountActions account={account} />
    </>
  );
}
