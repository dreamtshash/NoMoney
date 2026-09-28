import type {
  Budget,
  DailyPlan,
  DailyPlanAllocation,
  SpendingCategoryId,
  Transaction,
  UnusedDailyAction,
} from "@/lib/types/finance";
import { isSpendingCategory } from "@/lib/domain/categories";
import { personalSpendingOf, type SplitIndex } from "@/lib/domain/ledger";
import { daysBetween, monthEnd, monthOf } from "@/lib/utils/dates";
import { roundMoney, sumBy } from "@/lib/utils/money";

/**
 * Plan a Day.
 *
 * Only day-to-day categories take part (food, transport, shopping, …).
 * Fixed/essential commitments like rent and bills are deliberately excluded,
 * so overspending never "penalises" them.
 *
 * Suggested amount ("budget" mode):
 *   Σ over plan categories of max(0, monthly budget − spent before today)
 *   ÷ days left in the month (including today), rounded down to ₹10.
 *
 * Carry-over from the most recent earlier plan:
 *   overspent → the whole overspend is taken off today's allowance
 *   unused    → carry_forward: +all · split: +half (other half to savings) · savings: +0
 */

export const DEFAULT_DAILY_PLAN_CATEGORIES: SpendingCategoryId[] = [
  "food",
  "transport",
  "shopping",
  "entertainment",
  "other",
];

function floorTo10(value: number): number {
  return Math.max(0, Math.floor(value / 10) * 10);
}

export function calculateDaysLeftInMonth(today: string): number {
  return daysBetween(today, monthEnd(monthOf(today))) + 1;
}

export function spendingInCategories(
  transactions: readonly Transaction[],
  splits: SplitIndex,
  categories: readonly SpendingCategoryId[],
  predicate: (t: Transaction) => boolean
): Partial<Record<SpendingCategoryId, number>> {
  const out: Partial<Record<SpendingCategoryId, number>> = {};
  for (const t of transactions) {
    if (!predicate(t)) continue;
    const c = isSpendingCategory(t.category) ? t.category : "other";
    if (!categories.includes(c)) continue;
    const v = personalSpendingOf(t, splits);
    if (v !== 0) out[c] = roundMoney((out[c] ?? 0) + v);
  }
  return out;
}

export interface SuggestedDailyAmount {
  amount: number;
  basis: "budget" | "fixed";
  remainingFlexibleBudget: number;
  daysLeft: number;
}

export function calculateSuggestedDailyAmount(params: {
  today: string;
  mode: "budget" | "fixed";
  fixedAmount: number;
  budgets: readonly Budget[];
  planCategories: readonly SpendingCategoryId[];
  transactions: readonly Transaction[];
  splits: SplitIndex;
}): SuggestedDailyAmount {
  const daysLeft = calculateDaysLeftInMonth(params.today);
  const month = monthOf(params.today);
  const spentBeforeToday = spendingInCategories(
    params.transactions,
    params.splits,
    params.planCategories,
    (t) => monthOf(t.date) === month && t.date < params.today
  );
  const remainingFlexibleBudget = sumBy(
    params.budgets.filter((b) => params.planCategories.includes(b.category)),
    (b) => Math.max(0, b.amount - (spentBeforeToday[b.category] ?? 0))
  );
  if (params.mode === "fixed") {
    return { amount: floorTo10(params.fixedAmount), basis: "fixed", remainingFlexibleBudget, daysLeft };
  }
  return {
    amount: floorTo10(remainingFlexibleBudget / Math.max(1, daysLeft)),
    basis: "budget",
    remainingFlexibleBudget,
    daysLeft,
  };
}

export interface CarryOver {
  fromDate: string | null;
  planned: number;
  actual: number;
  unused: number;
  overspent: number;
  /** Signed adjustment to today's allowance. */
  adjustment: number;
  toSavings: number;
  action: UnusedDailyAction;
}

export function calculateCarryOver(
  previousPlan: DailyPlan | undefined,
  transactions: readonly Transaction[],
  splits: SplitIndex,
  action: UnusedDailyAction
): CarryOver {
  if (!previousPlan) {
    return { fromDate: null, planned: 0, actual: 0, unused: 0, overspent: 0, adjustment: 0, toSavings: 0, action };
  }
  const cats = previousPlan.allocations.map((a) => a.category);
  const planned = sumBy(previousPlan.allocations, (a) => a.amount);
  const spent = spendingInCategories(transactions, splits, cats, (t) => t.date === previousPlan.date);
  const actual = sumBy(Object.values(spent), (v) => v ?? 0);
  const diff = roundMoney(planned - actual);
  if (diff < 0) {
    return {
      fromDate: previousPlan.date,
      planned,
      actual,
      unused: 0,
      overspent: -diff,
      adjustment: diff,
      toSavings: 0,
      action,
    };
  }
  const carried = action === "carry_forward" ? diff : action === "split" ? floorTo10(diff / 2) : 0;
  return {
    fromDate: previousPlan.date,
    planned,
    actual,
    unused: diff,
    overspent: 0,
    adjustment: carried,
    toSavings: roundMoney(diff - carried),
    action,
  };
}

/** Split `available` across categories in proportion to their monthly budgets (equal split if none). */
export function suggestAllocations(
  available: number,
  categories: readonly SpendingCategoryId[],
  budgets: readonly Budget[]
): DailyPlanAllocation[] {
  if (categories.length === 0 || available <= 0) return categories.map((category) => ({ category, amount: 0 }));
  const weights = categories.map((c) => budgets.find((b) => b.category === c)?.amount ?? 0);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const raw = categories.map((category, i) => ({
    category,
    amount: floorTo10(totalWeight > 0 ? (available * (weights[i] ?? 0)) / totalWeight : available / categories.length),
  }));
  // Rounding leftovers go to the largest allocation so the plan adds up exactly.
  const leftover = roundMoney(available - sumBy(raw, (a) => a.amount));
  if (leftover !== 0) {
    const largest = raw.reduce((best, a) => (a.amount > best.amount ? a : best), raw[0]!);
    largest.amount = roundMoney(largest.amount + leftover);
  }
  return raw;
}

export interface AllocationProgress {
  category: SpendingCategoryId;
  planned: number;
  actual: number;
  remaining: number;
  status: "within" | "used_up" | "over";
}

export interface DailyPlanProgress {
  lines: AllocationProgress[];
  /** Spending today in plan categories that had no allocation. */
  unplanned: { category: SpendingCategoryId; actual: number }[];
  totalPlanned: number;
  totalActual: number;
  totalRemaining: number;
  unallocated: number;
}

export function calculateDailyPlanProgress(
  plan: DailyPlan,
  transactions: readonly Transaction[],
  splits: SplitIndex,
  planCategories: readonly SpendingCategoryId[]
): DailyPlanProgress {
  const cats = Array.from(new Set([...planCategories, ...plan.allocations.map((a) => a.category)]));
  const spent = spendingInCategories(transactions, splits, cats, (t) => t.date === plan.date);
  const lines: AllocationProgress[] = plan.allocations.map((a) => {
    const actual = Math.max(0, spent[a.category] ?? 0);
    const remaining = roundMoney(a.amount - actual);
    return {
      category: a.category,
      planned: a.amount,
      actual,
      remaining,
      status: remaining < 0 ? "over" : remaining === 0 && a.amount > 0 ? "used_up" : "within",
    };
  });
  const allocated = new Set(plan.allocations.map((a) => a.category));
  const unplanned = (Object.entries(spent) as [SpendingCategoryId, number][])
    .filter(([c, v]) => !allocated.has(c) && v > 0)
    .map(([category, actual]) => ({ category, actual }));
  const totalPlanned = sumBy(plan.allocations, (a) => a.amount);
  const totalActual = roundMoney(sumBy(lines, (l) => l.actual) + sumBy(unplanned, (u) => u.actual));
  return {
    lines,
    unplanned,
    totalPlanned,
    totalActual,
    totalRemaining: roundMoney(plan.available - totalActual),
    unallocated: roundMoney(plan.available - totalPlanned),
  };
}

export function latestPlanBefore(plans: readonly DailyPlan[], date: string): DailyPlan | undefined {
  return [...plans].filter((p) => p.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
}

/* Spec-named entry points (thin wrappers — one implementation per rule). */

/** Planned vs actual per category for one day's plan. */
export const calculateDailyPlan = calculateDailyPlanProgress;

/** Planned − actual for a day: positive = unused, negative = overspent. */
export function calculateDailyVariance(planned: number, actual: number): { unused: number; overspent: number; variance: number } {
  const variance = roundMoney(planned - actual);
  return { variance, unused: Math.max(0, variance), overspent: Math.max(0, -variance) };
}

/** How much of an unused amount carries into tomorrow, and how much goes to savings. */
export function calculateCarryForward(unused: number, action: UnusedDailyAction): { carried: number; toSavings: number } {
  const u = Math.max(0, unused);
  const carried = action === "carry_forward" ? u : action === "split" ? floorTo10(u / 2) : 0;
  return { carried: roundMoney(carried), toSavings: roundMoney(u - carried) };
}

/**
 * Tomorrow's flexible allowance after today's result. Overspending is always
 * taken off; unused money is added per the user's choice. Never below ₹0.
 * Only day-to-day (flexible) categories are planned, so fixed essentials are untouched.
 */
export function calculateNextDayAdjustment(
  normalAllowance: number,
  planned: number,
  actual: number,
  action: UnusedDailyAction
): { adjustment: number; adjustedAllowance: number; toSavings: number } {
  const v = calculateDailyVariance(planned, actual);
  if (v.overspent > 0) {
    return { adjustment: -v.overspent, adjustedAllowance: roundMoney(Math.max(0, normalAllowance - v.overspent)), toSavings: 0 };
  }
  const c = calculateCarryForward(v.unused, action);
  return { adjustment: c.carried, adjustedAllowance: roundMoney(normalAllowance + c.carried), toSavings: c.toSavings };
}
