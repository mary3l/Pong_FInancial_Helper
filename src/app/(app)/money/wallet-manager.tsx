"use client";

import { useState, useTransition } from "react";
import {
  addWallets,
  removeWallet,
  restoreWallet,
  updateWallet,
  type WalletResult,
} from "@/app/wallet-actions";
import { FIELD_CLASS } from "@/components/choice-chip";
import type { Account } from "@/lib/data";
import {
  WALLET_TYPES,
  accountTypeLabel,
  formatPeso,
  isWalletType,
  parseAmount,
  type WalletType,
} from "@/lib/money";

export function WalletManager({ accounts }: { accounts: Account[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm font-bold text-sea-dark empty:hidden">{notice}</p>

      <ul className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
        {active.map((a) => (
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
              <div className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{a.name}</span>
                  <span className="text-[13px] text-muted">{accountTypeLabel(a.type)}</span>
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
            )}
          </li>
        ))}
        {!active.length && <li className="py-3 text-[15px] text-muted">No wallets yet. Add the places you keep money.</li>}
      </ul>

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
    startTransition(async () => {
      const input = { name, type, balance: value };
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
