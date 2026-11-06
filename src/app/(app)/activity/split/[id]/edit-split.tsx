"use client";

import { useState, useTransition } from "react";
import { updateSplit } from "@/app/people-actions";
import { AmountInput } from "@/components/amount-input";
import { amountToExpression, evaluate, expressionFromText } from "@/lib/calculator";
import { formatPeso, parseAmount, roundCents } from "@/lib/money";

type Share = { id: string; name: string; amount: number };

/** A share as typed, including a sum ("50+20"); NaN if it can't be read. */
function read(text: string): number {
  if (!text.trim()) return 0;
  const plain = parseAmount(text);
  if (!Number.isNaN(plain)) return plain;
  const expr = expressionFromText(text);
  const result = expr ? evaluate(expr) : null;
  return result !== null && result >= 0 ? roundCents(result) : NaN;
}

/**
 * Edit the whole bill: its description and date on every record, and each
 * share. The total follows the shares, so changing one adds to or takes
 * from the bill.
 */
export function EditSplit({
  splitId,
  note,
  date,
  shares,
}: {
  splitId: string;
  note: string;
  date: string;
  shares: Share[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState(note);
  const [draftDate, setDraftDate] = useState(date);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => start(shares));

  const oldTotal = roundCents(shares.reduce((s, x) => s + x.amount, 0));
  const values = shares.map((s) => read(amounts[s.id] ?? ""));
  const valid = values.every((v) => !Number.isNaN(v));
  const total = valid ? roundCents(values.reduce((s, v) => s + v, 0)) : null;
  const change = total === null ? 0 : roundCents(total - oldTotal);

  function reset() {
    setDraftNote(note);
    setDraftDate(date);
    setAmounts(start(shares));
    setError(null);
  }

  function save() {
    if (pending) return;
    if (total === null) {
      setError("Check the shares.");
      return;
    }
    if (total <= 0) {
      setError("The shares need to add up to more than ₱0.");
      return;
    }
    startTransition(async () => {
      const result = await updateSplit(splitId, {
        note: draftNote,
        occurredOn: draftDate,
        shares: shares.map((s, i) => ({ id: s.id, amount: values[i] })),
      });
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="h-14 rounded-[18px] bg-sun font-extrabold text-ink"
      >
        Edit this split
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-3 rounded-[20px] bg-card p-4"
    >
      <h2 className="text-sm font-extrabold">Edit this split</h2>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,10rem)] gap-2.5">
        <div className="flex flex-col gap-1">
          <label htmlFor="split-note" className="text-[13px] font-extrabold">Description</label>
          <input
            id="split-note"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            maxLength={120}
            placeholder="e.g. Chatuchak"
            className="h-11 min-w-0 rounded-[14px] bg-mint px-3 text-[15px] outline-none focus:ring-2 focus:ring-sea"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="split-date" className="text-[13px] font-extrabold">Date</label>
          <input
            id="split-date"
            type="date"
            value={draftDate}
            required
            onChange={(e) => setDraftDate(e.target.value)}
            className="h-11 min-w-0 rounded-[14px] bg-mint px-3 text-[15px] outline-none focus:ring-2 focus:ring-sea"
          />
        </div>
      </div>

      <span className="text-[13px] font-extrabold text-muted">SHARES</span>
      <ul className="flex flex-col gap-1.5">
        {shares.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 text-[15px]">
            <span className="font-bold">{s.name}</span>
            <AmountInput
              aria-label={`${s.name}'s share`}
              value={amounts[s.id] ?? ""}
              onChange={(v) => setAmounts((a) => ({ ...a, [s.id]: v }))}
              placeholder="0.00"
              wrapperClassName="w-32"
              className="h-9 w-full rounded-[12px] bg-mint px-3 text-right text-[15px] outline-none focus:ring-2 focus:ring-sea"
            />
          </li>
        ))}
        <li
          aria-live="polite"
          className={`mt-1 flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-[15px] ${
            total === null ? "bg-coral-tint text-coral-text" : "bg-sea-tint text-sea-dark"
          }`}
        >
          <span className="font-extrabold">New total</span>
          <span className="text-right">
            <span className="font-display font-semibold">{total === null ? "Check the shares" : formatPeso(total)}</span>
            {total !== null && (
              <span className="block text-xs text-muted">
                {change === 0
                  ? `same as before`
                  : `${change > 0 ? "+" : "−"}${formatPeso(Math.abs(change))} from ${formatPeso(oldTotal)}`}
              </span>
            )}
          </span>
        </li>
      </ul>
      <p className="text-xs text-muted">Set a share to 0 to take that person off the bill.</p>

      <p role="alert" className="text-sm font-bold text-coral-text empty:hidden">{error}</p>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="h-12 flex-1 rounded-[16px] bg-mint font-extrabold"
        >
          Cancel
        </button>
        <button type="submit" disabled={pending} className="h-12 flex-[2] rounded-[16px] bg-sun font-extrabold text-ink disabled:opacity-60">
          {pending ? "Updating…" : "Update split"}
        </button>
      </div>
    </form>
  );
}

function start(shares: Share[]): Record<string, string> {
  return Object.fromEntries(shares.map((s) => [s.id, amountToExpression(s.amount)]));
}
