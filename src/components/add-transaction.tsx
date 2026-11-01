import { TransactionForm } from "@/components/transaction-form";
import { getAccounts, getTransactions, templatesFrom } from "@/lib/data";
import { today } from "@/lib/dates";

// Loads wallets and recent templates for Add. Reads the session, so render
// it inside <Suspense>.
export async function AddTransaction({ mode }: { mode: "modal" | "page" }) {
  const [accounts, recent] = await Promise.all([
    getAccounts(),
    getTransactions({ limit: 60 }),
  ]);
  const templates = templatesFrom(recent, new Set(accounts.map((a) => a.id)));

  return <TransactionForm accounts={accounts} templates={templates} today={today()} mode={mode} />;
}

export function AddTransactionSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 p-5 lg:flex-row lg:gap-7 lg:p-7">
      <div className="h-[420px] flex-1 rounded-[22px] bg-line-soft" />
      <div className="hidden h-[420px] flex-1 rounded-[22px] bg-line-soft lg:block" />
    </div>
  );
}
