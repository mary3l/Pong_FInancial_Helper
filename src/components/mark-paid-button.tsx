"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { markBillPaid, markPlannedPaid } from "@/app/plan-actions";
import { deleteTransaction } from "@/app/transaction-actions";

// Mark paid logs the expense; undo deletes that expense, which un-marks it.
export function MarkPaidButton({
  kind,
  id,
  dueOn,
  name,
  transactionId,
}: {
  kind: "bill" | "planned";
  id: string;
  dueOn: string;
  name: string;
  /** Set when it's already paid. */
  transactionId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const paid = Boolean(transactionId);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = paid
        ? await deleteTransaction(transactionId!)
        : kind === "bill"
          ? await markBillPaid(id, dueOn)
          : await markPlannedPaid(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={paid ? `Undo paid for ${name}` : `Mark ${name} paid`}
        className={`h-10 min-w-[100px] rounded-full px-3 text-[13px] font-extrabold disabled:opacity-60 ${
          paid ? "border-2 border-line bg-white text-ink" : "bg-sea text-white"
        }`}
      >
        {pending ? "Saving…" : paid ? "Paid · undo" : "Mark paid"}
      </button>
      {paid && !pending && (
        <Link href={`/activity/${transactionId}`} className="text-xs font-extrabold text-sea-dark underline">
          Edit amount
        </Link>
      )}
      <p role="alert" className="max-w-40 text-right text-xs font-bold text-coral-text empty:hidden">{error}</p>
    </div>
  );
}
