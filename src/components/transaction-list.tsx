import Link from "next/link";
import { PathIcon } from "@/components/icons";
import { categoryInfo } from "@/lib/categories";
import type { Account, Transaction } from "@/lib/data";
import { formatRelativeDay } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

/** Transactions grouped under day headings, each opening its edit screen. */
export function TransactionList({
  transactions,
  accounts,
  today,
  grouped = true,
}: {
  transactions: Transaction[];
  accounts: Account[];
  today: string;
  /** False for short lists that show the day on each row instead. */
  grouped?: boolean;
}) {
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const days: { date: string; items: Transaction[] }[] = [];
  for (const t of transactions) {
    const last = days.at(-1);
    if (grouped && last?.date === t.occurredOn) last.items.push(t);
    else days.push({ date: t.occurredOn, items: [t] });
  }

  return (
    <div className="flex flex-col">
      {days.map((day) => (
        <section key={`${day.date}-${day.items[0].id}`} aria-label={grouped ? formatRelativeDay(day.date, today) : undefined}>
          {grouped && (
            <h3 className="pt-3 pb-1 text-[13px] font-extrabold text-muted uppercase">
              {formatRelativeDay(day.date, today)}
            </h3>
          )}
          <ul className="flex flex-col">
            {day.items.map((t) => (
              <li key={t.id}>
                <TransactionRow txn={t} names={names} today={grouped ? null : today} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TransactionRow({
  txn,
  names,
  today,
}: {
  txn: Transaction;
  names: Map<string, string>;
  /** Set to show the day in the row. */
  today: string | null;
}) {
  const info = categoryInfo(txn.type, txn.category);
  const from = names.get(txn.accountId) ?? "Removed wallet";
  const to = txn.toAccountId ? (names.get(txn.toAccountId) ?? "Removed wallet") : "";

  const title = txn.type === "transfer" ? `${from} → ${to}` : txn.note || info.label;
  const detail =
    txn.type === "transfer"
      ? [txn.note || "Transfer", "not spending"]
      : [txn.note ? info.label : null, from];
  if (today) detail.unshift(formatRelativeDay(txn.occurredOn, today));

  const amount =
    txn.type === "expense"
      ? `−${formatPeso(txn.amount)}`
      : txn.type === "income"
        ? `+${formatPeso(txn.amount)}`
        : formatPeso(txn.amount);

  return (
    <Link
      href={`/activity/${txn.id}`}
      className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-mint"
    >
      <span className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] ${info.tint}`}>
        <PathIcon d={info.icon} size={21} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">{title}</span>
        <span className="truncate text-[13px] text-muted">{detail.filter(Boolean).join(" · ")}</span>
      </span>
      <span
        className={`shrink-0 font-display text-[17px] font-semibold ${
          txn.type === "income" ? "text-sea" : txn.type === "transfer" ? "text-muted" : ""
        }`}
      >
        {amount}
      </span>
      <span className="sr-only">{txn.type === "transfer" ? "Transfer" : txn.type === "income" ? "Income" : "Expense"}, edit</span>
    </Link>
  );
}
