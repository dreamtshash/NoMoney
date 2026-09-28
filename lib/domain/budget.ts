import type { Budget, SpendingCategoryId } from "@/lib/types/finance";
import { roundMoney, sumBy } from "@/lib/utils/money";

/**
 * Budget engine.
 *   remaining   = budget − actual          (can be negative)
 *   overspending = actual − budget, only when actual > budget, else 0
 *   status:
 *     "over"      actual > budget
 *     "on_target" actual ≥ ON_TARGET_THRESHOLD × budget
 *     "under"     otherwise
 */
export const ON_TARGET_THRESHOLD = 0.9;

export type BudgetStatusKind = "under" | "on_target" | "over";

export interface BudgetVariance {
  budgetId: string;
  category: SpendingCategoryId;
  budget: number;
  actual: number;
  remaining: number;
  overspending: number;
  /** actual / budget × 100; null when the budget is 0. */
  percentUsed: number | null;
  status: BudgetStatusKind;
}

export function budgetStatusOf(budget: number, actual: number): BudgetStatusKind {
  if (actual > budget) return "over";
  if (budget > 0 && actual >= budget * ON_TARGET_THRESHOLD) return "on_target";
  return "under";
}

export function calculateBudgetVariance(
  budgets: readonly Budget[],
  actualByCategory: Partial<Record<SpendingCategoryId, number>>
): BudgetVariance[] {
  return budgets.map((b) => {
    const actual = roundMoney(actualByCategory[b.category] ?? 0);
    const remaining = roundMoney(b.amount - actual);
    return {
      budgetId: b.id,
      category: b.category,
      budget: b.amount,
      actual,
      remaining,
      overspending: actual > b.amount ? roundMoney(actual - b.amount) : 0,
      percentUsed: b.amount > 0 ? (actual / b.amount) * 100 : null,
      status: budgetStatusOf(b.amount, actual),
    };
  });
}

export interface BudgetTotals {
  budgeted: number;
  spentInBudgeted: number;
  remaining: number;
  overspending: number;
  /** Positive remaining across lines that are under budget — money that could go to savings. */
  unused: number;
  overCount: number;
  onTargetCount: number;
  underCount: number;
}

export function calculateBudgetTotals(variances: readonly BudgetVariance[]): BudgetTotals {
  return {
    budgeted: sumBy(variances, (v) => v.budget),
    spentInBudgeted: sumBy(variances, (v) => v.actual),
    remaining: sumBy(variances, (v) => v.remaining),
    overspending: sumBy(variances, (v) => v.overspending),
    unused: sumBy(variances, (v) => Math.max(0, v.remaining)),
    overCount: variances.filter((v) => v.status === "over").length,
    onTargetCount: variances.filter((v) => v.status === "on_target").length,
    underCount: variances.filter((v) => v.status === "under").length,
  };
}

/** Spending in categories that have no budget line. */
export function calculateUnbudgetedSpending(
  budgets: readonly Budget[],
  actualByCategory: Partial<Record<SpendingCategoryId, number>>
): { category: SpendingCategoryId; actual: number }[] {
  const budgeted = new Set(budgets.map((b) => b.category));
  return (Object.entries(actualByCategory) as [SpendingCategoryId, number][])
    .filter(([c, v]) => !budgeted.has(c) && v > 0)
    .map(([category, actual]) => ({ category, actual }))
    .sort((a, b) => b.actual - a.actual);
}
