import type {
  Importance,
  Split,
  SpendingCategoryId,
  Transaction,
} from "@/lib/types/finance";
import { isSpendingCategory } from "@/lib/domain/categories";
import { monthOf } from "@/lib/utils/dates";
import { roundMoney, safeNumber, sumBy } from "@/lib/utils/money";

/**
 * Ledger rules — the single definition of what counts as income and spending.
 *
 *  income        : type "income" only. Refunds, reimbursements, transfers and
 *                  unknown inflows are NOT income.
 *  spending      : type "expense", counted at the user's PERSONAL share
 *                  (cash paid − what others owe on a split), minus refunds in
 *                  the same category.
 *  transfers     : ignored for income and spending.
 *  unknown type  : ignored until reviewed.
 */

export type SplitIndex = ReadonlyMap<string, Split>;

export function indexSplits(splits: readonly Split[]): SplitIndex {
  return new Map(splits.map((s) => [s.transactionId, s]));
}

export function transactionsInMonth(transactions: readonly Transaction[], month: string): Transaction[] {
  return transactions.filter((t) => monthOf(t.date) === month);
}

export function transactionsOnDate(transactions: readonly Transaction[], date: string): Transaction[] {
  return transactions.filter((t) => t.date === date);
}

/** Amount others owe on a split, capped at what was actually paid. */
export function othersShareOf(transaction: Transaction, splits: SplitIndex): number {
  const split = splits.get(transaction.id);
  if (!split || transaction.type !== "expense") return 0;
  const paid = Math.abs(safeNumber(transaction.amount));
  const others = sumBy(split.participants, (p) => p.share);
  return roundMoney(Math.min(paid, Math.max(0, others)));
}

/** Money that left the account for an expense (before splitting). */
export function cashPaidFor(transaction: Transaction): number {
  if (transaction.type !== "expense") return 0;
  return roundMoney(Math.abs(safeNumber(transaction.amount)));
}

/**
 * Signed contribution of one transaction to the user's personal spending:
 *   expense → +personal share, refund → −refund, everything else → 0.
 */
export function personalSpendingOf(transaction: Transaction, splits: SplitIndex): number {
  if (transaction.type === "expense") {
    return roundMoney(cashPaidFor(transaction) - othersShareOf(transaction, splits));
  }
  if (transaction.type === "refund") {
    return roundMoney(-Math.abs(safeNumber(transaction.amount)));
  }
  return 0;
}

function spendingCategoryOf(t: Transaction): SpendingCategoryId {
  return isSpendingCategory(t.category) ? t.category : "other";
}

export function calculateTotalIncome(transactions: readonly Transaction[]): number {
  return sumBy(
    transactions.filter((t) => t.type === "income"),
    (t) => Math.abs(t.amount)
  );
}

/** Net personal spending. Never negative (a month of pure refunds is ₹0 spending, not negative). */
export function calculateTotalExpenses(transactions: readonly Transaction[], splits: SplitIndex): number {
  return Math.max(0, sumBy(transactions, (t) => personalSpendingOf(t, splits)));
}

export function calculateTotalCashPaid(transactions: readonly Transaction[]): number {
  return sumBy(transactions, cashPaidFor);
}

export function calculateTotalRefunds(transactions: readonly Transaction[]): number {
  return sumBy(
    transactions.filter((t) => t.type === "refund"),
    (t) => Math.abs(t.amount)
  );
}

export function calculateTotalReimbursements(transactions: readonly Transaction[]): number {
  return sumBy(
    transactions.filter((t) => t.type === "reimbursement"),
    (t) => Math.abs(t.amount)
  );
}

export function calculateSpendingByCategory(
  transactions: readonly Transaction[],
  splits: SplitIndex
): Partial<Record<SpendingCategoryId, number>> {
  const out: Partial<Record<SpendingCategoryId, number>> = {};
  for (const t of transactions) {
    const v = personalSpendingOf(t, splits);
    if (v === 0) continue;
    const c = spendingCategoryOf(t);
    out[c] = roundMoney((out[c] ?? 0) + v);
  }
  for (const key of Object.keys(out) as SpendingCategoryId[]) {
    if ((out[key] ?? 0) <= 0) delete out[key];
  }
  return out;
}

export function calculateSpendingByImportance(
  transactions: readonly Transaction[],
  splits: SplitIndex
): Record<Importance, number> {
  const out: Record<Importance, number> = { essential: 0, flexible: 0, discretionary: 0, unknown: 0 };
  for (const t of transactions) {
    const v = personalSpendingOf(t, splits);
    if (v !== 0) out[t.importance] = roundMoney(out[t.importance] + v);
  }
  for (const key of Object.keys(out) as Importance[]) out[key] = Math.max(0, out[key]);
  return out;
}

export function calculateSpendingByDay(
  transactions: readonly Transaction[],
  splits: SplitIndex
): { date: string; amount: number }[] {
  const byDay = new Map<string, number>();
  for (const t of transactions) {
    const v = personalSpendingOf(t, splits);
    if (v !== 0) byDay.set(t.date, roundMoney((byDay.get(t.date) ?? 0) + v));
  }
  return Array.from(byDay, ([date, amount]) => ({ date, amount: Math.max(0, amount) })).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/** Months (YYYY-MM) that have at least one transaction, newest first. */
export function monthsWithTransactions(transactions: readonly Transaction[]): string[] {
  return Array.from(new Set(transactions.map((t) => monthOf(t.date)))).sort().reverse();
}

export function periodComparison(current: number, previous: number) {
  const difference = roundMoney(current - previous);
  const percentChange = previous === 0 ? null : (difference / previous) * 100;
  return { current, previous, difference, percentChange };
}

/**
 * Spending as a two-level hierarchy: importance → category.
 * Same rules as the flat totals (personal share, refunds netted, never below 0).
 */
export function calculateSpendingMatrix(
  transactions: readonly Transaction[],
  splits: SplitIndex
): Record<Importance, Partial<Record<SpendingCategoryId, number>>> {
  const out: Record<Importance, Partial<Record<SpendingCategoryId, number>>> = {
    essential: {},
    flexible: {},
    discretionary: {},
    unknown: {},
  };
  for (const t of transactions) {
    const v = personalSpendingOf(t, splits);
    if (v === 0) continue;
    const row = out[t.importance];
    const c = spendingCategoryOf(t);
    row[c] = roundMoney((row[c] ?? 0) + v);
  }
  for (const imp of Object.keys(out) as Importance[]) {
    for (const c of Object.keys(out[imp]) as SpendingCategoryId[]) {
      if ((out[imp][c] ?? 0) <= 0) delete out[imp][c];
    }
  }
  return out;
}

/** Transactions that make up spending (expenses and refunds), optionally narrowed. */
export function spendingTransactions(
  transactions: readonly Transaction[],
  filter: { importance?: Importance; category?: SpendingCategoryId } = {}
): Transaction[] {
  return transactions.filter(
    (t) =>
      (t.type === "expense" || t.type === "refund") &&
      (!filter.importance || t.importance === filter.importance) &&
      (!filter.category || spendingCategoryOf(t) === filter.category)
  );
}

export interface IncomingBreakdown {
  /** Earned income: salary, freelance, interest (type "income"). The "Incoming" headline. */
  income: number;
  /** Friends paying back — settles receivables, not income. */
  reimbursements: number;
  /** Money back for purchases — reduces spending, not income. */
  refunds: number;
  /** From the user's own accounts — neither income nor spending. */
  transfersIn: number;
  /** Money in that hasn't been classified yet. */
  unclassifiedIn: number;
  /** Everything that arrived, whatever its type. */
  totalReceived: number;
}

/** Every rupee that arrived, split by what it actually was. */
export function calculateIncomingBreakdown(transactions: readonly Transaction[]): IncomingBreakdown {
  const inflow = (type: Transaction["type"]) =>
    sumBy(
      transactions.filter((t) => t.type === type && t.amount > 0),
      (t) => t.amount
    );
  const income = calculateTotalIncome(transactions);
  const reimbursements = calculateTotalReimbursements(transactions);
  const refunds = calculateTotalRefunds(transactions);
  const transfersIn = inflow("transfer");
  const unclassifiedIn = inflow("unknown");
  return {
    income,
    reimbursements,
    refunds,
    transfersIn,
    unclassifiedIn,
    totalReceived: roundMoney(income + reimbursements + refunds + transfersIn + unclassifiedIn),
  };
}

/* Spec-named entry points (thin wrappers — one implementation per rule). */

/** Earned income (salary, freelance, interest). The "Incoming" headline. */
export const calculateIncoming = calculateTotalIncome;
/** Personal spending: your share of expenses, net of refunds. */
export const calculateExpenses = calculateTotalExpenses;
export const calculateRefunds = calculateTotalRefunds;
export const calculateReimbursements = calculateTotalReimbursements;

/** Own-account transfers in and out. Never income or spending. */
export function calculateTransfers(transactions: readonly Transaction[]): { in: number; out: number } {
  const transfers = transactions.filter((t) => t.type === "transfer");
  return {
    in: sumBy(transfers.filter((t) => t.amount > 0), (t) => t.amount),
    out: sumBy(transfers.filter((t) => t.amount < 0), (t) => -t.amount),
  };
}
