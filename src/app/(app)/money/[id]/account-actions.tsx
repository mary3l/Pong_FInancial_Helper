"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addUpcomingPayments, payInstallments, removePlan } from "@/app/credit-actions";
import { removeWallet, restoreWallet } from "@/app/wallet-actions";
import { FIELD_CLASS } from "@/components/choice-chip";
import type { Account } from "@/lib/data";
import { formatShortDay, isValidDate } from "@/lib/dates";
import { monthlyDates } from "@/lib/forecast";
import { formatPeso, parseAmount, roundCents } from "@/lib/money";
import { CreditLineForm } from "../credit-line-form";

/** Pays every installment due on the next bill date. */
export function PayBillButton({ ids, total }: { ids: string[]; total: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await payInstallments(ids);
            setError(result.error ?? null);
          })
        }
        className="h-11 rounded-[14px] bg-sun px-5 font-extrabold text-ink disabled:opacity-60"
      >
        {pending ? "Paying…" : `Pay bill · ${formatPeso(total)}`}
      </button>
      <p role="alert" className="text-xs font-bold text-coral-text empty:hidden">{error}</p>
    </div>
  );
}

/** Removes a plan entered by mistake or paid off early. Asks once first. */
export function RemovePlanButton({ id, name }: { id: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        aria-label={confirm ? `Confirm remove ${name}` : `Remove ${name}`}
        onClick={() => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          startTransition(async () => {
            const result = await removePlan(id);
            if (result.error) setError(result.error);
          });
        }}
        onBlur={() => setConfirm(false)}
        className={`h-9 rounded-full px-3 text-xs font-extrabold disabled:opacity-60 ${
          confirm ? "bg-coral text-white" : "text-coral-text hover:bg-coral-tint"
        }`}
      >
        {pending ? "Removing…" : confirm ? "Tap to remove" : "Remove"}
      </button>
      <span role="alert" className="text-xs font-bold text-coral-text empty:hidden">{error}</span>
    </span>
  );
}

/** Edit a credit line, or archive / restore the account. */
export function AccountActions({ account }: { account: Account }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <div className="rounded-[20px] bg-white p-4">
        <CreditLineForm account={account} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="flex flex-wrap gap-2">
        {account.type === "credit_line" && (
          <button type="button" onClick={() => setEditing(true)} className="h-11 rounded-[14px] bg-white px-4 font-extrabold text-ink hover:bg-sea-tint">
            Edit {account.name}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onBlur={() => setConfirm(false)}
          onClick={() => {
            if (!account.archived && !confirm) {
              setConfirm(true);
              return;
            }
            startTransition(async () => {
              const result = account.archived ? await restoreWallet(account.id) : await removeWallet(account.id);
              if (result.error) setError(result.error);
              else if (!account.archived && !result.archived) router.push("/money");
            });
          }}
          className={`h-11 rounded-[14px] px-4 font-extrabold disabled:opacity-60 ${
            account.archived ? "bg-white text-ink" : confirm ? "bg-coral text-white" : "text-coral-text hover:bg-coral-tint"
          }`}
        >
          {account.archived ? "Restore" : confirm ? "Tap again to remove" : "Remove"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Removing one with history archives it instead, so your past transactions stay right.
      </p>
      <p role="alert" className="text-sm font-bold text-coral-text empty:hidden">{error}</p>
    </div>
  );
}

const MONTH_CHOICES = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24];

/**
 * + Upcoming payment on SPayLater or Atome: bills you already expect, like
 * ones from before you used Pong or what the provider's app shows is due.
 */
export function UpcomingPayments({
  account,
  unscheduled,
  defaultDue,
  today,
  startOpen,
}: {
  account: Account;
  /** What you owe that has no payment dates yet. */
  unscheduled: number;
  defaultDue: string;
  today: string;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [firstDue, setFirstDue] = useState(defaultDue);
  const [months, setMonths] = useState(1);
  const [owedChoice, setOwedChoice] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const each = amount.trim() ? parseAmount(amount) : NaN;
  const total = Number.isNaN(each) ? 0 : roundCents(each * months);
  // Until you choose: add it to what you owe only if it doesn't fit in what's unscheduled.
  const addToOwed = owedChoice ?? total > unscheduled;
  const dates = isValidDate(firstDue) ? monthlyDates(firstDue, months) : [];

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (Number.isNaN(each) || each <= 0) {
      setError("Enter how much you'll pay.");
      return;
    }
    startTransition(async () => {
      const result = await addUpcomingPayments(account.id, { name, amount: each, firstDue, months, addToOwed });
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        setName("");
        setAmount("");
        setMonths(1);
        setOwedChoice(null);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[52px] rounded-[20px] border-2 border-dashed border-line font-extrabold text-ink hover:bg-white"
      >
        + Upcoming payment
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-xl font-semibold">Upcoming payment</h2>
        <p className="text-[13px] text-muted">
          A bill you expect on {account.name}, like one its app already shows. It goes into Coming
          up, your forecast and Safe to spend.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="upcoming-amount" className="text-sm font-bold">{months > 1 ? "Each month" : "Amount"}</label>
          <div className="relative">
            <span aria-hidden="true" className="absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted">₱</span>
            <input
              id="upcoming-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              required
              autoFocus
              className={`${FIELD_CLASS} w-full pl-8 text-right`}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="upcoming-due" className="text-sm font-bold">{months > 1 ? "First due" : "Due"}</label>
          <input
            id="upcoming-due"
            type="date"
            value={firstDue}
            min={today}
            onChange={(e) => setFirstDue(e.target.value)}
            required
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="upcoming-months" className="text-sm font-bold">How many months</label>
          <select id="upcoming-months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={FIELD_CLASS}>
            {MONTH_CHOICES.map((m) => (
              <option key={m} value={m}>{m === 1 ? "Just once" : `${m} months`}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="upcoming-name" className="text-sm font-bold">
            For <span className="font-semibold text-muted">(optional)</span>
          </label>
          <input
            id="upcoming-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Shopee order"
            className={FIELD_CLASS}
          />
        </div>
      </div>
      {total > 0 && dates.length > 0 && (
        <p className="text-[13px] text-muted">
          {formatPeso(each)} on {dates.slice(0, 3).map((d) => formatShortDay(d, today)).join(", ")}
          {dates.length > 3 && `, … ${formatShortDay(dates.at(-1)!, today)}`}
          {months > 1 && ` · ${formatPeso(total)} in all`}
        </p>
      )}
      <label className="flex items-start gap-3 rounded-[14px] bg-mint px-3 py-2.5">
        <input
          type="checkbox"
          checked={addToOwed}
          onChange={(e) => setOwedChoice(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-sea"
        />
        <span className="flex flex-col text-[13px]">
          <span className="font-bold">Add {total > 0 ? formatPeso(total) : "it"} to what I owe on {account.name}</span>
          <span className="text-muted">
            Leave this off if it&apos;s already in what you owe
            {unscheduled > 0 ? ` (${formatPeso(unscheduled)} of that has no payment dates yet)` : ""}. Turn it on
            for a purchase you haven&apos;t logged.
          </span>
        </span>
      </label>
      <p role="alert" className="text-sm font-bold text-coral-text empty:hidden">{error}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="h-11 rounded-[14px] bg-sun px-5 font-extrabold text-ink disabled:opacity-60">
          {pending ? "Saving…" : months > 1 ? `Add ${months} payments` : "Add payment"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-[14px] px-4 font-extrabold text-ink hover:bg-mint">
          Cancel
        </button>
      </div>
    </form>
  );
}
