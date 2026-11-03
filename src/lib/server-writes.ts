import "server-only";

import type { signedInClient } from "@/lib/auth";
import type { PaymentRow } from "@/lib/installments";
import { isSpendable, roundCents, type AccountType } from "@/lib/money";

// Write helpers shared by Server Actions. Not actions themselves: they take
// the signed-in client from the action that calls them.

export type Client = NonNullable<Awaited<ReturnType<typeof signedInClient>>>;

/**
 * The wallet money comes from or lands in for a scheduled item: the one
 * saved with it if it's still in use, else your first cash, bank or e-wallet.
 */
export async function pickWallet(supabase: Client, preferred: string | null): Promise<string | null> {
  const { data } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("archived", false)
    .order("created_at");
  const wallets = (data ?? []).filter((a) => isSpendable(a.type as AccountType));
  return wallets.find((a) => a.id === preferred)?.id ?? wallets[0]?.id ?? null;
}

/** Saves an installment plan and its payments. Its id, or null if anything failed (nothing is left behind). */
export async function savePlan(
  supabase: Client,
  plan: {
    kind: "bnpl" | "loan";
    accountId: string;
    name: string;
    principal: number;
    months: number;
    payFromAccountId: string | null;
    sourceTxnId: string | null;
    rows: PaymentRow[];
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("installment_plans")
    .insert({
      kind: plan.kind,
      account_id: plan.accountId,
      name: plan.name,
      principal: plan.principal,
      fee_total: roundCents(plan.rows.reduce((sum, r) => sum + r.feePart, 0)),
      months: plan.months,
      first_due: plan.rows[0].dueOn,
      pay_from_account_id: plan.payFromAccountId,
      source_txn_id: plan.sourceTxnId,
    })
    .select("id")
    .single();
  if (error) return null;

  const payments = await supabase.from("scheduled_payments").insert(
    plan.rows.map((r) => ({
      plan_id: data.id,
      seq: r.seq,
      due_on: r.dueOn,
      amount: r.amount,
      principal_part: r.principalPart,
      fee_part: r.feePart,
    })),
  );
  if (payments.error) {
    await supabase.from("installment_plans").delete().eq("id", data.id);
    return null;
  }
  return data.id;
}
