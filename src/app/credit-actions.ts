"use server";

import { refresh } from "next/cache";
import { SIGNED_OUT_ERROR, signedInClient } from "@/lib/auth";
import { isValidDate, today } from "@/lib/dates";
import { monthlyDates } from "@/lib/forecast";
import { loanSchedule } from "@/lib/installments";
import { MAX_AMOUNT, isSpendable, roundCents, type AccountType } from "@/lib/money";
import { pickWallet, savePlan } from "@/lib/server-writes";

// Phase 3: credit lines (SPayLater, Atome), loans (SLoan, MariLoan) and
// paying their installments. See 0005_installments_loans.sql for how each
// peso is counted.

export type CreditResult = { error?: string; id?: string };

const FAILED = { error: "Couldn't save that. Please try again." };

function cleanName(name: unknown) {
  return String(name ?? "").replace(/\s+/g, " ").trim();
}

function validAmount(value: number, allowZero = false) {
  return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) && value <= MAX_AMOUNT;
}

export type CreditLineInput = {
  name: string;
  limit: number | null;
  /** Day of the month the bill is due. */
  dueDay: number | null;
  /** What you owe on it right now. */
  used: number;
};

function checkCreditLine(input: CreditLineInput): string | null {
  const name = cleanName(input.name);
  if (!name) return "Give it a name, like SPayLater.";
  if (name.length > 60) return "Keep the name to 60 characters.";
  if (input.limit !== null && !validAmount(input.limit)) return "Check the credit limit, or leave it blank.";
  if (input.dueDay !== null && !(Number.isInteger(input.dueDay) && input.dueDay >= 1 && input.dueDay <= 31)) {
    return "Pick the day the bill is due.";
  }
  if (!validAmount(input.used, true)) return "Check how much you owe on it now.";
  return null;
}

/** Adds a BNPL credit line. What you owe now becomes its starting balance. */
export async function addCreditLine(input: CreditLineInput): Promise<CreditResult> {
  const problem = checkCreditLine(input);
  if (problem) return { error: problem };
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      name: cleanName(input.name),
      type: "credit_line",
      credit_limit: input.limit === null ? null : roundCents(input.limit),
      due_day: input.dueDay,
      starting_balance: -roundCents(input.used),
    })
    .select("id")
    .single();
  if (error) return FAILED;

  refresh();
  return { id: data.id };
}

/**
 * Renames a credit line or changes its limit and due day. Setting what you
 * owe adjusts the starting balance, so logged transactions stay as they are.
 */
export async function updateCreditLine(id: string, input: CreditLineInput): Promise<CreditResult> {
  const problem = checkCreditLine(input);
  if (problem) return { error: problem };
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const [account, current] = await Promise.all([
    supabase.from("accounts").select("starting_balance").eq("id", id).eq("type", "credit_line").maybeSingle(),
    supabase.from("account_balances").select("balance").eq("account_id", id).maybeSingle(),
  ]);
  if (!account.data || !current.data) return { error: "Couldn't find that credit line." };

  const starting = Number(account.data.starting_balance) + (-input.used - Number(current.data.balance));
  const { error } = await supabase
    .from("accounts")
    .update({
      name: cleanName(input.name),
      credit_limit: input.limit === null ? null : roundCents(input.limit),
      due_day: input.dueDay,
      starting_balance: roundCents(starting),
    })
    .eq("id", id);
  if (error) return FAILED;

  refresh();
  return {};
}

export type UpcomingInput = {
  /** What it's for, like "Shopee order". */
  name: string;
  /** Each payment. */
  amount: number;
  firstDue: string;
  /** 1 for a single bill; more repeats it monthly. */
  months: number;
  /** True when it isn't in "You owe on it now" yet: what you owe goes up by the total. */
  addToOwed: boolean;
};

/**
 * Payments you expect on SPayLater or Atome, like bills from before you
 * used Pong or ones the provider's app already shows. Saved as a plan with
 * no purchase behind it, so they're in Coming up, the forecast and Safe to
 * spend, and Pay bill moves money to the credit line as usual.
 */
export async function addUpcomingPayments(accountId: string, input: UpcomingInput): Promise<CreditResult> {
  const name = cleanName(input.name) || "Upcoming bill";
  if (name.length > 60) return { error: "Keep the name to 60 characters." };
  if (!validAmount(input.amount)) return { error: "Enter how much you'll pay." };
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 24) return { error: "Pick how many months." };
  if (!isValidDate(input.firstDue)) return { error: "Pick when it's due." };
  const total = roundCents(input.amount * input.months);
  if (total > MAX_AMOUNT) return { error: "That amount is too big." };

  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };
  const { data: account } = await supabase
    .from("accounts")
    .select("id, starting_balance")
    .eq("id", accountId)
    .eq("type", "credit_line")
    .maybeSingle();
  if (!account) return { error: "Couldn't find that credit line." };

  const amount = roundCents(input.amount);
  const rows = monthlyDates(input.firstDue, input.months).map((dueOn, i) => ({
    seq: i + 1,
    dueOn,
    amount,
    principalPart: amount,
    feePart: 0,
  }));
  const saved = await savePlan(supabase, {
    kind: "bnpl",
    accountId,
    name,
    principal: total,
    months: input.months,
    payFromAccountId: null,
    sourceTxnId: null,
    rows,
  });
  if (!saved) return FAILED;

  if (input.addToOwed) {
    const { error } = await supabase
      .from("accounts")
      .update({ starting_balance: roundCents(Number(account.starting_balance) - total) })
      .eq("id", accountId);
    if (error) {
      await supabase.from("installment_plans").delete().eq("id", saved);
      return FAILED;
    }
  }

  refresh();
  return {};
}

export type LoanInput = {
  name: string;
  received: number;
  /** The wallet it landed in; null if you got it before you started using the app. */
  intoAccountId: string | null;
  receivedOn: string;
  monthly: number;
  months: number;
  /** The next amortization date. */
  nextDue: string;
  payFromAccountId: string | null;
  /** Payments made before you added it here. */
  alreadyPaid: number;
};

function checkLoan(input: LoanInput): string | null {
  const name = cleanName(input.name);
  if (!name) return "Give the loan a name, like SLoan.";
  if (name.length > 60) return "Keep the name to 60 characters.";
  if (!validAmount(input.received)) return "Enter the amount you received.";
  if (!validAmount(input.monthly)) return "Enter the monthly payment.";
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 60) return "Pick how many months.";
  if (roundCents(input.monthly * input.months) < input.received) {
    return "The payments add up to less than you received. Check the monthly payment and months.";
  }
  if (!isValidDate(input.nextDue)) return "Pick when the next payment is due.";
  if (input.intoAccountId && !isValidDate(input.receivedOn)) return "Pick the day you received it.";
  if (!Number.isInteger(input.alreadyPaid) || input.alreadyPaid < 0 || input.alreadyPaid >= input.months) {
    return "Check how many payments you've already made.";
  }
  if (input.intoAccountId && input.alreadyPaid > 0) {
    return "A loan you just received has no payments yet. Set payments made to 0.";
  }
  return null;
}

/**
 * Adds a loan: a loan account, the money received as a transfer from it
 * (never income), and its amortization schedule.
 */
export async function addLoan(input: LoanInput): Promise<CreditResult> {
  const problem = checkLoan(input);
  if (problem) return { error: problem };
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const received = roundCents(input.received);
  const rows = loanSchedule({ received, monthly: roundCents(input.monthly), months: input.months }, input.nextDue, input.alreadyPaid);
  const owed = roundCents(rows.reduce((sum, r) => sum + r.principalPart, 0));
  const name = cleanName(input.name);

  // Received before using the app: the loan starts at what's still owed.
  const account = await supabase
    .from("accounts")
    .insert({ name, type: "loan", starting_balance: input.intoAccountId ? 0 : -owed })
    .select("id")
    .single();
  if (account.error) return FAILED;
  const loanId = account.data.id;

  let sourceTxnId: string | null = null;
  if (input.intoAccountId) {
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        type: "transfer",
        amount: received,
        account_id: loanId,
        to_account_id: input.intoAccountId,
        note: `${name} received`,
        occurred_on: input.receivedOn,
      })
      .select("id")
      .single();
    if (error) {
      await supabase.from("accounts").delete().eq("id", loanId);
      return FAILED;
    }
    sourceTxnId = data.id;
  }

  const saved = await savePlan(supabase, {
    kind: "loan",
    accountId: loanId,
    name,
    principal: received,
    months: input.months,
    payFromAccountId: input.payFromAccountId,
    sourceTxnId,
    rows,
  });
  if (!saved) {
    if (sourceTxnId) await supabase.from("transactions").delete().eq("id", sourceTxnId);
    await supabase.from("accounts").delete().eq("id", loanId);
    return FAILED;
  }

  refresh();
  return { id: loanId };
}

/**
 * Pays installments today: the principal part as a transfer to the credit
 * line or loan, the fee part as an expense. `fromAccountId` overrides the
 * plan's usual wallet.
 */
export async function payInstallments(ids: string[], fromAccountId?: string): Promise<CreditResult> {
  if (!ids.length) return {};
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data: payments } = await supabase
    .from("scheduled_payments")
    .select("id, plan_id, seq, principal_part, fee_part, transfer_txn_id, fee_txn_id")
    .in("id", ids);
  if (!payments?.length) return { error: "Couldn't find that payment." };
  const { data: plans } = await supabase
    .from("installment_plans")
    .select("id, account_id, name, months, pay_from_account_id")
    .in("id", [...new Set(payments.map((p) => p.plan_id))]);

  if (fromAccountId) {
    const { data: from } = await supabase.from("accounts").select("type").eq("id", fromAccountId).maybeSingle();
    if (!from || !isSpendable(from.type as AccountType)) return { error: "Pay from cash, a bank or an e-wallet." };
  }

  for (const p of payments) {
    if (p.transfer_txn_id || p.fee_txn_id) continue;
    const plan = plans?.find((x) => x.id === p.plan_id);
    if (!plan) return FAILED;
    const wallet = fromAccountId ?? (await pickWallet(supabase, plan.pay_from_account_id));
    if (!wallet) return { error: "Add a wallet first, so I know where the money comes from." };

    const note = plan.months > 1 ? `${plan.name} ${p.seq} of ${plan.months}` : plan.name;
    const created: string[] = [];
    let transferId: string | null = null;
    let feeId: string | null = null;
    if (Number(p.principal_part) > 0) {
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          type: "transfer",
          amount: Number(p.principal_part),
          account_id: wallet,
          to_account_id: plan.account_id,
          note,
          occurred_on: today(),
        })
        .select("id")
        .single();
      if (error) return FAILED;
      transferId = data.id;
      created.push(data.id);
    }
    if (Number(p.fee_part) > 0) {
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          type: "expense",
          amount: Number(p.fee_part),
          account_id: wallet,
          category: "fees",
          note: `${note} · fee`,
          occurred_on: today(),
        })
        .select("id")
        .single();
      if (error) {
        await supabase.from("transactions").delete().in("id", created);
        return FAILED;
      }
      feeId = data.id;
      created.push(data.id);
    }

    const { data: updated, error } = await supabase
      .from("scheduled_payments")
      .update({ transfer_txn_id: transferId, fee_txn_id: feeId })
      .eq("id", p.id)
      .is("transfer_txn_id", null)
      .is("fee_txn_id", null)
      .select("id");
    if (error || !updated.length) {
      // Paid in another tab meanwhile: don't count it twice.
      await supabase.from("transactions").delete().in("id", created);
      if (error) return FAILED;
    }
  }

  refresh();
  return {};
}

/** Undo a payment: deletes its transfer and fee, which un-pays it. */
export async function undoInstallment(id: string): Promise<CreditResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data } = await supabase
    .from("scheduled_payments")
    .select("transfer_txn_id, fee_txn_id")
    .eq("id", id)
    .maybeSingle();
  const txns = [data?.transfer_txn_id, data?.fee_txn_id].filter((t): t is string => Boolean(t));
  if (!txns.length) {
    refresh();
    return {};
  }
  const { error } = await supabase.from("transactions").delete().in("id", txns);
  if (error) return { error: "Couldn't undo that. Please try again." };

  refresh();
  return {};
}

/**
 * Removes a plan and its unpaid schedule, e.g. one entered by mistake or
 * paid off early. Payments already made stay in Activity.
 */
export async function removePlan(id: string): Promise<CreditResult> {
  const supabase = await signedInClient();
  if (!supabase) return { error: SIGNED_OUT_ERROR };

  const { data, error } = await supabase.from("installment_plans").delete().eq("id", id).select("id");
  if (error || !data.length) return { error: "Couldn't remove that plan. Please try again." };

  refresh();
  return {};
}
