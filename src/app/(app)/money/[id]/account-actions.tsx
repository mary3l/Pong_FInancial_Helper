"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payInstallments, removePlan } from "@/app/credit-actions";
import { removeWallet, restoreWallet } from "@/app/wallet-actions";
import type { Account } from "@/lib/data";
import { formatPeso } from "@/lib/money";
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
