"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { payInstallments, undoInstallment } from "@/app/credit-actions";
import { settlePerson } from "@/app/people-actions";
import { logPlanned, logRecurring } from "@/app/plan-actions";
import { deleteTransaction } from "@/app/transaction-actions";
import type { ForecastItem } from "@/lib/forecast";

/** Opens Add prefilled for an item, linked so saving logs that occurrence. */
export function prefillHref(item: ForecastItem): string {
  const query = new URLSearchParams({
    type: item.flow === "in" ? "income" : "expense",
    note: item.name,
  });
  if (item.amount) query.set("amount", String(item.amount));
  if (item.category) query.set("category", item.category);
  if (item.accountId) query.set("account", item.accountId);
  if (item.kind === "payday" || item.kind === "income" || item.kind === "bill") {
    query.set("link", `${item.id}|${item.dueOn}`);
  }
  return `/add?${query}`;
}

// "Mark paid" for money going out, "Add income" for money coming in. Either
// logs the real transaction at the scheduled amount; undo deletes it, which
// un-marks the item. An installment logs a transfer plus its fee; utang and
// pautang settle the whole balance (a transfer, never spending).
export function LogButton({ item }: { item: ForecastItem }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const paid = Boolean(item.transactionId);
  const incoming = item.flow === "in";
  const label = incoming ? "Add income" : "Mark paid";

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await (item.kind === "utang" || item.kind === "pautang"
        ? settlePerson(item.id)
        : item.kind === "installment"
        ? paid
          ? undoInstallment(item.id)
          : payInstallments([item.id])
        : paid
          ? deleteTransaction(item.transactionId!)
          : item.kind === "planned"
            ? logPlanned(item.id)
            : logRecurring(item.id, item.dueOn));
      if (result.error) setError(result.error);
    });
  }

  const buttonClass = `flex h-10 min-w-[100px] items-center justify-center rounded-full px-3 text-[13px] font-extrabold disabled:opacity-60 ${
    paid ? "border-2 border-line bg-white text-ink" : incoming ? "bg-sun text-ink" : "bg-sea text-white"
  }`;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {item.amount === null && !paid ? (
        // No amount saved (a payday without net pay): type it in Add.
        <Link href={prefillHref(item)} className={buttonClass}>
          {label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-label={paid ? `Undo ${item.name}` : `${label}: ${item.name}`}
          className={buttonClass}
        >
          {pending ? "Saving…" : paid ? `${incoming ? "Received" : "Paid"} · undo` : label}
        </button>
      )}
      {paid && !pending && (
        <Link href={`/activity/${item.transactionId}`} className="text-xs font-extrabold text-sea-dark underline">
          Edit amount
        </Link>
      )}
      <p role="alert" className="max-w-40 text-right text-xs font-bold text-coral-text empty:hidden">{error}</p>
    </div>
  );
}
