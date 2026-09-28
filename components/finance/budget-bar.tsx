import { BudgetStatusBadge } from "@/components/finance/badges";
import type { BudgetVariance } from "@/lib/domain/budget";
import { categoryLabel } from "@/lib/domain/categories";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format";

const barColour = { under: "bg-success", on_target: "bg-warning", over: "bg-destructive" } as const;

/** One budget line: category, actual vs budget, a bar, and the remaining/over amount in words. */
export function BudgetBar({ line, actions }: { line: BudgetVariance; actions?: React.ReactNode }) {
  const pct = line.budget > 0 ? Math.min(100, (line.actual / line.budget) * 100) : line.actual > 0 ? 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{categoryLabel(line.category)}</span>
          <BudgetStatusBadge status={line.status} />
        </div>
        <div className="flex items-center gap-2">
          <span className="money text-sm">
            <span className="font-semibold">{formatCurrency(line.actual)}</span>
            <span className="text-muted-foreground"> of {formatCurrency(line.budget)}</span>
          </span>
          {actions}
        </div>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label={`${categoryLabel(line.category)} budget used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={cn("h-full rounded-full", barColour[line.status])} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn("text-xs", line.overspending > 0 ? "text-destructive" : "text-muted-foreground")}>
        {line.overspending > 0
          ? `${formatCurrency(line.overspending)} over budget`
          : `${formatCurrency(line.remaining)} left`}
        {line.percentUsed !== null && `, ${Math.round(line.percentUsed)}% used`}
      </p>
    </div>
  );
}
