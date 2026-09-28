import type { Importance, NoMoneyData, SpendingCategoryId } from "@/lib/types/finance";
import {
  calculateBudgetTotals,
  calculateBudgetVariance,
  calculateUnbudgetedSpending,
  type BudgetTotals,
  type BudgetVariance,
} from "@/lib/domain/budget";
import { reviewQueue } from "@/lib/domain/classification";
import { contributionsInMonth } from "@/lib/domain/goals";
import {
  calculateSpendingByCategory,
  calculateSpendingByImportance,
  calculateTotalCashPaid,
  calculateTotalExpenses,
  calculateTotalIncome,
  calculateTotalRefunds,
  calculateTotalReimbursements,
  calculateIncomingBreakdown,
  calculateSpendingMatrix,
  indexSplits,
  type IncomingBreakdown,
  monthsWithTransactions,
  transactionsInMonth,
  type SplitIndex,
} from "@/lib/domain/ledger";
import { calculateReceivables, type ReceivablesSummary } from "@/lib/domain/splits";
import { calculateSavingsPlan, calculateSurplusBreakdown, type SavingsPlan, type SurplusBreakdown } from "@/lib/domain/surplus";
import { monthOf, shiftMonth } from "@/lib/utils/dates";
import { roundMoney } from "@/lib/utils/money";

/**
 * One consistent summary of a month, derived from the stored data. Every page
 * reads from this — no page computes its own totals.
 */
export interface MonthSnapshot {
  month: string;
  splitIndex: SplitIndex;
  transactionCount: number;
  income: number;
  expenses: number;
  cashPaid: number;
  refunds: number;
  reimbursements: number;
  surplus: SurplusBreakdown;
  savingsPlan: SavingsPlan;
  byCategory: Partial<Record<SpendingCategoryId, number>>;
  byImportance: Record<Importance, number>;
  /** Importance → category → amount. */
  matrix: Record<Importance, Partial<Record<SpendingCategoryId, number>>>;
  /** All money that arrived, by what it was. `incoming.income` === `income`. */
  incoming: IncomingBreakdown;
  budgetLines: BudgetVariance[];
  budgetTotals: BudgetTotals;
  unbudgeted: { category: SpendingCategoryId; actual: number }[];
  /** Split receivables created by expenses in any month (money owed is not month-bound). */
  receivables: ReceivablesSummary;
  reviewCount: number;
  /** Transactions that are type "unknown" — excluded from every total above. */
  unknownTypeCount: number;
  unknownTypeAmount: number;
}

export function availableMonths(data: NoMoneyData, today: string): string[] {
  const months = new Set(monthsWithTransactions(data.transactions));
  months.add(monthOf(today));
  return Array.from(months).sort().reverse();
}

/** The month views should show: the user's choice, else the latest month with data. */
export function resolveActiveMonth(data: NoMoneyData, today: string): string {
  if (data.activeMonth) return data.activeMonth;
  return monthsWithTransactions(data.transactions)[0] ?? monthOf(today);
}

export function buildMonthSnapshot(data: NoMoneyData, month: string): MonthSnapshot {
  const splitIndex = indexSplits(data.splits);
  const txns = transactionsInMonth(data.transactions, month);
  const income = calculateTotalIncome(txns);
  const expenses = calculateTotalExpenses(txns, splitIndex);
  const byCategory = calculateSpendingByCategory(txns, splitIndex);
  const budgetLines = calculateBudgetVariance(data.budgets, byCategory);
  const unknown = txns.filter((t) => t.type === "unknown");

  return {
    month,
    splitIndex,
    transactionCount: txns.length,
    income,
    expenses,
    cashPaid: calculateTotalCashPaid(txns),
    refunds: calculateTotalRefunds(txns),
    reimbursements: calculateTotalReimbursements(txns),
    surplus: calculateSurplusBreakdown(income, expenses, contributionsInMonth(data.goalContributions, month)),
    savingsPlan: calculateSavingsPlan(income, data.settings),
    byCategory,
    byImportance: calculateSpendingByImportance(txns, splitIndex),
    matrix: calculateSpendingMatrix(txns, splitIndex),
    incoming: calculateIncomingBreakdown(txns),
    budgetLines,
    budgetTotals: calculateBudgetTotals(budgetLines),
    unbudgeted: calculateUnbudgetedSpending(data.budgets, byCategory),
    receivables: calculateReceivables(data.splits, data.transactions),
    reviewCount: reviewQueue(data.transactions).length,
    unknownTypeCount: unknown.length,
    unknownTypeAmount: roundMoney(unknown.reduce((s, t) => s + Math.abs(t.amount), 0)),
  };
}

export interface MonthTrendPoint {
  month: string;
  income: number;
  spending: number;
  /** "ledger" = computed from transactions; "summary" = imported monthly total (no detail). */
  source: "ledger" | "summary";
}

/**
 * Income and spending per month, oldest first, ending at `endMonth`.
 * Months with transactions are computed from the ledger; earlier months fall
 * back to stored monthly summaries. Months with neither are omitted.
 */
export function calculateMonthlyTrend(data: NoMoneyData, endMonth: string, count = 6): MonthTrendPoint[] {
  const splitIndex = indexSplits(data.splits);
  const ledgerMonths = new Set(monthsWithTransactions(data.transactions));
  const out: MonthTrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = shiftMonth(endMonth, -i);
    if (ledgerMonths.has(m)) {
      const txns = transactionsInMonth(data.transactions, m);
      out.push({
        month: m,
        income: calculateTotalIncome(txns),
        spending: calculateTotalExpenses(txns, splitIndex),
        source: "ledger",
      });
    } else {
      const s = data.history.find((h) => h.month === m);
      if (s) out.push({ month: m, income: s.income, spending: s.spending, source: "summary" });
    }
  }
  return out;
}
