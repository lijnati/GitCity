"use client";

import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { formatDate, formatNumber, shortSha } from "@/lib/format";
import type { Timelapse } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TimelapseState } from "./use-timelapse";

export function TimelapseBar({
  state,
  frameIndex,
  playing,
  fileCount,
  onFrame,
  onTogglePlay,
  onExit,
  className,
}: {
  state: TimelapseState;
  frameIndex: number;
  playing: boolean;
  fileCount: number;
  onFrame: (i: number) => void;
  onTogglePlay: () => void;
  onExit: () => void;
  className?: string;
}) {
  const btn = "grid size-10 shrink-0 place-items-center text-ink-2 hover:bg-ink/[0.05] hover:text-ink disabled:opacity-35 md:size-9";
  return (
    <div
      className={cn("pointer-events-auto flex w-full max-w-[720px] flex-col border border-line-strong bg-surface/95 shadow-[0_1px_0_rgba(0,0,0,0.04)]", className)}
      role="group"
      aria-label="Time-lapse"
      data-testid="timelapse-bar"
    >
      {state.status === "ready" ? (
        <Ready data={state.data} frameIndex={frameIndex} playing={playing} fileCount={fileCount} onFrame={onFrame} onTogglePlay={onTogglePlay} onExit={onExit} btn={btn} />
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5" aria-live="polite">
          <div className="min-w-0 flex-1">
            {state.status === "loading" && (
              <>
                <p className="text-[13px] text-ink">{state.label}</p>
                <div className="mt-1.5 h-px w-full bg-line" aria-hidden>
                  <div className="h-px bg-ink transition-[width] duration-300" style={{ width: `${Math.round((state.done / Math.max(1, state.total)) * 100)}%` }} />
                </div>
              </>
            )}
            {state.status === "error" && <p className="text-[13px] text-ink-2" role="alert">{state.error.message}</p>}
          </div>
          <button type="button" className={btn} onClick={onExit} aria-label="Exit time-lapse">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Ready({
  data,
  frameIndex,
  playing,
  fileCount,
  onFrame,
  onTogglePlay,
  onExit,
  btn,
}: {
  data: Timelapse;
  frameIndex: number;
  playing: boolean;
  fileCount: number;
  onFrame: (i: number) => void;
  onTogglePlay: () => void;
  onExit: () => void;
  btn: string;
}) {
  const last = data.frames.length - 1;
  const frame = data.frames[frameIndex]!;
  const label = `${formatDate(frame.date)} · ${shortSha(frame.sha)} · ${formatNumber(fileCount)} files`;
  return (
    <div className="flex items-center gap-1 px-1.5 py-1.5 md:gap-2">
      <button type="button" className={btn} onClick={() => onFrame(Math.max(0, frameIndex - 1))} disabled={frameIndex === 0} aria-label="Previous frame" title="Previous frame (←)">
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        className={cn(btn, "bg-ink text-paper hover:bg-ink-2 hover:text-paper")}
        onClick={onTogglePlay}
        aria-label={playing ? "Pause time-lapse" : "Play time-lapse"}
        title="Play / pause (Space)"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <button type="button" className={btn} onClick={() => onFrame(Math.min(last, frameIndex + 1))} disabled={frameIndex === last} aria-label="Next frame" title="Next frame (→)">
        <ChevronRight className="size-4" />
      </button>
      <div className="min-w-0 flex-1 px-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-mono text-[12px] text-ink" data-testid="timelapse-label">
            {formatDate(frame.date)}
            <span className="hidden sm:inline"> · {shortSha(frame.sha)}</span> · {formatNumber(fileCount)} files
          </span>
          <span className="tabular hidden shrink-0 font-mono text-[11px] text-faint sm:inline">
            {frameIndex + 1}/{data.frames.length}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={frameIndex}
          onChange={(e) => onFrame(Number(e.target.value))}
          aria-label="Time-lapse frame"
          aria-valuetext={`Frame ${frameIndex + 1} of ${data.frames.length}: ${label}`}
          className="mt-1 h-5 w-full cursor-pointer accent-[var(--color-ink)]"
        />
      </div>
      <button type="button" className={btn} onClick={onExit} aria-label="Exit time-lapse" title="Exit time-lapse">
        <X className="size-4" />
      </button>
    </div>
  );
}
