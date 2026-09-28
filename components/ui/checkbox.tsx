import * as React from "react";

import { cn } from "@/lib/utils/cn";

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: React.ReactNode;
  description?: React.ReactNode;
  onCheckedChange: (checked: boolean) => void;
}

export function Checkbox({ label, description, onCheckedChange, className, id, ...props }: CheckboxProps) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={inputId}
        type="checkbox"
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        {...props}
      />
      <label htmlFor={inputId} className="cursor-pointer text-sm leading-snug">
        {label}
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </label>
    </div>
  );
}
