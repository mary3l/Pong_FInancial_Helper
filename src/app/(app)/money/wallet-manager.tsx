"use client";

import { useState, useTransition } from "react";
import { saveTransaction } from "@/app/transaction-actions";
import {
  addWallets,
  removeWallet,
  restoreWallet,
  updateWallet,
  type WalletResult,
} from "@/app/wallet-actions";
import { FIELD_CLASS } from "@/components/choice-chip";
import type { Account } from "@/lib/data";
import { formatShortDay } from "@/lib/dates";
import {
  WALLET_PURPOSES,
  WALLET_TYPES,
  accountTypeLabel,
  canEarnInterest,
  formatPeso,
  isWalletType,
  parseAmount,
  roundCents,
  type WalletPurpose,
  type WalletType,
} from "@/lib/money";

/** Interest built up on a wallet since it was last logged (or the rate was set). */
export type Accrued = { since: string; days: number; amount: number; perDay: number };

export function WalletManager({
  accounts,
  accrued,
  today,
}: {
  accounts: Account[];
  /** By account id, for wallets with an interest rate. */
  accrued: Record<string, Accrued>;
  today: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  // Grouped by category. Spending always shows, so "No wallets yet" has a place.
  const groups = WALLET_PURPOSES.map((p) => ({ ...p, wallets: active.filter((a) => a.purpose === p.value) })).filter(
    (g) => g.value === "spending" || g.wallets.length > 0,
  );

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm font-bold text-sea-dark empty:hidden">{notice}</p>

      {groups.map((group) => (
        <section key={group.value} aria-label={group.label} className="flex flex-col gap-1.5">
          {groups.length > 1 && (
            <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
              <span className="font-extrabold">
                {group.label} · {formatPeso(roundCents(group.wallets.reduce((sum, a) => sum + a.balance, 0)))}
              </span>
              <span className="text-xs text-muted">
                {group.value === "spending" ? "Counts in Safe to spend" : "Set aside, not in Safe to spend"}
              </span>
            </h3>
          )}
          <ul className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
            {group.wallets.map((a) => (
              <li key={a.id} className="border-b border-line-soft py-2.5 last:border-0">
                {editing === a.id ? (
                  <WalletForm
                    account={a}
                    onCancel={() => setEditing(null)}
                    onDone={(result) => {
                      setEditing(null);
                      setNotice(result.archived ? `${a.name} has history, so it was archived instead of deleted.` : null);
                    }}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-bold">{a.name}</span>
                        <span className="text-[13px] text-muted">
                          {accountTypeLabel(a.type)}
                          {a.interestRate !== null && ` · ${a.interestRate}% a year`}
                        </span>
                      </span>
                      <span className={`font-display text-[17px] font-semibold ${a.balance < 0 ? "text-coral-text" : ""}`}>
                        {formatPeso(a.balance)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(a.id);
                          setNotice(null);
                        }}
                        aria-label={`Edit ${a.name}`}
                        className="h-11 rounded-full px-3 text-sm font-extrabold text-sea-dark hover:bg-mint"
                      >
                        Edit
                      </button>
                    </div>
                    {accrued[a.id] && <InterestRow account={a} accrued={accrued[a.id]} today={today} />}
                  </>
                )}
              </li>
            ))}
            {!active.length && <li className="py-3 text-[15px] text-muted">No wallets yet. Add the places you keep money.</li>}
          </ul>
        </section>
      ))}

      {adding ? (
        <div className="rounded-[20px] bg-white p-4">
          <WalletForm onCancel={() => setAdding(false)} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setNotice(null);
          }}
          className="h-[52px] rounded-[20px] border-2 border-dashed border-line font-extrabold text-ink hover:bg-white"
        >
          + Add wallet
        </button>
      )}

      {archived.length > 0 && (
        <section aria-labelledby="archived-heading" className="flex flex-col gap-2">
          <h2 id="archived-heading" className="text-[13px] font-extrabold text-muted">ARCHIVED</h2>
          <ul className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center gap-3 border-b border-line-soft py-2 last:border-0">
                <span className="flex-1 text-muted">{a.name}</span>
                <span className="text-sm text-muted">{formatPeso(a.balance)}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const result = await restoreWallet(a.id);
                    setNotice(result.error ?? `${a.name} is back.`);
                  })}
                  className="h-11 rounded-full px-3 text-sm font-extrabold text-sea-dark hover:bg-mint"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function WalletForm({
  account,
  onCancel,
  onDone,
}: {
  /** The wallet to edit; omit to add one. */
  account?: Account;
  onCancel: () => void;
  onDone: (result: WalletResult) => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<WalletType>(
    account && isWalletType(account.type) ? account.type : "ewallet",
  );
  const [balance, setBalance] = useState(account ? String(account.balance) : "");
  const [purpose, setPurpose] = useState<WalletPurpose>(account?.purpose ?? "spending");
  const [rate, setRate] = useState(account?.interestRate ? String(account.interestRate) : "");
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  const id = account?.id ?? "new";

  function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = balance.trim() ? parseAmount(balance.replace(/^-/, "")) : 0;
    if (Number.isNaN(amount)) {
      setError("Check the amount.");
      return;
    }
    const value = balance.trim().startsWith("-") ? -amount : amount;
    const typedRate = rate.replace(/[%\s]/g, "");
    const interestRate = canEarnInterest(type) && typedRate ? Number(typedRate) : null;
    if (interestRate !== null && !(/^\d+(\.\d{1,2})?$/.test(typedRate) && interestRate > 0 && interestRate <= 100)) {
      setError("Check the interest rate, like 3.5 for 3.5% a year.");
      return;
    }
    startTransition(async () => {
      const input = { name, type, balance: value, purpose, interestRate };
      const result = account ? await updateWallet(account.id, input) : await addWallets([input]);
      if (result.error) setError(result.error);
      else onDone(result);
    });
  }

  function remove() {
    if (!account) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    startTransition(async () => {
      const result = await removeWallet(account.id);
      if (result.error) setError(result.error);
      else onDone(result);
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`wallet-name-${id}`} className="text-sm font-bold">Name</label>
          <input id={`wallet-name-${id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="e.g. GCash" className={FIELD_CLASS} />
        </div>
        <div className="flex flex-col gap-1 sm:w-44">
          <label htmlFor={`wallet-balance-${id}`} className="text-sm font-bold">In it now</label>
          <div className="relative">
            <span aria-hidden="true" className="absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted">₱</span>
            <input id={`wallet-balance-${id}`} value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${FIELD_CLASS} w-full pl-8 text-right`} />
          </div>
        </div>
      </div>
      <div role="group" aria-label="Type" className="flex flex-wrap gap-2">
        {WALLET_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={type === t.value}
            onClick={() => setType(t.value)}
            className={`h-9 rounded-full px-3.5 text-sm font-extrabold ${type === t.value ? "bg-ink text-white" : "bg-mint text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={`wallet-purpose-${id}`} className="text-sm font-bold">Category</span>
        <div role="group" aria-labelledby={`wallet-purpose-${id}`} className="flex flex-wrap gap-2">
          {WALLET_PURPOSES.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={purpose === p.value}
              onClick={() => setPurpose(p.value)}
              className={`h-9 rounded-full px-3.5 text-sm font-extrabold ${purpose === p.value ? "bg-ink text-white" : "bg-mint text-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">
          {purpose === "spending"
            ? "Spending money counts in Safe to spend and your forecast."
            : "Still counts in You have and Net worth, but not in Safe to spend, so you won't plan to spend it."}
        </span>
      </div>
      {canEarnInterest(type) && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`wallet-rate-${id}`} className="text-sm font-bold">
            Interest rate <span className="font-semibold text-muted">(optional)</span>
          </label>
          <div className="relative w-44">
            <input
              id={`wallet-rate-${id}`}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 3.5"
              aria-describedby={`wallet-rate-hint-${id}`}
              className={`${FIELD_CLASS} w-full pr-24 text-right`}
            />
            <span aria-hidden="true" className="absolute top-1/2 right-4 -translate-y-1/2 font-bold text-muted">% a year</span>
          </div>
          <span id={`wallet-rate-hint-${id}`} className="text-xs text-muted">
            For banks that add interest every day, like MariBank and GoTyme. Check the rate in
            their app; Pong estimates what you earn after the 20% tax.
          </span>
        </div>
      )}
      {account && (
        <p className="text-xs text-muted">Changing the amount adjusts the starting balance. Your logged transactions stay as they are.</p>
      )}
      <p role="alert" className="text-sm font-bold text-coral-text empty:hidden">{error}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="h-11 rounded-[14px] bg-sun px-5 font-extrabold text-ink disabled:opacity-60">
          {pending ? "Saving…" : account ? "Save" : "Add wallet"}
        </button>
        <button type="button" onClick={onCancel} className="h-11 rounded-[14px] px-4 font-extrabold text-ink hover:bg-mint">
          Cancel
        </button>
        {account && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className={`ml-auto h-11 rounded-[14px] px-4 font-extrabold ${confirmRemove ? "bg-coral text-white" : "text-coral-text hover:bg-coral-tint"}`}
          >
            {confirmRemove ? "Tap again to remove" : "Remove"}
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Daily interest on a MariBank or GoTyme style wallet: what it earns a day
 * and what's built up since interest was last logged. Add interest logs it
 * as income, so the balance here keeps up with the bank's.
 */
function InterestRow({ account, accrued, today }: { account: Account; accrued: Accrued; today: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (Number.isNaN(value) || value <= 0) {
      setError("Enter the interest you got. The bank's app shows it.");
      return;
    }
    startTransition(async () => {
      const result = await saveTransaction({
        type: "income",
        amount: value,
        accountId: account.id,
        toAccountId: null,
        category: "interest",
        note: "Interest",
        occurredOn: today,
      });
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <div className="mt-1.5 flex flex-col gap-2 rounded-[14px] bg-mint px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex-1 text-[13px]">
          Earns ≈ <strong>{formatPeso(accrued.perDay)}</strong> a day after tax
          {accrued.days > 0
            ? ` · ≈ ${formatPeso(accrued.amount)} since ${formatShortDay(accrued.since, today)}`
            : " · counting from today"}
        </span>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setAmount(accrued.amount > 0 ? String(accrued.amount) : "");
              setError(null);
            }}
            className="h-9 rounded-full bg-white px-3 text-sm font-extrabold text-sea-dark"
          >
            + Add interest
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`interest-${account.id}`} className="text-xs font-bold">
              Interest credited to {account.name}
            </label>
            <div className="relative w-36">
              <span aria-hidden="true" className="absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted">₱</span>
              <input
                id={`interest-${account.id}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={`${FIELD_CLASS} h-11 w-full pl-8 text-right`}
              />
            </div>
          </div>
          <button type="submit" disabled={pending} className="h-11 rounded-[14px] bg-sun px-4 font-extrabold text-ink disabled:opacity-60">
            {pending ? "Saving…" : "Save as income"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-[14px] px-3 font-extrabold text-ink">
            Cancel
          </button>
          <p className="basis-full text-xs text-muted">
            Filled in with Pong&apos;s estimate. The bank adds interest daily on that day&apos;s
            balance, so type the exact amount from its app if you have it.
          </p>
          <p role="alert" className="basis-full text-xs font-bold text-coral-text empty:hidden">{error}</p>
        </form>
      )}
    </div>
  );
}
