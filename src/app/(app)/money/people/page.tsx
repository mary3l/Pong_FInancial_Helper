import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChevronIcon } from "@/components/icons";
import { Pong } from "@/components/pong";
import { getAccounts, getPeople, getTransactions } from "@/lib/data";
import { daysBetween, formatShortDay, today as getToday } from "@/lib/dates";
import { formatPeso, roundCents } from "@/lib/money";
import { dueDate, isOverdue, type Person } from "@/lib/people";
import { MoneyTabs } from "../money-tabs";
import { Avatar } from "./avatar";
import { SettleButton } from "./person-actions";

export const metadata = { title: "Utang & pautang · Pong Money" };

// Design canvas 5.1: who owes you (oldest first) and who you owe.
export default function PeoplePage() {
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <h1 className="font-display text-3xl font-semibold">Money</h1>
      <MoneyTabs current="people" />
      <Suspense fallback={<div className="h-80 rounded-[20px] bg-line-soft" />}>
        <People />
      </Suspense>
    </div>
  );
}

async function People() {
  await connection();
  const today = getToday();
  const [people, accounts, recent] = await Promise.all([
    getPeople(),
    getAccounts({ includePeople: true }),
    getTransactions({ limit: 200 }),
  ]);
  const oweYou = people.filter((p) => p.balance > 0);
  const youOwe = people.filter((p) => p.balance < 0);
  const owedTotal = roundCents(oweYou.reduce((sum, p) => sum + p.balance, 0));
  const oweTotal = roundCents(youOwe.reduce((sum, p) => sum - p.balance, 0));
  const overdue = oweYou.filter((p) => isOverdue(p, today)).length;

  // The latest note for each person, e.g. "Split Grab ride · Nov 7".
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const lastNote = (p: Person) => {
    const t = recent.find((x) => x.accountId === p.id || x.toAccountId === p.id);
    return t ? `${t.note ?? "Utang"} · ${formatShortDay(t.occurredOn, today)}` : null;
  };
  const sinceOldest = (p: Person) => dueDate(p) ?? "9999-12-31";

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-2xl bg-white px-4 py-3">
          <span className="text-xs font-bold text-muted">Owed to you</span>
          <span className="font-display text-2xl font-semibold">{formatPeso(owedTotal)}</span>
          <span className="text-xs text-muted">
            {oweYou.length} {oweYou.length === 1 ? "person" : "people"}
            {overdue > 0 && <strong className="text-coral-text"> · {overdue} overdue</strong>}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl bg-white px-4 py-3">
          <span className="text-xs font-bold text-muted">You owe</span>
          <span className="font-display text-2xl font-semibold">{formatPeso(oweTotal)}</span>
          <span className="text-xs text-muted">{youOwe.length} {youOwe.length === 1 ? "person" : "people"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/money/people/new" className="flex h-12 items-center justify-center rounded-[18px] bg-sun font-extrabold text-ink">
          + Lend / borrow
        </Link>
        <Link href="/add?split=1" className="flex h-12 items-center justify-center rounded-[18px] border-2 border-sea font-extrabold text-sea-dark">
          + Split a bill
        </Link>
      </div>

      {people.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white px-6 py-10 text-center">
          <Pong mood="listen" size={100} decorative />
          <p className="max-w-xs text-[15px] text-muted">
            Lent someone money, or split dinner? I&apos;ll keep track of who owes whom, and I
            won&apos;t count pautang as yours to spend until it&apos;s paid back.
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="owe-you-heading" className="flex flex-col gap-2">
            <h2 id="owe-you-heading" className="text-[13px] font-extrabold text-muted">OWE YOU · OLDEST FIRST</h2>
            <ul className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
              {[...oweYou].sort((a, b) => sinceOldest(a).localeCompare(sinceOldest(b))).map((p) => {
                const due = dueDate(p);
                const late = isOverdue(p, today);
                return (
                  <li key={p.id} className="border-b border-line-soft last:border-0">
                    <Link href={`/money/people/${p.id}`} className="flex min-h-14 items-center gap-3 py-2.5 text-ink">
                      <Avatar name={p.name} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-bold">{p.name}</span>
                        <span className={`truncate text-[13px] ${late ? "font-bold text-coral-text" : "text-muted"}`}>
                          {late
                            ? `Overdue ${daysBetween(due!, today)} ${daysBetween(due!, today) === 1 ? "day" : "days"}`
                            : due
                              ? `Expected ${formatShortDay(due, today)}`
                              : lastNote(p)}
                        </span>
                      </span>
                      <span className="font-display text-[17px] font-semibold">{formatPeso(p.balance)}</span>
                      <ChevronIcon size={20} className="text-muted" />
                    </Link>
                  </li>
                );
              })}
              {!oweYou.length && <li className="py-3 text-[15px] text-muted">Nobody owes you right now.</li>}
            </ul>
          </section>

          <section aria-labelledby="you-owe-heading" className="flex flex-col gap-2">
            <h2 id="you-owe-heading" className="text-[13px] font-extrabold text-muted">YOU OWE</h2>
            <ul className="flex flex-col rounded-[20px] bg-white px-4 py-1.5">
              {youOwe.map((p) => (
                <li key={p.id} className="flex min-h-14 items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
                  <Link href={`/money/people/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-ink">
                    <Avatar name={p.name} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">{p.name}</span>
                      <span className="truncate text-[13px] text-muted">
                        {dueDate(p) ? `Due ${formatShortDay(dueDate(p)!, today)}` : lastNote(p)}
                      </span>
                    </span>
                  </Link>
                  <SettleButton personId={p.id} label={`Pay ${formatPeso(-p.balance)}`} />
                </li>
              ))}
              {!youOwe.length && <li className="py-3 text-[15px] text-muted">You don&apos;t owe anyone. Nice!</li>}
            </ul>
          </section>

          {people.some((p) => p.balance === 0) && (
            <p className="text-sm text-muted">
              <strong className="text-ink">All square:</strong>{" "}
              {people.filter((p) => p.balance === 0).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link href={`/money/people/${p.id}`} className="font-bold text-sea-dark underline">{names.get(p.id)}</Link>
                </span>
              ))}
            </p>
          )}
        </>
      )}
      <p className="text-xs text-muted">
        Lending moves money out of your wallet but isn&apos;t spending: it&apos;s still yours. Safe to
        spend and the forecast never count pautang until it&apos;s paid back.
      </p>
    </>
  );
}
