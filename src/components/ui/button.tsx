import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/** shadcn/ui-pattern button, restyled for GitCity's editorial system. */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-[background-color,color,border-color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink-2 active:bg-ink-2",
        accent: "bg-accent text-paper hover:bg-accent-ink",
        outline: "border border-line-strong bg-surface text-ink hover:border-ink hover:bg-paper",
        ghost: "text-ink-2 hover:bg-ink/[0.05] hover:text-ink",
        quiet: "text-muted hover:text-ink",
      },
      size: {
        sm: "h-8 px-2.5 text-[13px]",
        md: "h-10 px-3.5",
        lg: "h-12 px-5 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
