"use client";

import { useState, useTransition } from "react";
import { removePlannedExpense } from "@/app/plan-actions";

// Removes a planned expense from the forecast. Asks once before it goes.
export function RemovePlannedButton({ id, name }: { id: string; name: string }) {
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
            const result = await removePlannedExpense(id);
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
