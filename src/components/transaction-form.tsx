"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState, useTransition } from "react";
import {
  deleteTransaction,
  saveTransaction,
} from "@/app/transaction-actions";
import { CloseIcon, PathIcon } from "@/components/icons";
import { Pong, type PongMood } from "@/components/pong";
import {
  amountToExpression,
  evaluate,
  hasOperator,
  keyFromKeyboard,
  press,
  prettyExpression,
  type Key,
} from "@/lib/calculator";
import { categoriesFor, categoryInfo } from "@/lib/categories";
import type { Account, Template, Transaction } from "@/lib/data";
import { formatRelativeDay, isValidDate } from "@/lib/dates";
import { balanceEffect, formatPeso, type TransactionType } from "@/lib/money";

// Design canvas 2.2 (phone) and "Web · Add expense modal" (desktop).
// One form for adding and editing expenses, income and transfers.

const TYPES: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

const TITLES: Record<TransactionType, string> = {
  expense: "Add expense",
  income: "Add income",
  transfer: "Move money",
};

/** Values to start Add with, e.g. from "Add income" on a scheduled payday. */
export type Prefill = {
  type: "expense" | "income";
  amount: number | null;
  category: string | null;
  accountId: string | null;
  note: string;
  /** "<recurring item id>|<date>": saving logs that occurrence. */
  link: string | null;
};

type KeyDef = { key: Key; label: string; kind: "num" | "op" | "fn" | "eq"; className?: string };

const KEYS: KeyDef[] = [
  { key: "C", label: "Clear", kind: "fn" },
  { key: "⌫", label: "Delete last digit", kind: "fn" },
  { key: "÷", label: "Divide", kind: "op" },
  { key: "×", label: "Multiply", kind: "op" },
  { key: "7", label: "7", kind: "num" },
  { key: "8", label: "8", kind: "num" },
  { key: "9", label: "9", kind: "num" },
  { key: "−", label: "Minus", kind: "op" },
  { key: "4", label: "4", kind: "num" },
  { key: "5", label: "5", kind: "num" },
  { key: "6", label: "6", kind: "num" },
  { key: "+", label: "Plus", kind: "op" },
  { key: "1", label: "1", kind: "num" },
  { key: "2", label: "2", kind: "num" },
  { key: "3", label: "3", kind: "num" },
  { key: "=", label: "Equals", kind: "eq", className: "row-span-2" },
  { key: "0", label: "0", kind: "num", className: "col-span-2" },
  { key: ".", label: "Decimal point", kind: "num" },
];

const KEY_STYLE = {
  num: "bg-white font-medium",
  op: "bg-sun-tint font-semibold",
  fn: "bg-[#e3efe8] font-semibold",
  eq: "bg-sea font-semibold text-white",
};

export function TransactionForm({
  accounts,
  templates,
  transaction,
  today,
  mode,
  closeHref = "/",
  prefill,
}: {
  accounts: Account[];
  templates: Template[];
  /** The transaction being edited; omit to add a new one. */
  transaction?: Transaction;
  today: string;
  /** "modal" closes with router.back(); "page" goes to `closeHref`. */
  mode: "modal" | "page";
  closeHref?: string;
  prefill?: Prefill;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editing = Boolean(transaction);

  const prefillAccount = accounts.find((a) => a.id === prefill?.accountId)?.id;
  const defaultFrom = prefillAccount ?? templates[0]?.accountId ?? accounts[0]?.id ?? "";
  const [type, setType] = useState<TransactionType>(transaction?.type ?? prefill?.type ?? "expense");
  const startAmount = transaction?.amount ?? prefill?.amount;
  const [calc, setCalc] = useState<{ expr: string; error: string | null }>({
    expr: startAmount ? amountToExpression(startAmount) : "",
    error: null,
  });
  const prefillCategory = (t: "expense" | "income") =>
    prefill?.type === t && prefill.category ? prefill.category : null;
  const [categories, setCategories] = useState({
    expense: transaction?.type === "expense" ? transaction.category : (prefillCategory("expense") ?? "food"),
    income: transaction?.type === "income" ? transaction.category : (prefillCategory("income") ?? "salary"),
  });
  const [accountId, setAccountId] = useState(transaction?.accountId ?? defaultFrom);
  const [toAccountId, setToAccountId] = useState(
    transaction?.toAccountId ?? accounts.find((a) => a.id !== defaultFrom)?.id ?? "",
  );
  const [date, setDate] = useState(transaction?.occurredOn ?? today);
  const [note, setNote] = useState(transaction?.note ?? prefill?.note ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const category = type === "transfer" ? null : categories[type];
  const value = evaluate(calc.expr);
  const amount = value && value > 0 ? value : 0;
  const account = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);

  function close() {
    if (mode === "modal") router.back();
    else router.push(closeHref);
  }

  function pressKey(key: Key) {
    setSaveError(null);
    setCalc((c) => {
      const r = press(c.expr, key);
      return { expr: r.expr, error: r.error ?? null };
    });
  }

  function pickType(next: TransactionType) {
    setType(next);
    setSaveError(null);
    if (next === "transfer" && toAccountId === accountId) {
      setToAccountId(accounts.find((a) => a.id !== accountId)?.id ?? "");
    }
  }

  function pickFrom(id: string) {
    setAccountId(id);
    if (id === toAccountId) setToAccountId(accounts.find((a) => a.id !== id)?.id ?? "");
  }

  function applyTemplate(t: Template) {
    setType(t.type);
    setCalc({ expr: amountToExpression(t.amount), error: null });
    if (t.type !== "transfer" && t.category) {
      setCategories((c) => ({ ...c, [t.type]: t.category }));
    }
    setAccountId(t.accountId);
    if (t.toAccountId) setToAccountId(t.toAccountId);
    setNote(t.note ?? "");
    setSaveError(null);
  }

  function submit() {
    if (pending) return;
    if (value === null) {
      setCalc((c) => ({ ...c, error: "Can't divide by 0" }));
      return;
    }
    if (value < 0) {
      setCalc((c) => ({ ...c, error: "Amount can't be negative" }));
      return;
    }
    if (!amount) {
      setSaveError("Enter an amount above ₱0.");
      return;
    }
    startTransition(async () => {
      const result = await saveTransaction(
        { type, amount, accountId, toAccountId: type === "transfer" ? toAccountId : null, category, note, occurredOn: date },
        transaction?.id,
        // The link only holds for the type it was opened with.
        prefill?.link && type === prefill.type ? prefill.link : undefined,
      );
      if (result.error) setSaveError(result.error);
      else close();
    });
  }

  function remove() {
    if (!transaction) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const result = await deleteTransaction(transaction.id);
      if (result.error) setSaveError(result.error);
      else close();
    });
  }

  // Keyboard: digits, + − * /, Enter saves, Backspace, Esc closes.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (e.key === "Escape") {
      // The modal's dialog handles Esc itself.
      if (mode === "page") close();
      return;
    }
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "Enter") {
      if (target?.closest("button, a")) return;
      e.preventDefault();
      submit();
      return;
    }
    const key = keyFromKeyboard(e.key);
    if (key) {
      e.preventDefault();
      pressKey(key);
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!accounts.length) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <Pong mood="ask" size={110} decorative />
        <p className="max-w-sm text-base leading-relaxed text-muted">
          Add a wallet first, like Cash or GCash, so I know where the money comes from.
        </p>
        <Link href="/money" className="flex h-12 items-center rounded-[18px] bg-sun px-5 font-extrabold text-ink">
          Add a wallet
        </Link>
        <button type="button" onClick={close} className="h-11 font-extrabold text-sea-dark">
          Close
        </button>
      </div>
    );
  }

  const pong = pongSays({ type, amount, error: calc.error, account, toAccount, transaction });
  const title = editing ? "Edit transaction" : TITLES[type];
  const saveLabel = pending ? "Saving…" : amount ? `Save ${formatPeso(amount)}` : "Enter an amount";
  const transferWallets = accounts.filter((a) => a.id !== accountId);

  const typePicker = (className: string) => (
    <div role="group" aria-label="Type" className={`gap-1 rounded-2xl bg-white p-1 ${className}`}>
      {TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-pressed={type === t.value}
          onClick={() => pickType(t.value)}
          className={`h-[34px] rounded-xl px-3 text-sm ${
            type === t.value ? "bg-sea font-extrabold text-white" : "font-bold text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  const walletChips = (selected: string, onPick: (id: string) => void, list: Account[], label: string) => (
    <div role="group" aria-label={label} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
      {list.map((a) => (
        <button
          key={a.id}
          type="button"
          aria-pressed={selected === a.id}
          onClick={() => onPick(a.id)}
          className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-extrabold ${
            selected === a.id ? "bg-ink text-white" : "bg-white text-ink hover:bg-sea-tint"
          }`}
        >
          {a.name}
        </button>
      ))}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={`flex flex-col gap-3 lg:flex-row lg:gap-7 ${mode === "modal" ? "px-5 pt-3 lg:p-7" : ""}`}
    >
      {/* Left column from lg up: amount and keypad. Below lg both columns
          dissolve into one list ordered by the order-* classes. */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-3.5">
        <div className="order-1 hidden items-center justify-between lg:order-none lg:flex">
          <h2 className="font-display text-[26px] font-semibold">{title}</h2>
          <button type="button" onClick={close} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
            <CloseIcon size={18} />
          </button>
        </div>

        <div aria-live="polite" className="order-2 flex flex-col items-center lg:order-none lg:items-end lg:rounded-[22px] lg:bg-white lg:px-[18px] lg:py-3.5">
          <span className="min-h-6 text-[17px] font-bold text-muted">
            {hasOperator(calc.expr) ? prettyExpression(calc.expr) : " "}
          </span>
          <span className="font-display text-[52px] leading-[1.05] font-semibold">
            {formatPeso(Math.max(0, value ?? 0))}
          </span>
          <span className={`min-h-5 text-sm font-bold ${calc.error ? "text-coral-text" : "text-muted"}`}>
            {calc.error ?? summary({ type, category, account, toAccount, date, today })}
          </span>
        </div>

        <div className="order-9 grid grid-cols-4 grid-rows-[repeat(5,48px)] gap-2 lg:order-none lg:grid-rows-[repeat(5,58px)]">
          {KEYS.map((k) => (
            <button
              key={k.key}
              type="button"
              aria-label={k.label}
              onClick={() => pressKey(k.key)}
              className={`rounded-2xl font-display text-[24px] active:scale-95 ${KEY_STYLE[k.kind]} ${k.className ?? ""}`}
            >
              {k.key}
            </button>
          ))}
        </div>

        <p className="hidden flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-muted lg:flex">
          <strong className="text-ink">Keyboard works too:</strong>
          <span>0–9 and .</span>
          <span>+ − * /</span>
          <span>Enter = save</span>
          <span>Backspace</span>
          <span>Esc = close</span>
        </p>
      </div>

      {/* Right column from lg up: what it was for and where it came from. */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-4">
        <div className="order-0 flex h-11 items-center justify-between lg:hidden">
          <button type="button" onClick={close} className="w-16 text-left font-bold text-sea">
            Cancel
          </button>
          {typePicker("flex")}
          <span className="w-16" aria-hidden="true" />
        </div>
        <h2 className="sr-only lg:hidden">{title}</h2>
        {typePicker("hidden self-start lg:flex")}

        <div className="order-3 flex min-h-14 items-center gap-2 rounded-[18px] bg-white py-1 pr-3 pl-1 lg:order-none lg:min-h-[68px] lg:rounded-[20px]">
          <Pong mood={pong.mood} size={52} decorative />
          <p className="text-sm leading-snug lg:text-[15px]">{pong.line}</p>
        </div>

        {!editing && templates.length > 0 && (
          <div className="order-4 flex flex-col gap-1.5 lg:order-none">
            <span id="recent-label" className="text-xs font-extrabold text-muted">RECENT · TAP TO REUSE</span>
            <div role="group" aria-labelledby="recent-label" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              {templates.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="h-9 shrink-0 rounded-full border-2 border-dashed border-line bg-white px-3 text-[13px] font-bold hover:border-sea"
                >
                  {templateLabel(t, accounts)}
                </button>
              ))}
            </div>
          </div>
        )}

        {type !== "transfer" && (
          <div className="order-5 flex flex-col gap-1.5 lg:order-none">
            <span id="category-label" className="hidden text-sm font-extrabold lg:block">Category</span>
            <div role="group" aria-label="Category" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
              {categoriesFor(type).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={category === c.key}
                  onClick={() => setCategories((cs) => ({ ...cs, [type]: c.key }))}
                  className={`flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl border-[2.5px] bg-white px-1 py-1.5 text-xs font-extrabold lg:w-auto ${
                    category === c.key ? "border-sea" : "border-transparent"
                  }`}
                >
                  <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-xl ${c.tint}`}>
                    <PathIcon d={c.icon} size={19} />
                  </span>
                  <span className="max-w-full truncate">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="order-6 flex flex-col gap-1.5 lg:order-none">
          <span className="text-sm font-extrabold">
            {type === "expense" ? "Pay with" : type === "income" ? "Received in" : "From"}
          </span>
          {walletChips(accountId, pickFrom, accounts, type === "expense" ? "Pay with" : type === "income" ? "Received in" : "From")}
        </div>

        {type === "transfer" && (
          <div className="order-7 flex flex-col gap-1.5 lg:order-none">
            <span className="text-sm font-extrabold">To</span>
            {transferWallets.length ? (
              walletChips(toAccountId, setToAccountId, transferWallets, "To")
            ) : (
              <p className="text-sm text-muted">
                Add a second wallet in <Link href="/money" className="font-extrabold text-sea-dark underline">Money</Link> to move money between them.
              </p>
            )}
            <p className="text-xs text-muted">Moving money between your own wallets is never counted as spending.</p>
          </div>
        )}

        <div className="order-8 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-2.5 lg:order-none lg:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="txn-date" className="text-[13px] font-extrabold">Date</label>
            <input
              id="txn-date"
              type="date"
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
              className="h-11 min-w-0 rounded-[14px] bg-white px-3 text-[15px] outline-none focus:ring-2 focus:ring-sea"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="txn-note" className="text-[13px] font-extrabold">Note</label>
            <input
              id="txn-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              placeholder="optional"
              className="h-11 min-w-0 rounded-[14px] bg-white px-3 text-[15px] outline-none focus:ring-2 focus:ring-sea"
            />
          </div>
        </div>

        <div className="hidden flex-1 lg:block" />

        <div
          className={`order-10 flex flex-col gap-2 pb-5 lg:order-none lg:pb-0 ${
            mode === "modal" ? "sticky bottom-0 -mx-5 bg-mint px-5 pt-2 lg:static lg:mx-0 lg:px-0 lg:pt-0" : ""
          }`}
        >
          <p role="alert" className="text-sm font-bold text-coral-text empty:hidden">{saveError}</p>
          <div className="flex gap-2.5">
            {editing ? (
              <button
                type="button"
                onClick={remove}
                onBlur={() => setConfirmDelete(false)}
                disabled={pending}
                className={`h-14 flex-1 rounded-[18px] font-extrabold ${
                  confirmDelete ? "bg-coral text-white" : "bg-white text-coral-text"
                }`}
              >
                {confirmDelete ? "Tap again to delete" : "Delete"}
              </button>
            ) : (
              <button type="button" onClick={close} className="hidden h-14 flex-1 rounded-[18px] bg-white font-extrabold lg:block">
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={pending}
              className="h-14 flex-[2] rounded-[18px] bg-sun text-[17px] font-extrabold text-ink disabled:opacity-60"
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function summary({
  type,
  category,
  account,
  toAccount,
  date,
  today,
}: {
  type: TransactionType;
  category: string | null;
  account?: Account;
  toAccount?: Account;
  date: string;
  today: string;
}) {
  const when = isValidDate(date) ? formatRelativeDay(date, today) : "Pick a date";
  if (type === "transfer") {
    return `${account?.name ?? "?"} → ${toAccount?.name ?? "?"} · ${when}`;
  }
  return `${categoryInfo(type, category).label} · ${account?.name ?? ""} · ${when}`;
}

function templateLabel(t: Template, accounts: Account[]) {
  const name = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "";
  if (t.type === "transfer") return `${name(t.accountId)} → ${name(t.toAccountId)} · ${formatPeso(t.amount)}`;
  const what = t.note || categoryInfo(t.type, t.category).label;
  return `${what} · ${formatPeso(t.amount)} · ${name(t.accountId)}`;
}

/** What Pong says while you type: how the wallet balance changes. */
function pongSays({
  type,
  amount,
  error,
  account,
  toAccount,
  transaction,
}: {
  type: TransactionType;
  amount: number;
  error: string | null;
  account?: Account;
  toAccount?: Account;
  transaction?: Transaction;
}): { mood: PongMood; line: string } {
  if (error) return { mood: "worried", line: `${error}. Check the numbers?` };

  // When editing, the balance already includes the original transaction.
  const before = (a: Account) => a.balance - (transaction ? balanceEffect(transaction, a.id) : 0);

  if (!amount) {
    if (type === "income") return { mood: "happy", line: "Nice! How much came in?" };
    if (type === "transfer") return { mood: "listen", line: "Moving money between your wallets is never spending." };
    return { mood: "ask", line: "Type an amount. You can add them up, like 120 + 45 + 20." };
  }
  if (!account) return { mood: "ask", line: "Which wallet is it?" };

  const left = before(account) - amount;
  if (type === "income") {
    return { mood: "proud", line: `${account.name} goes up to ${formatPeso(before(account) + amount)}.` };
  }
  if (type === "transfer") {
    if (left < 0) {
      return { mood: "worried", line: `${account.name} only has ${formatPeso(before(account))}.` };
    }
    if (!toAccount) return { mood: "ask", line: "Where is the money going?" };
    return {
      mood: "listen",
      line: `${account.name} will have ${formatPeso(left)}, ${toAccount.name} ${formatPeso(before(toAccount) + amount)}. Not spending.`,
    };
  }
  if (left < 0) {
    return { mood: "shocked", line: `That's ${formatPeso(-left)} more than ${account.name} has right now!` };
  }
  return { mood: "happy", line: `${account.name} will have ${formatPeso(left)} left.` };
}
