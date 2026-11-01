import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddTransactionSkeleton } from "@/components/add-transaction";
import { TransactionForm } from "@/components/transaction-form";
import { getAccounts, getTransaction } from "@/lib/data";
import { today } from "@/lib/dates";

export const metadata = { title: "Edit · Pong Money" };

// Edit or delete one transaction from Activity.
export default function EditTransactionPage({ params }: PageProps<"/activity/[id]">) {
  return (
    <Suspense fallback={<AddTransactionSkeleton />}>
      <EditTransaction params={params} />
    </Suspense>
  );
}

async function EditTransaction({ params }: Pick<PageProps<"/activity/[id]">, "params">) {
  const { id } = await params;
  const [transaction, accounts] = await Promise.all([
    getTransaction(id),
    getAccounts({ includeArchived: true }),
  ]);
  if (!transaction) notFound();

  // Archived wallets stay hidden unless this transaction used one.
  const usable = accounts.filter(
    (a) => !a.archived || a.id === transaction.accountId || a.id === transaction.toAccountId,
  );

  return (
    <TransactionForm
      accounts={usable}
      templates={[]}
      transaction={transaction}
      today={today()}
      mode="page"
      closeHref={`/activity?p=${transaction.occurredOn}`}
    />
  );
}
