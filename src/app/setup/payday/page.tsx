import { Suspense } from "react";
import { getAccounts, getRecurringItems } from "@/lib/data";
import { SetupHeader } from "../setup-header";
import { PaydayForm } from "./payday-form";

export const metadata = { title: "Payday and bills · Pong Money" };

// Step 2 of setup. Settings links here with ?from=settings to edit later.
export default function SetupPaydayPage({ searchParams }: PageProps<"/setup/payday">) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Suspense fallback={<div className="h-[560px] rounded-3xl bg-line-soft" />}>
        <Payday searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Payday({ searchParams }: Pick<PageProps<"/setup/payday">, "searchParams">) {
  const [{ from }, accounts, items] = await Promise.all([
    searchParams,
    getAccounts(),
    getRecurringItems(),
  ]);
  const editing = from === "settings";

  return (
    <>
      <SetupHeader
        step={editing ? undefined : 2}
        title="Payday and regular bills"
        message="These tell me how long your money has to last. You can change them anytime."
        mood="listen"
      />
      <PaydayForm
        accounts={accounts}
        payday={items.find((i) => i.kind === "payday") ?? null}
        bills={items.filter((i) => i.kind === "bill")}
        editing={editing}
      />
    </>
  );
}
