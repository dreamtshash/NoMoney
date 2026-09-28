import { IMPORTANCE_META, IMPORTANCE_ORDER } from "@/lib/domain/categories";
import type { Importance } from "@/lib/types/finance";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

const fill: Record<Importance, string> = {
  essential: "bg-imp-essential",
  flexible: "bg-imp-flexible",
  discretionary: "bg-imp-discretionary",
  unknown: "stripes",
};

/**
 * "Where your money went" — one segmented bar split by importance, with a
 * legend that repeats every value in text (colour is never the only cue;
 * the unknown share is also striped).
 */
export function ImportanceBreakdown({ byImportance, total }: { byImportance: Record<Importance, number>; total: number }) {
  const positive = IMPORTANCE_ORDER.map((imp) => ({ imp, amount: Math.max(0, byImportance[imp]) }));
  const barTotal = positive.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-4">
      <div
        className="flex h-4 w-full overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={
          barTotal > 0
            ? positive.map((p) => `${IMPORTANCE_META[p.imp].label} ${formatCurrency(p.amount)}`).join(", ")
            : "No spending yet"
        }
      >
        {barTotal > 0 &&
          positive.map((p) =>
            p.amount > 0 ? (
              <div
                key={p.imp}
                className={cn("h-full border-r-2 border-card last:border-r-0", fill[p.imp])}
                style={{ width: `${(p.amount / barTotal) * 100}%` }}
              />
            ) : null
          )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
        {positive.map((p) => (
          <div key={p.imp} className="flex items-start gap-2">
            <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm", fill[p.imp])} aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{IMPORTANCE_META[p.imp].label}</dt>
              <dd className="money text-sm font-semibold">
                {formatCurrency(byImportance[p.imp])}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {total > 0 ? formatPercent((byImportance[p.imp] / total) * 100) : "0%"}
                </span>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
