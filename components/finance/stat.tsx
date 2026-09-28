import * as React from "react";

import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format";

/** A headline number with a label and an optional explanatory line. */
export function Stat({
  label,
  amount,
  value,
  detail,
  tone = "none",
  className,
}: {
  label: string;
  /** Rupee amount (formatted consistently). */
  amount?: number;
  /** Pre-formatted value, used when the stat isn't a rupee amount. */
  value?: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "none" | "positive" | "negative";
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 sm:p-5", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "money mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive"
        )}
      >
        {value ?? (amount !== undefined ? formatCurrency(amount) : "—")}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
