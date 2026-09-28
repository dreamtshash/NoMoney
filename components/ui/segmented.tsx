"use client";

import * as React from "react";

import { cn } from "@/lib/utils/cn";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  label: string;
  className?: string;
  id?: string;
}

/** A radio group styled as a segmented control. Arrow keys move between options. */
export function Segmented<T extends string>({ value, onChange, options, label, className, id }: SegmentedProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex w-full rounded-md border border-input bg-secondary/60 p-0.5 sm:w-auto", className)}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
              e.preventDefault();
              const idx = enabled.findIndex((x) => x.value === value);
              const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
              const next = enabled[(idx + dir + enabled.length) % enabled.length];
              if (next) {
                onChange(next.value);
                refs.current[options.indexOf(next)]?.focus();
              }
            }}
            className={cn(
              "flex-1 whitespace-nowrap rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              checked ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
