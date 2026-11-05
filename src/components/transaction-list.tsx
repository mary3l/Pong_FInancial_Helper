import Link from "next/link";
import { PathIcon } from "@/components/icons";
import { categoryInfo } from "@/lib/categories";
import type { Account, Transaction } from "@/lib/data";
import { formatRelativeDay, formatShortDay, transactionTime } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { groupSplits, type ListItem, type SplitBill } from "@/lib/splits";

/**
 * Transactions grouped under day headings, each opening its edit screen. A
 * split bill shows as one row that opens its breakdown.
 */
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
  const days: { date: string; items: ListItem[] }[] = [];
  for (const item of groupSplits(transactions)) {
    const date = item.kind === "one" ? item.txn.occurredOn : item.split.occurredOn;
    const last = days.at(-1);
    if (grouped && last?.date === date) last.items.push(item);
    else days.push({ date, items: [item] });
  }

  return (
    <div className="flex flex-col">
      {days.map((day) => (
        <section key={`${day.date}-${itemKey(day.items[0])}`} aria-label={grouped ? formatRelativeDay(day.date, today) : undefined}>
          {grouped && (
            <h3 className="pt-3 pb-1 text-[13px] font-extrabold text-muted uppercase">
              {formatRelativeDay(day.date, today)}
            </h3>
          )}
          <ul className="flex flex-col">
            {day.items.map((item) => (
              <li key={itemKey(item)}>
                {item.kind === "one" ? (
                  <TransactionRow txn={item.txn} names={names} today={grouped ? null : today} />
                ) : (
                  <SplitRow split={item.split} names={names} today={grouped ? null : today} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * "Nov 5, 3:42 PM" under a day heading; "Yesterday, 3:42 PM" in short lists
 * with no headings (`today` set). Just the day if there's no time.
 */
function when(
  item: { occurredOn: string; occurredTime: string | null; createdAt: string | null },
  today: string | null,
): string {
  const day = today ? formatRelativeDay(item.occurredOn, today) : formatShortDay(item.occurredOn);
  return [day, transactionTime(item)].filter(Boolean).join(", ");
}

function itemKey(item: ListItem) {
  return item.kind === "one" ? item.txn.id : `split-${item.split.splitId}`;
}

/** One row for a whole split bill: your share is the spending, the bill total underneath. */
function SplitRow({
  split,
  names,
  today,
}: {
  split: SplitBill;
  names: Map<string, string>;
  today: string | null;
}) {
  const info = categoryInfo("expense", split.mine?.category ?? "family");
  const people = split.others.length;
  const detail = [
    split.mine ? info.label : null,
    names.get(split.accountId) ?? "Removed wallet",
    `split with ${people}`,
  ];
  detail.unshift(when(split, today));

  return (
    <Link
      href={`/activity/split/${split.splitId}`}
      className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-mint"
    >
      <span className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] ${info.tint}`}>
        <PathIcon d={info.icon} size={21} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">{split.title}</span>
        <span className="truncate text-[13px] text-muted">{detail.filter(Boolean).join(" · ")}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="font-display text-[17px] font-semibold">
          {split.mine ? `−${formatPeso(split.mine.amount)}` : formatPeso(0)}
        </span>
        <span className="text-xs text-muted">of {formatPeso(split.total)}</span>
      </span>
      <span className="sr-only">Split bill, see breakdown</span>
    </Link>
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
  detail.unshift(when(txn, today));

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
