"use client";
import { cn } from "@/lib/utils";

export function Switch({ checked, onCheckedChange, label, className, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; className?: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn("group inline-flex min-h-8 items-center gap-2.5 text-[13px] text-ink-2", className)}
    >
      <span className={cn("relative h-4 w-7 rounded-xs border transition-colors", checked ? "border-ink bg-ink" : "border-line-strong bg-surface")}>
        <span className={cn("absolute top-[2px] size-2.5 rounded-[1px] transition-transform duration-150", checked ? "translate-x-[13px] bg-paper" : "translate-x-[2px] bg-line-strong")} />
      </span>
      {label}
    </button>
  );
}
