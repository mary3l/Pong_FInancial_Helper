import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { DisplayNameForm } from "@/components/display-name-form";
import { getCurrentUser } from "@/lib/auth";
import { getRecurringItems } from "@/lib/data";
import { formatPeso } from "@/lib/money";
import { describeSchedule } from "@/lib/schedule";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold">Settings &amp; tools</h1>

      <section className="flex flex-col gap-4 rounded-3xl bg-white p-6">
        <h2 className="font-display text-xl font-semibold">Profile</h2>
        <Suspense fallback={<div className="h-28 rounded-[14px] bg-line-soft" />}>
          <Profile />
        </Suspense>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl bg-white p-6">
        <h2 className="font-display text-xl font-semibold">Payday &amp; bills</h2>
        <Suspense fallback={<p className="h-12 w-64 rounded bg-line-soft" />}>
          <PaydaySummary />
        </Suspense>
        <Link
          href="/setup/payday?from=settings"
          className="flex h-12 items-center self-start rounded-[18px] border-2 border-line px-5 font-bold text-ink hover:bg-mint"
        >
          Edit payday &amp; bills
        </Link>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl bg-white p-6">
        <h2 className="font-display text-xl font-semibold">Account</h2>
        <Suspense fallback={<p className="h-6 w-56 rounded bg-line-soft" />}>
          <SignedInAs />
        </Suspense>
        <form action={signOut}>
          <button
            type="submit"
            className="h-12 rounded-[18px] border-2 border-line px-5 font-bold text-ink hover:bg-mint"
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}

async function Profile() {
  const user = await getCurrentUser();
  return <DisplayNameForm initialName={user.name} />;
}

async function PaydaySummary() {
  const items = await getRecurringItems();
  const payday = items.find((i) => i.kind === "payday");
  const bills = items.filter((i) => i.kind === "bill");
  return (
    <div className="flex flex-col gap-1 text-[15px]">
      <p>
        <strong>Payday:</strong>{" "}
        {payday
          ? `${describeSchedule(payday)}${payday.amount ? ` · ${formatPeso(payday.amount)}` : ""}`
          : "Irregular or not set"}
      </p>
      <p className="text-muted">
        {bills.length
          ? `${bills.length} regular ${bills.length === 1 ? "bill" : "bills"}: ${bills.map((b) => b.name).join(", ")}`
          : "No regular bills yet."}
      </p>
    </div>
  );
}

async function SignedInAs() {
  const user = await getCurrentUser();
  return (
    <p className="text-muted">
      Signed in as <strong className="text-ink">{user.email}</strong>
    </p>
  );
}
