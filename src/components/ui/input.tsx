import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full min-w-0 rounded-sm border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint transition-colors outline-none hover:border-ink-2 focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent aria-invalid:border-accent",
        className,
      )}
      {...props}
    />
  );
});
