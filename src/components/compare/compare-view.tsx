"use client";

import dynamic from "next/dynamic";
import { ArrowRight, ArrowUpRight, Info, List, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { RENDER_BUDGET } from "@/lib/city/aggregate";
import { compareSnapshots, STATUS_COLORS, type ChangeStatus, type CompareEntry } from "@/lib/city/compare";
import { formatBytes, formatDate, formatNumber, refLabel, shortSha } from "@/lib/format";
import { basename, dirname } from "@/lib/repo/languages";
import type { RepoSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { CameraApi } from "@/components/scene/city-scene";
import { CameraControls } from "@/components/explorer/chrome";
import { useIsMobile, useReducedMotion } from "@/components/explorer/hooks";

const CityScene = dynamic(() => import("@/components/scene/city-scene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-[13px] text-muted">Loading 3D engine…</div>,
});

type Side = "base" | "changes" | "head";
type Filter = "changed" | ChangeStatus;

const STATUS_LABEL: Record<ChangeStatus, string> = { added: "Added", removed: "Removed", modified: "Modified", unchanged: "Unchanged" };

function signed(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : "±"}${formatNumber(Math.abs(n))}`;
}

export function CompareView({ base, head, onSceneReady }: { base: RepoSnapshot; head: RepoSnapshot; onSceneReady?: () => void }) {
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const budget = isMobile ? RENDER_BUDGET.mobile : RENDER_BUDGET.desktop;
  const city = useMemo(() => compareSnapshots(base, head, budget), [base, head, budget]);
  const [side, setSide] = useState<Side>("changes");
  const [filter, setFilter] = useState<Filter>("changed");
  const [selected, setSelected] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  // Rendered client-side only (after both analyses load), so the viewport is known.
  const [noteOpen, setNoteOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const camera = useRef<CameraApi | null>(null);
  const { summary } = city;

  const frame = side === "base" ? city.base : side === "head" ? city.head : city.changes;
  const colors = useMemo(() => city.status.map((s) => (s === "unchanged" ? null : STATUS_COLORS[s])), [city]);
  const active = useMemo(() => (highlight ? Uint8Array.from(city.status, (s) => (s === "unchanged" ? 0 : 1)) : null), [city, highlight]);

  const list = useMemo(() => {
    const rows = city.entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => (filter === "changed" ? e.status !== "unchanged" : e.status === filter));
    return rows.sort((a, b) => Math.abs(b.e.linesDelta ?? b.e.sizeDelta / 40) - Math.abs(a.e.linesDelta ?? a.e.sizeDelta / 40) || (a.e.path < b.e.path ? -1 : 1));
  }, [city, filter]);

  const selectFile = (fileIndex: number) => {
    const id = city.layout.fileToBuilding[fileIndex]!;
    setSelected(id);
    setListOpen(false);
    camera.current?.focusBuilding(id);
  };
  const selectedBuilding = selected === null ? undefined : city.layout.buildings[selected];
  const selectedEntry = selectedBuilding?.kind === "file" ? city.entries[selectedBuilding.fileIndex] : undefined;

  const repo = `${head.repo.owner}/${head.repo.name}`;
  const githubCompare = `https://github.com/${encodeURIComponent(head.repo.owner)}/${encodeURIComponent(head.repo.name)}/compare/${base.revision.sha}...${head.revision.sha}`;

  const panel = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        <dl className="grid grid-cols-3 gap-2" data-testid="compare-summary">
          {(["added", "removed", "modified"] as const).map((s) => (
            <div key={s} className="border border-line px-2 py-1.5">
              <dt className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="block size-2" style={{ background: STATUS_COLORS[s] }} aria-hidden />
                {STATUS_LABEL[s]}
              </dt>
              <dd className="tabular font-mono text-[15px] font-medium text-ink">{formatNumber(summary[s])}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2.5 text-[12.5px] text-ink-2">
          Net lines <span className="tabular font-mono font-medium text-ink">{signed(summary.netLines)}</span>
          {summary.unknownLines > 0 && <span className="text-muted"> · {formatNumber(summary.unknownLines)} changed files without line counts</span>}
          <span className="text-muted"> · {formatNumber(summary.unchanged)} unchanged</span>
        </p>
      </div>
      <div className="flex gap-1 border-b border-line px-4 py-2" role="group" aria-label="Filter changes">
        {(["changed", "added", "removed", "modified"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn("h-7 rounded-xs px-2 text-[12px]", filter === f ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/[0.05]")}
          >
            {f === "changed" ? "All changes" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-1" data-testid="compare-list">
        {list.slice(0, 500).map(({ e, i }) => (
          <li key={e.path}>
            <button
              type="button"
              onClick={() => selectFile(i)}
              className={cn("flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left hover:bg-ink/[0.045]", selectedEntry === e && "bg-ink/[0.07]")}
            >
              <span className="size-2 shrink-0" style={{ background: e.status === "unchanged" ? "var(--color-line-strong)" : STATUS_COLORS[e.status] }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[12.5px] text-ink">{basename(e.path)}</span>
                <span className="block truncate font-mono text-[11px] text-faint">{dirname(e.path) || "/"}</span>
              </span>
              <span className="tabular shrink-0 font-mono text-[11.5px] text-muted">{e.linesDelta === null ? "lines n/a" : signed(e.linesDelta)}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-2 py-3 text-[12.5px] text-faint">No files in this group.</li>}
        {list.length > 500 && <li className="px-2 py-2 text-[12px] text-faint">+{formatNumber(list.length - 500)} more</li>}
      </ul>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[320px] shrink-0 border-r border-line bg-paper md:block" aria-label="Changed files">
        {!isMobile && panel}
      </aside>
      <main className="relative min-w-0 flex-1" aria-label="Compared city">
        <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2 md:left-4 md:top-4">
          <div className="flex border border-line-strong bg-surface" role="group" aria-label="Which city">
            {(
              [
                ["base", `Base ${shortSha(base.revision.sha)}`],
                ["changes", "Changes"],
                ["head", `Head ${shortSha(head.revision.sha)}`],
              ] as const
            ).map(([value, label], i) => (
              <button
                key={value}
                type="button"
                aria-pressed={side === value}
                onClick={() => setSide(value)}
                className={cn("flex h-9 items-center px-3 text-[13px]", i > 0 && "border-l border-line", side === value ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/[0.05]")}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={highlight}
            onClick={() => setHighlight((v) => !v)}
            className={cn("h-9 border border-line-strong px-3 text-[13px]", highlight ? "bg-ink text-paper" : "bg-surface text-ink-2 hover:bg-ink/[0.05]")}
            title="Fade files that did not change"
          >
            Fade unchanged
          </button>
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="flex h-9 items-center gap-1.5 border border-line-strong bg-surface px-3 text-[13px] text-ink-2 md:hidden"
          >
            <List className="size-4" aria-hidden /> Changes
          </button>
        </div>

        {noteOpen ? (
          <div
            className={cn(
              "absolute z-20 border border-line-strong bg-surface/95 text-[12px] leading-snug text-ink-2 md:text-[12.5px] md:leading-relaxed",
              "left-3 right-3 top-[104px] md:left-auto md:right-4 md:top-4 md:w-[380px]",
              selectedEntry && "hidden md:block md:top-auto md:bottom-[220px]",
            )}
            role="note"
            data-testid="compare-notes"
          >
            <div className="flex items-start gap-2 p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <ul className="min-w-0 flex-1 space-y-1.5">
                <li>
                  {repo}: {refLabel(base.revision.ref, base.revision.sha)} ({formatDate(base.revision.committedAt)}) → {refLabel(head.revision.ref, head.revision.sha)} (
                  {formatDate(head.revision.committedAt)}). Both cities share one plan; switch between Base, Changes and Head to watch buildings change in place.
                </li>
                <li>
                  {summary.exact
                    ? "Changes are detected by Git blob SHA: exact."
                    : "At least one snapshot predates recorded blob SHAs, so changes are detected by size and line count; edits that keep both identical are not detected."}{" "}
                  Renamed files appear as removed and added.
                </li>
                {city.layout.aggregatedFiles > 0 && <li>{formatNumber(city.layout.aggregatedFiles)} small files are merged into striped blocks to stay within the rendering budget.</li>}
              </ul>
              <button type="button" onClick={() => setNoteOpen(false)} className="-m-1 grid size-7 shrink-0 place-items-center text-muted hover:text-ink" aria-label="Hide notes">
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="absolute right-3 top-3 z-20 grid size-9 place-items-center border border-line-strong bg-surface text-muted hover:text-ink md:right-4 md:top-4"
            aria-label="Show notes"
          >
            <Info className="size-4" />
          </button>
        )}

        <CityScene
          className="absolute inset-0 touch-none"
          layout={city.layout}
          frame={frame}
          colors={colors}
          active={active}
          selectedId={null}
          showLabels
          cameraRef={camera}
          lowPower={isMobile}
          reducedMotion={reducedMotion}
          onSelect={(id) => setSelected(id)}
          onReady={onSceneReady}
        />

        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-end justify-between gap-3 md:inset-x-4 md:bottom-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1 border border-line-strong bg-surface/95 px-3 py-2 text-[12px] text-ink-2" aria-label="Legend">
            {(["added", "removed", "modified"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="block size-2.5" style={{ background: STATUS_COLORS[s] }} aria-hidden />
                {STATUS_LABEL[s]}
              </span>
            ))}
            <span className="hidden text-muted sm:inline">Height = lines (log) · footprint = size (√)</span>
            <a href={githubCompare} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ink hover:text-accent-ink">
              Diff on GitHub <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </div>
          <CameraControls camera={camera} className={cn("pointer-events-auto ml-auto", selectedEntry && isMobile && "hidden")} />
        </div>

        {selectedEntry && <EntryCard entry={selectedEntry} base={base} head={head} onClose={() => setSelected(null)} />}
      </main>

      {isMobile && listOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Changed files">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Close" onClick={() => setListOpen(false)} />
          <div className="gc-rise absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col border-r border-line-strong bg-paper">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="text-[14px] font-semibold">Changes</span>
              <button type="button" onClick={() => setListOpen(false)} className="grid size-10 place-items-center text-muted hover:text-ink" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{panel}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function EntryCard({ entry, base, head, onClose }: { entry: CompareEntry; base: RepoSnapshot; head: RepoSnapshot; onClose: () => void }) {
  const url = (snap: RepoSnapshot) =>
    `https://github.com/${encodeURIComponent(snap.repo.owner)}/${encodeURIComponent(snap.repo.name)}/blob/${snap.revision.sha}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
  const val = (f: CompareEntry["base"], k: "lines" | "size") => (!f ? "—" : k === "size" ? formatBytes(f.size) : f.lines === null ? "n/a" : formatNumber(f.lines));
  return (
    <section
      className="gc-rise absolute inset-x-3 bottom-[64px] z-30 border border-line-strong bg-surface p-4 shadow-[0_10px_40px_rgba(20,20,20,0.12)] md:inset-x-auto md:bottom-4 md:right-4 md:w-[380px]"
      aria-label="Selected file"
      data-testid="compare-detail"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] text-muted">
            <span className="block size-2" style={{ background: entry.status === "unchanged" ? "var(--color-line-strong)" : STATUS_COLORS[entry.status] }} aria-hidden />
            {STATUS_LABEL[entry.status]}
          </div>
          <h2 className="break-words text-[17px] font-semibold leading-tight text-ink">{basename(entry.path)}</h2>
          <p className="mt-1 break-all font-mono text-[11.5px] text-muted">{entry.path}</p>
        </div>
        <button type="button" onClick={onClose} className="-m-1 grid size-8 shrink-0 place-items-center text-muted hover:text-ink" aria-label="Close details">
          <X className="size-4" />
        </button>
      </div>
      <table className="mt-3 w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] text-muted">
            <th className="font-normal" />
            <th className="font-normal">Base {shortSha(base.revision.sha)}</th>
            <th className="font-normal" aria-hidden />
            <th className="font-normal">Head {shortSha(head.revision.sha)}</th>
          </tr>
        </thead>
        <tbody className="tabular font-mono">
          {(["lines", "size"] as const).map((k) => (
            <tr key={k} className="border-t border-line">
              <td className="py-1.5 font-sans text-muted">{k === "lines" ? "Lines" : "Size"}</td>
              <td>{val(entry.base, k)}</td>
              <td className="text-faint">
                <ArrowRight className="size-3" aria-hidden />
              </td>
              <td>{val(entry.head, k)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-[12.5px]">
        {entry.base && (
          <a href={url(base)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ink hover:text-accent-ink">
            Base file <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        )}
        {entry.head && (
          <a href={url(head)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ink hover:text-accent-ink">
            Head file <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </section>
  );
}
