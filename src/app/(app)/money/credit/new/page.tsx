import Link from "next/link";
import { CreditLineForm } from "../../credit-line-form";

export const metadata = { title: "Add BNPL · Pong Money" };

// Adds SPayLater, Atome or another buy-now-pay-later credit line.
export default function NewCreditLinePage() {
  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <Link href="/money" className="flex h-10 w-fit items-center font-extrabold text-sea-dark">‹ Money</Link>
      <h1 className="font-display text-3xl font-semibold">Add BNPL</h1>
      <p className="text-[15px] leading-relaxed text-muted">
        Buy now, pay later. Purchases on it show up in your spending right away; paying the bill
        just moves money from GCash or your bank.
      </p>
      <div className="rounded-[20px] bg-white p-4">
        <CreditLineForm />
      </div>
    </div>
  );
}
