"use client";

import * as React from "react";

import { cn } from "@/lib/utils/cn";
import { inputClass } from "@/components/ui/input";
import { formatAmountForInput } from "@/lib/utils/format";
import { MAX_AMOUNT, roundMoney } from "@/lib/utils/money";

export interface AmountInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "max"> {
  /** The amount as a number, or null when the field is empty. */
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Digits allowed after the decimal point (0 for whole rupees). Default 2. */
  decimals?: number;
  /** Upper limit. Keystrokes that would exceed it are rejected. Default ₹100 crore. */
  max?: number;
  /** Show the ₹ prefix. Default true. */
  currency?: boolean;
  /** Unit suffix, e.g. "%" or "×". */
  suffix?: string;
}

/** Keep only digits and one ".", limit decimals. Returns null when the text is not acceptable. */
function sanitize(raw: string, decimals: number): string | null {
  const stripped = raw.replace(/[,\s₹]/g, "");
  if (stripped === "") return "";
  if (!/^\d*\.?\d*$/.test(stripped)) return null;
  const [whole = "", frac] = stripped.split(".");
  if (frac !== undefined) {
    if (decimals === 0) return null;
    if (frac.length > decimals) return null;
  }
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
  return frac !== undefined ? `${trimmedWhole}.${frac}` : trimmedWhole;
}

function toNumber(text: string): number | null {
  if (text === "" || text === ".") return null;
  const n = Number(text);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

/**
 * Controlled amount field.
 *  - Empty is a real state (null), never silently 0. Zero is a valid value.
 *  - Letters, "e", "+", "-" and a second "." are rejected at the keystroke.
 *  - Paste of "₹1,25,000.50" works.
 *  - While focused the raw digits are shown; on blur it formats with Indian grouping (1,25,000).
 *  - Values above `max` are rejected instead of overflowing layouts or float precision.
 */
export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  (
    { value, onValueChange, decimals = 2, max = MAX_AMOUNT, currency = true, suffix, className, onBlur, onFocus, ...props },
    ref
  ) => {
    const [focused, setFocused] = React.useState(false);
    const fmt = (v: number | null) => (v === null ? "" : formatAmountForInput(v));
    // The text shown is stable across focus changes: focusing never rewrites it,
    // so a tab-in (which selects everything) followed by typing replaces the value
    // instead of appending to it. Grouping commas are applied again on blur.
    const [text, setText] = React.useState(() => fmt(value));

    // Sync from outside (reset, edit dialog opening) — but never fight the user while typing.
    React.useEffect(() => {
      if (focused) return;
      setText(fmt(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, focused]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const next = sanitize(e.target.value, decimals);
      if (next === null) return; // reject the keystroke; previous text stays
      const n = toNumber(next);
      if (n !== null && n > max) return;
      setText(next);
      onValueChange(n);
    }

    const display = text;

    return (
      <div className="relative">
        {currency && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
            aria-hidden="true"
          >
            ₹
          </span>
        )}
        <input
          ref={ref}
          type="text"
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          autoComplete="off"
          spellCheck={false}
          value={display}
          onChange={handleChange}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            setText(fmt(value));
            onBlur?.(e);
          }}
          className={cn(inputClass, "money", currency && "pl-7", suffix && "pr-8", className)}
          {...props}
        />
        {suffix && (
          <span
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
            aria-hidden="true"
          >
            {suffix}
          </span>
        )}
      </div>
    );
  }
);
AmountInput.displayName = "AmountInput";
