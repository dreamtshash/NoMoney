import * as React from "react";

import { cn } from "@/lib/utils/cn";

export const inputClass =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground/80 hover:border-muted-foreground/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => <input type={type} ref={ref} className={cn(inputClass, className)} {...props} />
);
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputClass, "h-auto min-h-[72px] py-2", className)} {...props} />
  )
);
Textarea.displayName = "Textarea";

export { Input, Textarea };
