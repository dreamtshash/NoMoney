import type { Goal } from "@/lib/types/finance";
import {
  calculateGoalRemaining,
  calculateProjectedGoalCompletion,
  goalTarget,
  type ProjectedCompletion,
} from "@/lib/domain/goals";
import { daysBetween } from "@/lib/utils/dates";
import { roundMoney } from "@/lib/utils/money";

/**
 * "Before you spend" — deterministic purchase-impact calculation.
 *
 * Model (all arithmetic, no prediction):
 *
 * 1. The purchase is a one-off cost. It reduces this period's cash-flow
 *    surplus by exactly its amount. It does NOT change the user's ongoing
 *    monthly saving rate (the old prototype subtracted a one-off purchase
 *    from the monthly rate, which made any purchase ≥ that rate "never").
 *
 * 2. Funding source decides how much of the cost reaches the goal:
 *    - "surplus": paid first from UNALLOCATED surplus (surplus − goal
 *      contributions already made). Anything beyond that has to come from
 *      money earmarked for the goal, so it is added back to what the goal
 *      still needs.
 *    - "goal": paid from the goal's saved balance (up to what's saved); any
 *      excess comes out of surplus as above.
 *
 * 3. Goal completion is projected with the same monthly saving rate before
 *    and after: months = remaining / rate. The difference is the delay.
 *
 *    delay (months) = goalShortfall / monthlySavingRate
 */

export type TradeOffFunding = "surplus" | "goal";

export interface TradeOffInput {
  purchaseAmount: number;
  goal: Goal;
  /** Cash-flow surplus for the period (income − expenses). */
  currentSurplus: number;
  /** Money already moved into goals this period. */
  goalContributionsThisPeriod: number;
  /** Monthly rate used to project the goal (historical average or planned). */
  monthlySavingRate: number;
  funding: TradeOffFunding;
  useSafetyTarget: boolean;
  today: string;
}

export interface TradeOffSnapshot {
  surplus: number;
  unallocated: number;
  goalSaved: number;
  goalRemaining: number;
  projection: ProjectedCompletion;
  meetsDeadline: boolean | null;
}

export interface TradeOffResult {
  purchaseAmount: number;
  funding: TradeOffFunding;
  goalName: string;
  goalTarget: number;
  deadline: string;
  monthlySavingRate: number;
  before: TradeOffSnapshot;
  after: TradeOffSnapshot;
  /** Portion paid from unallocated surplus (no effect on the goal). */
  coveredByUnallocated: number;
  /** Portion that reduces goal progress. */
  goalShortfall: number;
  /** Portion that pushes the period's surplus below zero. */
  deficit: number;
  /** null when the goal can't be projected (no saving rate). */
  delayMonths: number | null;
  delayDays: number | null;
  /** Share of the monthly saving rate this purchase represents. */
  monthsOfSaving: number | null;
  verdict: "no_goal_impact" | "delays_goal" | "misses_deadline" | "cannot_project" | "goal_complete";
}

function snapshot(
  goal: Goal,
  saved: number,
  surplus: number,
  unallocated: number,
  rate: number,
  useSafetyTarget: boolean,
  today: string
): TradeOffSnapshot {
  const remaining = calculateGoalRemaining({ ...goal, currentAmount: saved }, useSafetyTarget);
  const projection = calculateProjectedGoalCompletion(remaining, rate, today);
  return {
    surplus: roundMoney(surplus),
    unallocated: roundMoney(unallocated),
    goalSaved: roundMoney(saved),
    goalRemaining: remaining,
    projection,
    meetsDeadline: projection.date === null ? null : projection.date <= goal.deadline,
  };
}

export function calculateTradeOff(input: TradeOffInput): TradeOffResult {
  const amount = Math.max(0, roundMoney(input.purchaseAmount));
  const { goal, useSafetyTarget, today } = input;
  const rate = Math.max(0, input.monthlySavingRate);

  const surplusBefore = input.currentSurplus;
  const unallocatedBefore = roundMoney(input.currentSurplus - input.goalContributionsThisPeriod);
  const available = Math.max(0, unallocatedBefore);

  let coveredByUnallocated: number;
  let savedAfter: number;

  if (input.funding === "goal") {
    const fromGoal = Math.min(amount, Math.max(0, goal.currentAmount));
    savedAfter = goal.currentAmount - fromGoal;
    const rest = amount - fromGoal;
    coveredByUnallocated = Math.min(rest, available);
    // The part beyond both pools is still money the goal won't get this month.
    savedAfter -= rest - coveredByUnallocated;
  } else {
    coveredByUnallocated = Math.min(amount, available);
    savedAfter = goal.currentAmount - (amount - coveredByUnallocated);
  }

  const before = snapshot(goal, goal.currentAmount, surplusBefore, unallocatedBefore, rate, useSafetyTarget, today);
  const after = snapshot(
    goal,
    savedAfter, // may go below 0: money that must be re-saved before the goal moves forward
    surplusBefore - amount,
    unallocatedBefore - amount,
    rate,
    useSafetyTarget,
    today
  );

  // Absorbed partly if the goal was already over-funded; otherwise equals the uncovered amount.
  const effectiveShortfall = roundMoney(after.goalRemaining - before.goalRemaining);

  let delayMonths: number | null = null;
  let delayDays: number | null = null;
  if (Number.isFinite(before.projection.months) && Number.isFinite(after.projection.months)) {
    delayMonths = after.projection.months - before.projection.months;
    delayDays =
      before.projection.date && after.projection.date ? daysBetween(before.projection.date, after.projection.date) : null;
  }

  let verdict: TradeOffResult["verdict"];
  if (before.goalRemaining === 0 && effectiveShortfall === 0) verdict = "goal_complete";
  else if (effectiveShortfall <= 0) verdict = "no_goal_impact";
  else if (rate <= 0) verdict = "cannot_project";
  else if (before.meetsDeadline && after.meetsDeadline === false) verdict = "misses_deadline";
  else verdict = "delays_goal";

  return {
    purchaseAmount: amount,
    funding: input.funding,
    goalName: goal.name,
    goalTarget: goalTarget(goal, useSafetyTarget),
    deadline: goal.deadline,
    monthlySavingRate: rate,
    before,
    after,
    coveredByUnallocated: roundMoney(coveredByUnallocated),
    goalShortfall: effectiveShortfall,
    deficit: roundMoney(Math.max(0, amount - Math.max(0, surplusBefore))),
    delayMonths,
    delayDays,
    monthsOfSaving: rate > 0 ? amount / rate : null,
    verdict,
  };
}

/** Surplus left after a one-off purchase. Can go negative (a deficit). */
export function calculateNewSurplus(currentSurplus: number, purchaseAmount: number): number {
  return roundMoney(currentSurplus - Math.max(0, purchaseAmount));
}

/** Spec name for the full before/after calculation. */
export const calculateTradeOffImpact = calculateTradeOff;

export const MAX_PURCHASE_AMOUNT = 10_000_000; // ₹1 crore

export type PurchaseAmountCheck = { ok: true; value: number } | { ok: false; reason: "empty" | "zero" | "negative" | "invalid" | "too_large"; message: string };

/** Validates a what-if purchase amount before it reaches the calculation. */
export function validatePurchaseAmount(value: number | null | undefined): PurchaseAmountCheck {
  if (value === null || value === undefined) return { ok: false, reason: "empty", message: "Enter what the purchase would cost." };
  if (!Number.isFinite(value)) return { ok: false, reason: "invalid", message: "That isn't a valid amount." };
  if (value < 0) return { ok: false, reason: "negative", message: "A purchase can't cost less than ₹0." };
  if (value === 0) return { ok: false, reason: "zero", message: "A ₹0 purchase has no effect. Enter an amount above ₹0." };
  if (value > MAX_PURCHASE_AMOUNT)
    return { ok: false, reason: "too_large", message: "Amounts above ₹1 crore aren't supported for what-if checks." };
  return { ok: true, value: roundMoney(value) };
}
