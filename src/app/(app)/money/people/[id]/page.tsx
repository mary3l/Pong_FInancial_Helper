import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getAccounts, getPeople, getTransactions } from "@/lib/data";
import { formatShortDay, today as getToday } from "@/lib/dates";
import { balanceEffect, formatPeso, paysInPesos } from "@/lib/money";
import { dueDate, isOverdue, reminderText, type PersonEntry } from "@/lib/people";
import { Avatar } from "../avatar";
import { EditPerson, ForgiveButton, PaymentForm, ReminderButton } from "../person-actions";

export const metadata = { title: "Person · Pong Money" };

// Design canvas 5.3: the balance with one person, Record payment, Send
// reminder, history, and Forgive remaining balance.
export default function PersonPage({ params }: PageProps<"/money/people/[id]">) {
  return (
    <div className="flex flex-col gap-4 lg:max-w-2xl">
      <Link href="/money/people" className="flex h-10 w-fit items-center font-extrabold text-sea-dark">‹ Utang &amp; pautang</Link>
      <Suspense fallback={<div className="h-[560px] rounded-[20px] bg-line-soft" />}>
        <PersonDetail params={params} />
      </Suspense>
    </div>
  );
}

const KIND_LABELS: Record<PersonEntry["kind"], string> = {
  lend: "Lent",
  borrow: "Borrowed",
  split: "Split",
  payment: "Paid back",
  forgive: "Forgiven",
};

async function PersonDetail({ params }: Pick<PageProps<"/money/people/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Read the clock only at request time (Cache Components).
  await connection();
  const today = getToday();
  const [people, accounts, history, user] = await Promise.all([
    getPeople({ includeArchived: true }),
    getAccounts({ includeArchived: true }),
    getTransactions({ accountId: id, limit: 100 }),
    getCurrentUser(),
  ]);
  const person = people.find((p) => p.id === id);
  if (!person) notFound();

  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const wallets = accounts.filter((a) => paysInPesos(a) && !a.archived);
  const due = dueDate(person);
  const late = isOverdue(person, today);
  const owesYou = person.balance > 0;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={person.name} size={52} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate font-display text-3xl font-semibold">{person.name}</h1>
          {person.contact && <span className="text-sm text-muted">{person.contact}</span>}
        </div>
        <EditPerson personId={person.id} name={person.name} contact={person.contact} />
      </div>

      <section className={`flex flex-col gap-1 rounded-[28px] p-6 ${late ? "bg-coral text-white" : "bg-sea text-white"}`}>
        <h2 className="text-sm font-bold uppercase opacity-90">
          {person.balance === 0 ? "All square" : owesYou ? `${person.name} owes you` : `You owe ${person.name}`}
        </h2>
        <span className="font-display text-4xl font-semibold">{formatPeso(Math.abs(person.balance))}</span>
        {due && person.balance !== 0 && (
          <span className="text-[15px] font-bold opacity-90">
            {late ? `Overdue · was due ${formatShortDay(due, today)}` : `Due ${formatShortDay(due, today)}`}
          </span>
        )}
      </section>

      {person.balance !== 0 && (
        <div className="grid grid-cols-2 gap-2">
          <PaymentForm personId={person.id} balance={person.balance} wallets={wallets} today={today} />
          {owesYou && <ReminderButton text={reminderText(person, today, user.name)} />}
        </div>
      )}

      <section aria-labelledby="history-heading" className="flex flex-col gap-2">
        <h2 id="history-heading" className="font-display text-xl font-semibold">History</h2>
        <ul className="flex flex-col rounded-[20px] bg-card px-4 py-1.5">
          {history.map((t) => {
            const entry = person.entries.find((e) => e.transactionId === t.id);
            const change = balanceEffect(t, person.id);
            const wallet = t.accountId === person.id ? t.toAccountId : t.accountId;
            const title =
              entry?.kind === "split" ? `Split: ${(t.note ?? "bill").replace(/^Split: /, "").replace(/ \(my share\)$/, "")}` : entry ? KIND_LABELS[entry.kind] : (t.note ?? "Transaction");
            const detail = [
              formatShortDay(t.occurredOn, today),
              wallet && `${change > 0 ? "from" : "into"} ${names.get(wallet) ?? "a wallet"}`,
              entry?.splitTotal && `share of ${formatPeso(entry.splitTotal)}`,
              entry?.kind !== "split" && t.note && !["Pautang", "Utang", "Paid back", "Paid me back", "Forgiven"].includes(t.note) && t.note,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={t.id} className="border-b border-line-soft last:border-0">
                <Link href={`/activity/${t.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2.5 text-ink">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-bold">{title}</span>
                    <span className="truncate text-[13px] text-muted">{detail}</span>
                  </span>
                  <span className="font-display text-[17px] font-semibold">
                    {change >= 0 ? "+" : "−"}
                    {formatPeso(Math.abs(change))}
                  </span>
                </Link>
              </li>
            );
          })}
          {!history.length && <li className="py-3 text-[15px] text-muted">Nothing yet.</li>}
        </ul>
        <p className="text-xs text-muted">+ means they owe you more, − means less (or you owe them).</p>
      </section>

      {person.balance !== 0 && <ForgiveButton personId={person.id} balance={person.balance} />}
    </>
  );
}
