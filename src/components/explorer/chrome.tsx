"use client";

import { Check, Copy, Expand, Minus, Plus, RotateCcw } from "lucide-react";
import { GitHubMark } from "@/components/github-mark";
import { useState } from "react";
import { compact, formatDate, formatNumber, shortSha } from "@/lib/format";
import type { RepoSnapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import type { CameraApi } from "@/components/scene/city-scene";

export function CopyLinkButton({ className, compactLabel = false }: { className?: string; compactLabel?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size={compactLabel ? "icon-sm" : "sm"}
      className={className}
      aria-label="Copy link to this city"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt("Copy this link", window.location.href);
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {!compactLabel && (copied ? "Copied" : "Copy link")}
    </Button>
  );
}

export function TopBar({ snapshot, stats, children }: { snapshot: RepoSnapshot; stats: { files: number; lines: number; languages: number }; children?: React.ReactNode }) {
  const { repo, revision } = snapshot;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper px-3 md:gap-5 md:px-4">
      <Logo />
      <span className="hidden h-5 w-px bg-line md:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-mono text-[13px] leading-tight text-ink md:text-[14px]">
          <span className="text-muted">{repo.owner}/</span>
          <span className="font-semibold">{repo.name}</span>
        </h1>
        <p className="truncate font-mono text-[11px] leading-tight text-faint">
          {revision.ref} @ {shortSha(revision.sha)}
          {revision.committedAt ? ` · ${formatDate(revision.committedAt)}` : ""}
          {snapshot.source === "sample" ? " · bundled snapshot" : ""}
        </p>
      </div>
      <dl className="hidden items-baseline gap-5 lg:flex">
        <Stat label="files" value={formatNumber(stats.files)} />
        <Stat label="lines" value={compact(stats.lines)} />
        <Stat label="languages" value={String(stats.languages)} />
        {repo.stars !== null && <Stat label="stars" value={compact(repo.stars)} />}
      </dl>
      <div className="flex items-center gap-1.5">
        {children}
        <CopyLinkButton className="hidden md:inline-flex" />
        <a
          href={repo.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden h-8 items-center gap-1.5 rounded-sm border border-line-strong px-2.5 text-[13px] font-medium hover:border-ink md:inline-flex"
        >
          <GitHubMark /> GitHub
        </a>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="tabular font-mono text-[13px] font-medium text-ink">{value}</dd>
      <dt className="text-[12px] text-muted">{label}</dt>
    </div>
  );
}

export function CameraControls({ camera, className }: { camera: React.RefObject<CameraApi | null>; className?: string }) {
  const btn = "grid size-10 place-items-center text-ink-2 hover:bg-black/[0.05] hover:text-ink md:size-9";
  return (
    <div className={cn("flex border border-line-strong bg-surface/95 shadow-[0_1px_0_rgba(0,0,0,0.04)] md:flex-row", className)} role="group" aria-label="Camera controls">
      <button type="button" className={btn} onClick={() => camera.current?.zoom(0.7)} aria-label="Zoom in" title="Zoom in (+)">
        <Plus className="size-4" />
      </button>
      <button type="button" className={cn(btn, "border-l border-line")} onClick={() => camera.current?.zoom(1.4)} aria-label="Zoom out" title="Zoom out (−)">
        <Minus className="size-4" />
      </button>
      <button type="button" className={cn(btn, "border-l border-line")} onClick={() => camera.current?.fit()} aria-label="Fit city to view" title="Fit city (F)">
        <Expand className="size-4" />
      </button>
      <button type="button" className={cn(btn, "border-l border-line")} onClick={() => camera.current?.reset()} aria-label="Reset camera" title="Reset camera (R)">
        <RotateCcw className="size-4" />
      </button>
    </div>
  );
}

export function Legend({ heightMetric, className }: { heightMetric: "lines" | "size"; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-ink-2", className)} aria-label="Legend">
      <LegendItem glyph={<span className="block h-3.5 w-1.5 bg-ink-2" />}>Height = {heightMetric === "lines" ? "lines of code (log)" : "file size (log)"}</LegendItem>
      <LegendItem glyph={<span className="block size-2.5 border border-ink-2" />}>Footprint = file size (√)</LegendItem>
      <LegendItem glyph={<span className="block size-2.5" style={{ background: "conic-gradient(#2f6fb0 0 25%, #b5532c 0 50%, #d9a521 0 75%, #3d7f6d 0)" }} />}>Colour = language</LegendItem>
      <LegendItem
        glyph={<span className="block size-2.5 border border-line-strong" style={{ background: "repeating-linear-gradient(45deg,#9c968b 0 2px,#fff 2px 4px)" }} />}
      >
        Striped = unknown / aggregated
      </LegendItem>
    </div>
  );
}

function LegendItem({ glyph, children }: { glyph: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="grid size-3.5 place-items-center" aria-hidden>
        {glyph}
      </span>
      {children}
    </span>
  );
}
