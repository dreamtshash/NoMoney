import { calculateSafetyTarget } from "@/lib/domain/goals";
import type { Goal } from "@/lib/types/finance";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

/**
 * Goal progress bar scaled to the SAFETY target, with a marker at the actual
 * target — so both are visible and the actual target is never replaced.
 */
export function GoalBar({ goal }: { goal: Goal }) {
  const safety = calculateSafetyTarget(goal);
  const scale = Math.max(safety, goal.targetAmount, 1);
  const savedPct = Math.min(100, (goal.currentAmount / scale) * 100);
  const targetPct = Math.min(100, (goal.targetAmount / scale) * 100);
  const progress = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 100;

  return (
    <div className="space-y-1.5">
      <div
        className="relative h-2.5 w-full rounded-full bg-secondary"
        role="progressbar"
        aria-label={`${goal.name}: ${formatPercent(progress)} of target saved`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${savedPct}%` }} />
        {safety > goal.targetAmount && (
          <div
            className="absolute -top-1 h-[18px] w-0.5 rounded bg-foreground"
            style={{ left: `calc(${targetPct}% - 1px)` }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
        <span>
          <span className="money font-medium text-foreground">{formatCurrency(goal.currentAmount)}</span> saved,{" "}
          {formatPercent(progress)} of {formatCurrency(goal.targetAmount)}
        </span>
        {safety > goal.targetAmount && <span className="money">Safety target {formatCurrency(safety)}</span>}
      </div>
    </div>
  );
}
