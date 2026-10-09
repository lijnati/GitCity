"use client";

import dynamic from "next/dynamic";
import { Box, Info, List, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RENDER_BUDGET } from "@/lib/city/aggregate";
import { generateCity } from "@/lib/city/layout";
import type { HeightMetric } from "@/lib/city/scale";
import { formatDate, formatNumber, shortSha } from "@/lib/format";
import { basename, dirname, languageInfo } from "@/lib/repo/languages";
import type { RepoSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import type { CameraApi } from "@/components/scene/city-scene";
import { CameraControls, CopyLinkButton, Legend, TopBar } from "./chrome";
import { DetailContent } from "./detail-panel";
import { FileList } from "./file-list";
import { useIsMobile, useReducedMotion, useWebGLSupport } from "./hooks";
import { activeBuildings, directoryTree, hasFilters, languageStats, matchFiles, type Filters } from "./model";
import { Sidebar } from "./sidebar";

const CityScene = dynamic(() => import("@/components/scene/city-scene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-[13px] text-muted">Loading 3D engine…</div>,
});

interface Selection {
  buildingId: number;
  fileIndex: number | null;
}

export function Explorer({
  snapshot,
  onSceneReady,
  permalink = null,
  pinned = false,
}: {
  snapshot: RepoSnapshot;
  onSceneReady?: () => void;
  /** Permanent link to this stored snapshot, when it was saved. */
  permalink?: string | null;
  /** Viewing a saved snapshot at a fixed SHA. */
  pinned?: boolean;
}) {
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const webgl = useWebGLSupport();
  const [contextLost, setContextLost] = useState(false);
  const cityAvailable = webgl !== false && !contextLost;

  const [query, setQuery] = useState("");
  const [languages, setLanguages] = useState<ReadonlySet<string>>(new Set());
  const [focusDir, setFocusDir] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [heightMetric, setHeightMetric] = useState<HeightMetric>("lines");
  const [view, setView] = useState<"city" | "list">("city");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(true);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);

  const camera = useRef<CameraApi | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const files = snapshot.files;
  const budget = isMobile ? RENDER_BUDGET.mobile : RENDER_BUDGET.desktop;
  const layout = useMemo(() => generateCity(files, { heightMetric, budget }), [files, heightMetric, budget]);
  const langs = useMemo(() => languageStats(files), [files]);
  const tree = useMemo(() => directoryTree(files), [files]);
  const filters: Filters = useMemo(() => ({ query, languages, dir: focusDir }), [query, languages, focusDir]);
  const filtered = hasFilters(filters);
  const fileMask = useMemo(() => matchFiles(files, filters), [files, filters]);
  const active = useMemo(() => (filtered ? activeBuildings(layout, fileMask) : null), [filtered, layout, fileMask]);
  const totalLines = useMemo(() => files.reduce((s, f) => s + (f.lines ?? 0), 0), [files]);

  const effectiveView = cityAvailable ? view : "list";
  const selectedBuilding = selection ? layout.buildings[selection.buildingId] : undefined;

  // Selection is stored by building id; when the layout changes (metric/budget), drop it.
  const [layoutForSelection, setLayoutForSelection] = useState(layout);
  if (layoutForSelection !== layout) {
    setLayoutForSelection(layout);
    setSelection(null);
  }

  const selectFile = useCallback(
    (fileIndex: number) => {
      const id = layout.fileToBuilding[fileIndex]!;
      const b = layout.buildings[id];
      if (!b) return;
      setSelection({ buildingId: id, fileIndex: b.kind === "aggregate" ? fileIndex : null });
      setDrawerOpen(false);
      if (effectiveView === "city") camera.current?.focusBuilding(id);
    },
    [layout, effectiveView],
  );

  const focusDirectory = useCallback((path: string | null) => {
    setFocusDir(path);
    setDrawerOpen(false);
    if (path) camera.current?.focusBlock(path);
    else camera.current?.fit();
  }, []);

  const toggleLanguage = useCallback((id: string) => {
    setLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "Escape") {
        if (typing && t instanceof HTMLInputElement && t.value) return;
        setSelection(null);
        setDrawerOpen(false);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        if (isMobile) setDrawerOpen(true);
        setTimeout(() => searchRef.current?.focus(), 0);
      } else if (e.key === "f" || e.key === "F") camera.current?.fit();
      else if (e.key === "r" || e.key === "R") camera.current?.reset();
      else if (e.key === "l" || e.key === "L") setShowLabels((v) => !v);
      else if (e.key === "+" || e.key === "=") camera.current?.zoom(0.7);
      else if (e.key === "-" || e.key === "_") camera.current?.zoom(1.4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile]);

  const notices = useMemo(() => {
    const out: string[] = [];
    if (snapshot.source === "sample") {
      out.push(
        `Bundled snapshot of ${snapshot.repo.owner}/${snapshot.repo.name} at ${shortSha(snapshot.revision.sha)}, captured ${formatDate(snapshot.analyzedAt)}. Not a live analysis.`,
      );
    } else {
      if (pinned) {
        out.push(
          `Saved snapshot of ${snapshot.revision.ref} at ${shortSha(snapshot.revision.sha)}, analyzed ${formatDate(snapshot.analyzedAt)}. This link always shows this exact city.`,
        );
      } else {
        out.push(
          `Built from the default branch (${snapshot.revision.ref}) at ${shortSha(snapshot.revision.sha)}. Opening this link later rebuilds the city from the branch as it is then.` +
            (permalink ? " Use “Permanent link” to share this exact snapshot." : ""),
        );
      }
    }
    if (layout.aggregatedFiles > 0) {
      const blocks = layout.buildings.filter((b) => b.kind === "aggregate").length;
      out.push(
        `${formatNumber(layout.aggregatedFiles)} of ${formatNumber(files.length)} files are merged into ${formatNumber(blocks)} striped blocks to stay within the ${formatNumber(budget)}-building rendering budget. Every file remains in search and the list view.`,
      );
    }
    if (snapshot.excluded.count > 0) {
      out.push(`${formatNumber(snapshot.excluded.count)} files were excluded (dependencies, build output, lockfiles, binaries, generated code).`);
    }
    out.push(...snapshot.notes);
    if (!cityAvailable) out.push(contextLost ? "The 3D view stopped (graphics context lost). Showing the list view." : "This browser cannot display WebGL. Showing the list view.");
    return out;
  }, [snapshot, layout, files.length, budget, cityAvailable, contextLost, pinned, permalink]);

  const activityLabel = snapshot.activity
    ? `Commit counts and last-change dates cover the last ${snapshot.activity.commits} commits on ${snapshot.revision.ref}${snapshot.activity.oldest ? ` (since ${formatDate(snapshot.activity.oldest)})` : ""}.`
    : null;

  const sidebar = (
    <Sidebar
      ref={searchRef}
      files={files}
      fileMask={fileMask}
      query={query}
      onQuery={setQuery}
      languages={langs}
      enabledLanguages={languages}
      onToggleLanguage={toggleLanguage}
      onClearLanguages={() => setLanguages(new Set())}
      tree={tree}
      focusDir={focusDir}
      onFocusDir={focusDirectory}
      onSelectFile={selectFile}
      showLabels={showLabels}
      onShowLabels={setShowLabels}
      heightMetric={heightMetric}
      onHeightMetric={setHeightMetric}
      linesAvailable={snapshot.lines.counted === snapshot.lines.total}
    />
  );

  const detail = selectedBuilding && (
    <DetailContent
      snapshot={snapshot}
      building={selectedBuilding}
      fileIndex={selection!.fileIndex}
      onClose={() => setSelection(null)}
      onFocus={() => camera.current?.focusBuilding(selectedBuilding.id)}
      onSelectFile={(i) => setSelection((s) => (s ? { ...s, fileIndex: i } : s))}
    />
  );

  const hovered = hover ? layout.buildings[hover.id] : undefined;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <TopBar snapshot={snapshot} permalink={permalink} pinned={pinned} stats={{ files: files.length, lines: totalLines, languages: langs.length }} />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-[300px] shrink-0 border-r border-line bg-paper md:block" aria-label="Search and filters">
          {!isMobile && sidebar}
        </aside>

        <main className="relative min-w-0 flex-1" aria-label="City">
          {/* Toolbar */}
          <div className="absolute left-3 top-3 z-20 flex items-center gap-2 md:left-4 md:top-4">
            <div className="flex border border-line-strong bg-surface" role="group" aria-label="View mode">
              <button
                type="button"
                aria-pressed={effectiveView === "city"}
                disabled={!cityAvailable}
                onClick={() => setView("city")}
                className={cn("flex h-9 items-center gap-1.5 px-3 text-[13px]", effectiveView === "city" ? "bg-ink text-paper" : "text-ink-2 hover:bg-black/[0.05] disabled:opacity-40")}
              >
                <Box className="size-4" aria-hidden /> City
              </button>
              <button
                type="button"
                aria-pressed={effectiveView === "list"}
                onClick={() => setView("list")}
                className={cn("flex h-9 items-center gap-1.5 border-l border-line px-3 text-[13px]", effectiveView === "list" ? "bg-ink text-paper" : "text-ink-2 hover:bg-black/[0.05]")}
              >
                <List className="size-4" aria-hidden /> List
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 items-center gap-1.5 border border-line-strong bg-surface px-3 text-[13px] text-ink-2 md:hidden"
              aria-haspopup="dialog"
            >
              <SlidersHorizontal className="size-4" aria-hidden /> Filters
              {filtered && <span className="size-1.5 rounded-full bg-accent" aria-label="(active)" />}
            </button>
            <CopyLinkButton
              compactLabel
              className="h-9 w-9 md:hidden"
              path={permalink ?? undefined}
              ariaLabel={permalink && !pinned ? "Copy a permanent link to this exact snapshot" : "Copy link to this city"}
            />
          </div>

          {/* Notices */}
          {noticesOpen ? (
            <div
              className={cn(
                "absolute z-20 max-h-[40%] overflow-y-auto border border-line-strong bg-surface/95 text-[12px] leading-snug text-ink-2 md:max-h-none md:text-[12.5px] md:leading-relaxed",
                "left-3 right-3 top-[60px] md:left-auto md:right-4 md:top-4 md:w-[380px]",
                selectedBuilding && "hidden",
              )}
              role="note"
              data-testid="notices"
            >
              <div className="flex items-start gap-2 p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {notices.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <button type="button" onClick={() => setNoticesOpen(false)} className="-m-1 grid size-7 shrink-0 place-items-center text-muted hover:text-ink" aria-label="Hide notes">
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNoticesOpen(true)}
              className={cn("absolute right-3 top-3 z-20 grid size-9 place-items-center border border-line-strong bg-surface text-muted hover:text-ink md:right-4 md:top-4", selectedBuilding && "hidden")}
              aria-label="Show notes about this city"
            >
              <Info className="size-4" />
            </button>
          )}

          {effectiveView === "city" ? (
            <CityScene
              className="absolute inset-0 touch-none"
              layout={layout}
              active={active}
              selectedId={selection?.buildingId ?? null}
              showLabels={showLabels}
              cameraRef={camera}
              lowPower={isMobile}
              reducedMotion={reducedMotion}
              onHover={(id, x, y) => setHover(id === null ? null : { id, x, y })}
              onSelect={(id) => {
                setSelection(id === null ? null : { buildingId: id, fileIndex: null });
                if (id !== null) setSheetExpanded(false);
              }}
              onReady={onSceneReady}
              onContextLost={() => setContextLost(true)}
            />
          ) : (
            <div className="absolute inset-0 pt-[60px] md:pt-[64px]">
              <FileList
                files={files}
                fileMask={fileMask}
                filtered={filtered}
                selectedFile={selection ? (selectedBuilding?.kind === "file" ? selectedBuilding.fileIndex : selection.fileIndex) : null}
                onSelectFile={selectFile}
                activityLabel={activityLabel}
              />
            </div>
          )}

          {/* Hover tooltip (pointer devices) */}
          {hovered && effectiveView === "city" && (
            <div
              className="pointer-events-none fixed z-40 max-w-[320px] border border-ink bg-ink px-2.5 py-2 text-paper shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
              style={{ left: Math.min(hover!.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 330), top: hover!.y + 16 }}
              role="tooltip"
            >
              <div className="truncate font-mono text-[12.5px] font-medium">{hovered.kind === "aggregate" ? `${hovered.aggregate!.count} smaller files` : basename(hovered.path)}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-paper/75">
                {hovered.kind === "file" && <span className="size-2 rounded-[1px]" style={{ background: languageInfo(hovered.language).color }} aria-hidden />}
                {hovered.kind === "file" ? languageInfo(hovered.language).name : "Aggregated block"}
                <span className="text-paper/40">·</span>
                <span className="truncate font-mono">{(hovered.kind === "file" ? dirname(hovered.path) : hovered.dir) || "/"}</span>
              </div>
            </div>
          )}

          {/* Bottom bar: legend + controls */}
          {effectiveView === "city" && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-end justify-between gap-3 md:inset-x-4 md:bottom-4">
              <div className="pointer-events-auto hidden border border-line-strong bg-surface/95 px-3 py-2 lg:block">
                <Legend heightMetric={heightMetric} />
                <p className="mt-1 text-[11.5px] text-muted">
                  Drag to orbit · right-drag to pan · scroll to zoom · click a building · <Kbd>/</Kbd> search <Kbd>F</Kbd> fit <Kbd>L</Kbd> labels
                </p>
              </div>
              <CameraControls camera={camera} className={cn("pointer-events-auto ml-auto", isMobile && selectedBuilding && "hidden")} />
            </div>
          )}

          {/* Desktop detail panel */}
          {detail && !isMobile && (
            <aside
              className="gc-rise absolute bottom-4 right-4 top-4 z-30 w-[360px] overflow-y-auto border border-line-strong bg-surface p-5 shadow-[0_10px_40px_rgba(20,20,20,0.10)]"
              aria-labelledby="detail-title"
              data-testid="detail-panel"
            >
              {detail}
            </aside>
          )}

          {/* Mobile bottom sheet */}
          {detail && isMobile && (
            <section
              className={cn(
                "gc-rise absolute inset-x-0 bottom-0 z-30 flex flex-col border-t border-line-strong bg-surface shadow-[0_-10px_30px_rgba(20,20,20,0.12)]",
                sheetExpanded ? "max-h-[78%]" : "max-h-[46%]",
              )}
              aria-labelledby="detail-title"
              data-testid="detail-sheet"
            >
              <button
                type="button"
                onClick={() => setSheetExpanded((v) => !v)}
                className="grid h-7 w-full shrink-0 place-items-center"
                aria-label={sheetExpanded ? "Collapse details" : "Expand details"}
                aria-expanded={sheetExpanded}
              >
                <span className="h-1 w-10 rounded-full bg-line-strong" />
              </button>
              <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{detail}</div>
            </section>
          )}
        </main>
      </div>

      {/* Mobile filter drawer */}
      {isMobile && drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Search and filters">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Close filters" onClick={() => setDrawerOpen(false)} />
          <div className="gc-rise absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col border-r border-line-strong bg-paper">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="text-[14px] font-semibold">Search & filters</span>
              <button type="button" onClick={() => setDrawerOpen(false)} className="grid size-10 place-items-center text-muted hover:text-ink" aria-label="Close filters">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{sidebar}</div>
          </div>
        </div>
      )}
    </div>
  );
}
