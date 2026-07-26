import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, placeholder, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "focus-ring h-9 w-full rounded-md border border-border bg-surface-raised px-2.5 text-sm text-ink disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {children}
    </select>
  ),
);
Select.displayName = "Select";
