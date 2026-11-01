import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAccounts, getPeople } from "@/lib/data";
import { today } from "@/lib/dates";
import { isSpendable } from "@/lib/money";
import { LendForm } from "./lend-form";

export const metadata = { title: "Lend / borrow · Pong Money" };

// Design canvas 5.2: I lent (pautang) or I borrowed (utang).
export default function LendPage({ searchParams }: PageProps<"/money/people/new">) {
  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <Link href="/money/people" className="flex h-10 w-fit items-center font-extrabold text-sea-dark">‹ Utang &amp; pautang</Link>
      <h1 className="font-display text-3xl font-semibold">Utang / Pautang</h1>
      <Suspense fallback={<div className="h-[560px] rounded-[20px] bg-line-soft" />}>
        <Lend searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Lend({ searchParams }: Pick<PageProps<"/money/people/new">, "searchParams">) {
  await connection();
  const [{ who, direction }, accounts, people] = await Promise.all([searchParams, getAccounts(), getPeople()]);
  return (
    <LendForm
      wallets={accounts.filter((a) => isSpendable(a.type))}
      people={people.map((p) => ({ id: p.id, name: p.name }))}
      initialPerson={typeof who === "string" ? who : null}
      initialDirection={direction === "borrow" ? "borrow" : "lend"}
      today={today()}
    />
  );
}
