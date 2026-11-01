import { connection } from "next/server";
import { Suspense } from "react";
import { getScheduled } from "@/lib/data";
import { today as getToday } from "@/lib/dates";
import { PlanTabs } from "../plan-tabs";
import { ScheduledManager } from "./scheduled-manager";

export const metadata = { title: "Scheduled · Pong Money" };

// Recurring and planned income and expenses: payroll, allowance, rent,
// tuition, a 13th month pay. They feed the forecast as anticipated
// cashflows; "Add income" / "Mark paid" logs the real transaction when it
// happens.
export default function ScheduledPage() {
  return (
    <div className="flex flex-col gap-4 lg:max-w-5xl">
      <h1 className="font-display text-3xl font-semibold">Plan</h1>
      <PlanTabs current="scheduled" />
      <Suspense fallback={<ScheduledSkeleton />}>
        <Scheduled />
      </Suspense>
    </div>
  );
}

async function Scheduled() {
  // Read the clock only at request time (Cache Components).
  await connection();
  const today = getToday();
  const { accounts, recurring, planned, items } = await getScheduled(today);
  return (
    <ScheduledManager
      accounts={accounts}
      recurring={recurring}
      planned={planned.filter((p) => p.dueOn >= today || !p.transactionId)}
      items={items}
      today={today}
    />
  );
}

function ScheduledSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2" aria-hidden="true">
      <div className="h-64 rounded-[20px] bg-line-soft" />
      <div className="h-64 rounded-[20px] bg-line-soft" />
    </div>
  );
}
