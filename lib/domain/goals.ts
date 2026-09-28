import type { Goal, GoalContribution } from "@/lib/types/finance";
import {
  addFractionalMonths,
  monthOf,
  monthsBetween,
  shiftMonth,
} from "@/lib/utils/dates";
import { roundMoney, sumBy } from "@/lib/utils/money";

export const DEFAULT_SAFETY_MULTIPLIER = 1.5;
export const MIN_SAFETY_MULTIPLIER = 1;
export const MAX_SAFETY_MULTIPLIER = 3;

/** Safety target = actual target × multiplier. The actual target is never changed. */
export function calculateSafetyTarget(goal: Pick<Goal, "targetAmount" | "safetyMultiplier">): number {
  return roundMoney(goal.targetAmount * goal.safetyMultiplier);
}

export function goalTarget(goal: Goal, useSafetyTarget: boolean): number {
  return useSafetyTarget ? calculateSafetyTarget(goal) : goal.targetAmount;
}

/** Remaining = target − current saved, never below 0. */
export function calculateGoalRemaining(goal: Goal, useSafetyTarget = false): number {
  return roundMoney(Math.max(0, goalTarget(goal, useSafetyTarget) - goal.currentAmount));
}

export function calculateGoalProgress(goal: Goal, useSafetyTarget = false): number {
  const target = goalTarget(goal, useSafetyTarget);
  if (target <= 0) return 100;
  return Math.min(100, Math.max(0, (goal.currentAmount / target) * 100));
}

/** Fractional months from `today` to the deadline; 0 once the deadline has passed. */
export function calculateMonthsRemaining(deadline: string, today: string): number {
  return Math.max(0, monthsBetween(today, deadline));
}

/**
 * Required monthly saving = remaining / months remaining.
 * Returns null when the deadline has passed and money is still needed.
 */
export function calculateRequiredMonthlySaving(goal: Goal, today: string, useSafetyTarget = false): number | null {
  const remaining = calculateGoalRemaining(goal, useSafetyTarget);
  if (remaining === 0) return 0;
  const months = calculateMonthsRemaining(goal.deadline, today);
  if (months < 1 / 30) return null;
  return roundMoney(remaining / Math.max(months, 1));
}

export interface AverageSaving {
  average: number;
  monthsCounted: number;
  total: number;
}

/**
 * Historical average monthly saving from recorded contributions.
 * Window: the last `lookbackMonths` calendar months up to and including the
 * current month, starting no earlier than the first recorded contribution.
 * Months with no contribution count as ₹0 — gaps are real.
 */
export function calculateAverageMonthlySaving(
  contributions: readonly GoalContribution[],
  today: string,
  options: { goalId?: string; lookbackMonths?: number } = {}
): AverageSaving {
  const lookback = options.lookbackMonths ?? 6;
  const relevant = contributions.filter((c) => !options.goalId || c.goalId === options.goalId);
  if (relevant.length === 0) return { average: 0, monthsCounted: 0, total: 0 };

  const currentMonth = monthOf(today);
  const firstMonth = relevant.map((c) => monthOf(c.date)).sort()[0] ?? currentMonth;
  let windowStart = shiftMonth(currentMonth, -(lookback - 1));
  if (firstMonth > windowStart) windowStart = firstMonth;
  if (windowStart > currentMonth) return { average: 0, monthsCounted: 0, total: 0 };

  const inWindow = relevant.filter((c) => {
    const m = monthOf(c.date);
    return m >= windowStart && m <= currentMonth;
  });
  const total = sumBy(inWindow, (c) => c.amount);
  let months = 0;
  for (let m = windowStart; m <= currentMonth; m = shiftMonth(m, 1)) months++;
  return { average: roundMoney(total / months), monthsCounted: months, total };
}

export interface ProjectedCompletion {
  /** Fractional months from today; 0 = already reached; Infinity = unreachable at this rate. */
  months: number;
  date: string | null;
}

export function calculateProjectedGoalCompletion(
  remaining: number,
  monthlySavingRate: number,
  today: string
): ProjectedCompletion {
  if (remaining <= 0) return { months: 0, date: today };
  if (monthlySavingRate <= 0) return { months: Infinity, date: null };
  const months = remaining / monthlySavingRate;
  return { months, date: addFractionalMonths(today, months) };
}

export type GoalPace = "complete" | "on_track" | "behind" | "no_saving" | "deadline_passed";

export interface GoalForecast {
  remaining: number;
  safetyTarget: number;
  safetyRemaining: number;
  progress: number;
  safetyProgress: number;
  monthsToDeadline: number;
  requiredMonthly: number | null;
  /** Rate used for the projection, and where it came from. */
  savingRate: number;
  rateBasis: "history" | "planned" | "none";
  historyMonths: number;
  projection: ProjectedCompletion;
  pace: GoalPace;
}

/**
 * Full forecast for one goal. Uses the goal's own contribution history when
 * there is any; otherwise falls back to the user's planned monthly contribution.
 */
export function calculateGoalForecast(
  goal: Goal,
  contributions: readonly GoalContribution[],
  today: string
): GoalForecast {
  const remaining = calculateGoalRemaining(goal);
  const history = calculateAverageMonthlySaving(contributions, today, { goalId: goal.id });

  let savingRate = 0;
  let rateBasis: GoalForecast["rateBasis"] = "none";
  if (history.monthsCounted > 0 && history.average > 0) {
    savingRate = history.average;
    rateBasis = "history";
  } else if (goal.plannedMonthlyContribution > 0) {
    savingRate = goal.plannedMonthlyContribution;
    rateBasis = "planned";
  }

  const projection = calculateProjectedGoalCompletion(remaining, savingRate, today);
  const monthsToDeadline = calculateMonthsRemaining(goal.deadline, today);

  let pace: GoalPace;
  if (remaining === 0) pace = "complete";
  else if (monthsToDeadline === 0) pace = "deadline_passed";
  else if (savingRate <= 0) pace = "no_saving";
  else pace = projection.date !== null && projection.date <= goal.deadline ? "on_track" : "behind";

  return {
    remaining,
    safetyTarget: calculateSafetyTarget(goal),
    safetyRemaining: calculateGoalRemaining(goal, true),
    progress: calculateGoalProgress(goal),
    safetyProgress: calculateGoalProgress(goal, true),
    monthsToDeadline,
    requiredMonthly: calculateRequiredMonthlySaving(goal, today),
    savingRate,
    rateBasis,
    historyMonths: history.monthsCounted,
    projection,
    pace,
  };
}

export function contributionsInMonth(contributions: readonly GoalContribution[], month: string): number {
  return sumBy(
    contributions.filter((c) => monthOf(c.date) === month),
    (c) => c.amount
  );
}

/** Per-month contributions inside the averaging window used by calculateAverageMonthlySaving (gaps = ₹0). */
export function monthlyContributionHistory(
  contributions: readonly GoalContribution[],
  today: string,
  options: { goalId?: string; lookbackMonths?: number } = {}
): { month: string; amount: number }[] {
  const lookback = options.lookbackMonths ?? 6;
  const relevant = contributions.filter((c) => !options.goalId || c.goalId === options.goalId);
  if (relevant.length === 0) return [];
  const currentMonth = monthOf(today);
  const firstMonth = relevant.map((c) => monthOf(c.date)).sort()[0] ?? currentMonth;
  let start = shiftMonth(currentMonth, -(lookback - 1));
  if (firstMonth > start) start = firstMonth;
  const out: { month: string; amount: number }[] = [];
  for (let m = start; m <= currentMonth; m = shiftMonth(m, 1)) {
    out.push({ month: m, amount: sumBy(relevant.filter((c) => monthOf(c.date) === m), (c) => c.amount) });
  }
  return out;
}
