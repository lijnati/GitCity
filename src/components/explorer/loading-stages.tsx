"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const STAGES = [
  { id: "connect", label: "Connecting to GitHub" },
  { id: "structure", label: "Reading repository structure" },
  { id: "contents", label: "Analyzing source files" },
  { id: "history", label: "Reading recent commit history" },
  { id: "plan", label: "Planning neighborhoods" },
  { id: "build", label: "Constructing buildings" },
  { id: "ready", label: "Preparing your city" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

/**
 * Real progress: each row is a pipeline stage that is reported by the server
 * (or by the client for layout/rendering). No simulated percentages.
 */
export function LoadingStages({ current, detail, repo, skipped }: { current: StageId; detail?: string; repo: string; skipped: ReadonlySet<StageId> }) {
  const currentIndex = STAGES.findIndex((s) => s.id === current);
  return (
    <div className="mx-auto w-full max-w-[460px]" role="status" aria-live="polite" aria-busy="true">
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Building city</p>
      <h1 className="mt-2 break-all font-mono text-[22px] font-semibold tracking-tight text-ink md:text-[26px]">{repo}</h1>
      <ol className="mt-8 border-t border-line">
        {STAGES.map((s, i) => {
          const done = i < currentIndex || (skipped.has(s.id) && i <= currentIndex);
          const active = i === currentIndex && !skipped.has(s.id);
          return (
            <li key={s.id} className="relative border-b border-line py-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center border font-mono text-[10px]",
                    done ? "border-ink bg-ink text-paper" : active ? "border-ink text-ink" : "border-line-strong text-faint",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("text-[14px]", done ? "text-ink-2" : active ? "font-medium text-ink" : "text-faint")}>
                  {s.label}
                  {skipped.has(s.id) && <span className="ml-2 text-[12px] text-faint">skipped</span>}
                </span>
                {active && detail && <span className="ml-auto truncate font-mono text-[11.5px] text-muted">{detail}</span>}
              </div>
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-px overflow-hidden" aria-hidden>
                  <span className="block h-px w-full bg-ink [animation:gc-scan_1.6s_ease-in-out_infinite]" />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sr-only">{STAGES[currentIndex]?.label}</p>
    </div>
  );
}
