"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addLoan } from "@/app/credit-actions";
import { ChoiceChip, FIELD_CLASS } from "@/components/choice-chip";
import type { Account } from "@/lib/data";
import { formatShortDay, isValidDate } from "@/lib/dates";
import { monthlyDates } from "@/lib/forecast";
import { loanSchedule, loanSummary } from "@/lib/installments";
import { formatPeso, parseAmount } from "@/lib/money";

const PROVIDERS = ["SLoan", "MariLoan", "GLoan", "Pag-IBIG", "SSS"];

export function LoanForm({ wallets, today }: { wallets: Account[]; today: string }) {
  const router = useRouter();
  const [name, setName] = useState("SLoan");
  const [received, setReceived] = useState("");
  const [into, setInto] = useState(wallets[0]?.id ?? "");
  const [receivedOn, setReceivedOn] = useState(today);
  const [monthly, setMonthly] = useState("");
  const [months, setMonths] = useState("12");
  const [nextDue, setNextDue] = useState(monthlyDates(today, 2)[1]);
  const [payFrom, setPayFrom] = useState(wallets[0]?.id ?? "");
  const [alreadyPaid, setAlreadyPaid] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const terms = {
    received: parseAmount(received),
    monthly: parseAmount(monthly),
    months: Number(months),
  };
  const paid = into ? 0 : Math.max(0, Math.floor(Number(alreadyPaid) || 0));
  const valid =
    terms.received > 0 &&
    terms.monthly > 0 &&
    Number.isInteger(terms.months) &&
    terms.months >= 1 &&
    terms.months <= 60 &&
    paid < terms.months &&
    isValidDate(nextDue);
  const summary = valid ? loanSummary(terms) : null;
  const schedule = valid ? loanSchedule(terms, nextDue, paid) : [];

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!valid) {
      setError("Fill in the amount received, monthly payment and months.");
      return;
    }
    startTransition(async () => {
      const result = await addLoan({
        name,
        ...terms,
        intoAccountId: into || null,
        receivedOn,
        nextDue,
        payFromAccountId: payFrom || null,
        alreadyPaid: paid,
      });
      if (result.error) setError(result.error);
      else router.push(`/money/${result.id}`);
    });
  }

  const money = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <div className="relative">
        <span aria-hidden="true" className="absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted">₱</span>
        <input id={id} value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${FIELD_CLASS} w-full pl-8 text-right`} />
      </div>
    </div>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div role="group" aria-label="Lender" className="flex flex-wrap gap-2">
        {[...PROVIDERS, "Other"].map((p) => {
          const selected = p === "Other" ? !PROVIDERS.includes(name) : name === p;
          return (
            <ChoiceChip key={p} selected={selected} onClick={() => setName(p === "Other" ? "" : p)} className={selected ? "" : "bg-white"}>
              {p}
            </ChoiceChip>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="loan-name" className="text-sm font-bold">Name</label>
          <input id="loan-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required className={FIELD_CLASS} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {money("loan-received", "Amount received", received, setReceived)}
          <div className="flex flex-col gap-1">
            <label htmlFor="loan-into" className="text-sm font-bold">Received into</label>
            <select id="loan-into" value={into} onChange={(e) => setInto(e.target.value)} className={FIELD_CLASS}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
              <option value="">Received before (already spent)</option>
            </select>
          </div>
          {money("loan-monthly", "Monthly payment", monthly, setMonthly)}
          <div className="flex flex-col gap-1">
            <label htmlFor="loan-months" className="text-sm font-bold">Months</label>
            <input id="loan-months" value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" className={FIELD_CLASS} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="loan-next" className="text-sm font-bold">{paid ? "Next payment due" : "First due"}</label>
            <input id="loan-next" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="loan-from" className="text-sm font-bold">Pay from</label>
            <select id="loan-from" value={payFrom} onChange={(e) => setPayFrom(e.target.value)} className={FIELD_CLASS}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
              {!wallets.length && <option value="">Any wallet</option>}
            </select>
          </div>
          {into ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="loan-date" className="text-sm font-bold">Received on</label>
              <input id="loan-date" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={FIELD_CLASS} />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor="loan-paid" className="text-sm font-bold">Payments made</label>
              <input id="loan-paid" value={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.value)} inputMode="numeric" className={FIELD_CLASS} />
            </div>
          )}
        </div>
      </div>

      {summary && (
        <dl className="flex flex-col gap-1.5 rounded-[20px] bg-white px-4 py-3.5 text-[15px]">
          <div className="flex justify-between gap-3"><dt>Total you&apos;ll pay</dt><dd className="font-extrabold">{formatPeso(summary.total)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Interest &amp; fees</dt><dd className="font-extrabold">{formatPeso(summary.interest)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Effective rate</dt><dd className="font-extrabold">{summary.ratePerMonth}% / month</dd></div>
        </dl>
      )}

      <p className="rounded-2xl bg-sun-tint px-4 py-3 text-sm leading-relaxed">
        The money you receive is <strong>not income</strong>. It&apos;s a transfer from {name || "the loan"}
        {into ? ` into ${wallets.find((w) => w.id === into)?.name}` : ""}, so your budget and savings stay
        honest. Each payment: the principal part is a transfer, only the interest is an expense.
      </p>

      {schedule.length > 0 && (
        <section aria-labelledby="loan-schedule" className="flex flex-col gap-1">
          <h2 id="loan-schedule" className="text-sm font-extrabold">Schedule preview</h2>
          <ul className="flex flex-col rounded-[20px] bg-white px-4 py-1">
            {schedule.slice(0, 3).map((r) => (
              <li key={r.seq} className="flex justify-between border-b border-line-soft py-2 text-[15px] last:border-0">
                <span>{formatShortDay(r.dueOn, today)} · {r.seq} of {terms.months}</span>
                <span className="font-bold">{formatPeso(r.amount)}</span>
              </li>
            ))}
          </ul>
          {schedule.length > 3 && (
            <span className="text-[13px] text-muted">+ {schedule.length - 3} more · all added to your forecast</span>
          )}
        </section>
      )}

      <p role="alert" className="text-sm font-bold text-coral-text empty:hidden">{error}</p>
      <button type="submit" disabled={pending} className="h-14 rounded-[20px] bg-sun text-lg font-extrabold text-ink disabled:opacity-60">
        {pending ? "Saving…" : "Save loan"}
      </button>
    </form>
  );
}
