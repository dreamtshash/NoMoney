"use client";

import * as React from "react";

import { TRANSACTION_TYPE_META } from "@/lib/domain/categories";
import type { TransactionType } from "@/lib/types/finance";
import { cn } from "@/lib/utils/cn";

const IN_TYPES: TransactionType[] = ["income", "reimbursement", "refund", "transfer", "unknown"];
const OUT_TYPES: TransactionType[] = ["expense", "transfer", "unknown"];

const SHORT: Record<TransactionType, { label: string; effect: string }> = {
  income: { label: "Income", effect: "Counts as incoming" },
  expense: { label: "Expense", effect: "Counts as spending" },
  transfer: { label: "Own transfer", effect: "Not counted anywhere" },
  refund: { label: "Refund", effect: "Reduces spending" },
  reimbursement: { label: "Paid back", effect: "Settles money owed" },
  unknown: { label: "Unknown", effect: "Excluded until reviewed" },
};

/**
 * Transaction type as a set of radio buttons. Only types that make sense for
 * the money's direction are offered — money in can't be an expense, money out
 * can't be income.
 */
export function TypePicker({
  value,
  onChange,
  direction,
  id,
  label = "Type",
}: {
  value: TransactionType;
  onChange: (t: TransactionType) => void;
  direction: "in" | "out";
  id?: string;
  label?: string;
}) {
  const options = direction === "in" ? IN_TYPES : OUT_TYPES;
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = `${id ?? "type"}-label`;
  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-sm font-medium">
        {label} <span className="font-normal text-muted-foreground">(money {direction})</span>
      </p>
      <div role="radiogroup" aria-labelledby={labelId} id={id} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((t, i) => {
          const checked = value === t;
          return (
            <button
              key={t}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (!options.includes(value) && i === 0) ? 0 : -1}
              title={TRANSACTION_TYPE_META[t].hint}
              onClick={() => onChange(t)}
              onKeyDown={(e) => {
                if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
                e.preventDefault();
                const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                const next = (i + dir + options.length) % options.length;
                onChange(options[next]!);
                refs.current[next]?.focus();
              }}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                checked ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/60"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                    checked ? "border-primary" : "border-input"
                  )}
                  aria-hidden="true"
                >
                  {checked && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </span>
                {SHORT[t].label}
              </span>
              <span className="mt-0.5 block pl-5 text-xs text-muted-foreground">{SHORT[t].effect}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
