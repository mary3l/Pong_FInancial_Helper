import { Suspense } from "react";
import { AddTransaction, AddTransactionSkeleton } from "@/components/add-transaction";
import { Modal } from "@/components/modal";

// Add opened from inside the app: shown over the current page.
export default function AddModal({ searchParams }: PageProps<"/add">) {
  return (
    <Modal path="/add" label="Add a transaction">
      <Suspense fallback={<AddTransactionSkeleton />}>
        <AddTransaction mode="modal" searchParams={searchParams} />
      </Suspense>
    </Modal>
  );
}
