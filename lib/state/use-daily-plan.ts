"use client";

import { useMemo } from "react";

import {
  calculateCarryOver,
  calculateDailyPlanProgress,
  calculateSuggestedDailyAmount,
  latestPlanBefore,
} from "@/lib/domain/daily-plan";
import { indexSplits } from "@/lib/domain/ledger";
import { useStore } from "@/lib/state/store";
import { addDays } from "@/lib/utils/dates";
import { roundMoney } from "@/lib/utils/money";

/**
 * Everything Plan a Day needs for `today`, derived from the one store.
 * Carry-over only comes from YESTERDAY's plan — an old plan from last week
 * shouldn't change today's allowance.
 */
export function useDailyPlan() {
  const { data, today } = useStore();
  return useMemo(() => {
    const splits = indexSplits(data.splits);
    const s = data.settings;
    const plan = data.dailyPlans.find((p) => p.date === today) ?? null;
    const prev = latestPlanBefore(data.dailyPlans, today);
    const yesterday = prev && prev.date === addDays(today, -1) ? prev : undefined;
    const carry = calculateCarryOver(yesterday, data.transactions, splits, s.unusedDailyAction);
    const suggested = calculateSuggestedDailyAmount({
      today,
      mode: s.dailyPlanMode,
      fixedAmount: s.dailyPlanFixedAmount,
      budgets: data.budgets,
      planCategories: s.dailyPlanCategories,
      transactions: data.transactions,
      splits,
    });
    const proposedAvailable = roundMoney(Math.max(0, suggested.amount + carry.adjustment));
    const progress = plan ? calculateDailyPlanProgress(plan, data.transactions, splits, s.dailyPlanCategories) : null;
    return { today, plan, yesterdayPlan: yesterday ?? null, carry, suggested, proposedAvailable, progress, splits };
  }, [data, today]);
}
