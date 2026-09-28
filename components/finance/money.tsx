import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatCurrencySigned } from "@/lib/utils/format";

/** Consistent rupee display. `signed` shows +/−; `tone="auto"` colours positive green. */
export function Money({
  amount,
  signed = false,
  tone = "none",
  className,
}: {
  amount: number;
  signed?: boolean;
  tone?: "none" | "auto" | "negative-only";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "money whitespace-nowrap",
        tone === "auto" && amount > 0 && "text-success",
        (tone === "auto" || tone === "negative-only") && amount < 0 && "text-destructive",
        className
      )}
    >
      {signed ? formatCurrencySigned(amount) : formatCurrency(amount)}
    </span>
  );
}
