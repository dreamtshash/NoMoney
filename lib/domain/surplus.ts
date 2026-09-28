import type { Settings } from "@/lib/types/finance";
import { roundMoney } from "@/lib/utils/money";

/**
 * Surplus engine. Four numbers that are never mixed together:
 *   income                 type "income" transactions
 *   expenses               net personal spending
 *   cash-flow surplus      income − expenses
 *   goal contributions     money the user moved into goals this period
 *   unallocated            surplus − goal contributions (can be negative:
 *                          the user saved more than this month's surplus,
 *                          i.e. drew on earlier money)
 */
export function calculateSurplus(income: number, expenses: number): number {
  return roundMoney(income - expenses);
}

export interface SurplusBreakdown {
  income: number;
  expenses: number;
  surplus: number;
  goalContributions: number;
  unallocated: number;
}

export function calculateSurplusBreakdown(
  income: number,
  expenses: number,
  goalContributions: number
): SurplusBreakdown {
  const surplus = calculateSurplus(income, expenses);
  return {
    income,
    expenses,
    surplus,
    goalContributions,
    unallocated: roundMoney(surplus - goalContributions),
  };
}

export interface SavingsPlan {
  /** Income the base savings % is applied to. */
  baseIncome: number;
  /** Income above the expected amount (0 if expected is not set or not exceeded). */
  additionalIncome: number;
  baseSavings: number;
  additionalSavings: number;
  plannedSavings: number;
}

/**
 * Savings rule:
 *   expected not set → planned = income × savings%
 *   expected set     → planned = min(income, expected) × savings%
 *                               + max(0, income − expected) × additional%
 */
export function calculateSavingsPlan(
  income: number,
  settings: Pick<Settings, "savingsPercent" | "expectedMonthlyIncome" | "additionalIncomeSavingsPercent">
): SavingsPlan {
  const pct = clampPercent(settings.savingsPercent) / 100;
  const addPct = clampPercent(settings.additionalIncomeSavingsPercent) / 100;
  const expected = Math.max(0, settings.expectedMonthlyIncome);

  const baseIncome = expected > 0 ? Math.min(income, expected) : income;
  const additionalIncome = expected > 0 ? Math.max(0, income - expected) : 0;
  const baseSavings = roundMoney(baseIncome * pct);
  const additionalSavings = roundMoney(additionalIncome * addPct);
  return {
    baseIncome: roundMoney(baseIncome),
    additionalIncome: roundMoney(additionalIncome),
    baseSavings,
    additionalSavings,
    plannedSavings: roundMoney(baseSavings + additionalSavings),
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
