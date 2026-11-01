import { Suspense } from "react";
import { AddTransaction, AddTransactionSkeleton } from "@/components/add-transaction";

export const metadata = { title: "Add · Pong Money" };

// Opening /add directly (or reloading it) shows Add as a page. Taps on + from
// inside the app open the same form as a modal instead: see @modal/(.)add.
export default function AddPage({ searchParams }: PageProps<"/add">) {
  return (
    <Suspense fallback={<AddTransactionSkeleton />}>
      <AddTransaction mode="page" searchParams={searchParams} />
    </Suspense>
  );
}
