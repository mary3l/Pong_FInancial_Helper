import { Suspense } from "react";
import { getAccounts } from "@/lib/data";
import { formatPeso, isSpendable, roundCents } from "@/lib/money";
import { WalletManager } from "./wallet-manager";

export const metadata = { title: "Money · Pong Money" };

// Design canvas 4.1, Phase 1 part: your wallets. SPayLater and loans arrive
// in Phase 3, utang & pautang in Phase 4.
export default function MoneyPage() {
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <h1 className="font-display text-3xl font-semibold">Money</h1>
      <div className="flex gap-6 border-b-2 border-line">
        <span aria-current="page" className="-mb-0.5 border-b-[3px] border-sea py-2 font-extrabold">
          Wallets
        </span>
        <span className="py-2 font-bold text-muted">
          Utang &amp; pautang <span className="text-xs">(soon)</span>
        </span>
      </div>
      <Suspense fallback={<div className="h-80 rounded-[20px] bg-line-soft" />}>
        <Wallets />
      </Suspense>
    </div>
  );
}

async function Wallets() {
  const accounts = await getAccounts({ includeArchived: true });
  const active = accounts.filter((a) => !a.archived);
  const total = roundCents(
    active.filter((a) => isSpendable(a.type)).reduce((sum, a) => sum + a.balance, 0),
  );

  return (
    <>
      <section className="flex flex-col gap-1 rounded-[20px] bg-white px-5 py-4">
        <span className="text-sm font-bold text-muted">You have</span>
        <span className="font-display text-3xl font-semibold">{formatPeso(total)}</span>
        <span className="text-[13px] text-muted">Across {active.length} {active.length === 1 ? "wallet" : "wallets"}</span>
      </section>
      <WalletManager accounts={accounts} />
    </>
  );
}
