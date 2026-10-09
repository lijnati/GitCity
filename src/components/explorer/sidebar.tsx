"use client";

import { ChevronRight, Search, X } from "lucide-react";
import { forwardRef, useMemo, useState } from "react";
import { formatNumber } from "@/lib/format";
import { basename, dirname, languageInfo } from "@/lib/repo/languages";
import type { RepoFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { HeightMetric } from "@/lib/city/scale";
import type { DirNode, LanguageStat } from "./model";

export interface SidebarProps {
  files: readonly RepoFile[];
  fileMask: Uint8Array;
  query: string;
  onQuery: (q: string) => void;
  languages: LanguageStat[];
  enabledLanguages: ReadonlySet<string>;
  onToggleLanguage: (id: string) => void;
  onClearLanguages: () => void;
  tree: DirNode;
  focusDir: string | null;
  onFocusDir: (path: string | null) => void;
  onSelectFile: (fileIndex: number) => void;
  showLabels: boolean;
  onShowLabels: (v: boolean) => void;
  heightMetric: HeightMetric;
  onHeightMetric: (m: HeightMetric) => void;
  linesAvailable: boolean;
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
      {aside}
    </div>
  );
}

export const Sidebar = forwardRef<HTMLInputElement, SidebarProps>(function Sidebar(props, searchRef) {
  const q = props.query.trim();
  const results = useMemo(() => {
    if (!q) return [];
    const out: number[] = [];
    for (let i = 0; i < props.files.length && out.length < 60; i++) if (props.fileMask[i]) out.push(i);
    return out;
  }, [q, props.files, props.fileMask]);
  const matchCount = useMemo(() => (q ? props.fileMask.reduce((s, v) => s + v, 0) : 0), [q, props.fileMask]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        <label htmlFor="file-search" className="sr-only">
          Search files
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            ref={searchRef}
            id="file-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search files…"
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            className="h-10 w-full rounded-sm border border-line-strong bg-surface pl-9 pr-9 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-faint hover:border-ink-2 focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {props.query ? (
            <button type="button" onClick={() => props.onQuery("")} className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-xs text-muted hover:text-ink" aria-label="Clear search">
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-xs border border-line px-1 font-mono text-[11px] text-faint">/</kbd>
          )}
        </div>
        {q && (
          <div className="mt-3" aria-live="polite">
            <p className="mb-1.5 text-[12px] text-muted">
              {formatNumber(matchCount)} {matchCount === 1 ? "match" : "matches"}
              {matchCount > results.length ? ` · showing ${results.length}` : ""}
            </p>
            <ul className="max-h-60 overflow-auto" role="list">
              {results.map((i) => {
                const f = props.files[i]!;
                return (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => props.onSelectFile(i)}
                      className="group flex w-full items-center gap-2 rounded-xs px-1.5 py-1.5 text-left hover:bg-black/[0.045]"
                    >
                      <span className="size-2 shrink-0 rounded-[1px]" style={{ background: languageInfo(f.language).color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[12.5px] text-ink">{basename(f.path)}</span>
                        <span className="block truncate font-mono text-[11px] text-faint">{dirname(f.path) || "/"}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {results.length === 0 && <li className="px-1.5 py-1 text-[12px] text-faint">No files match.</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <section className="border-b border-line p-4" aria-labelledby="lang-title">
          <SectionTitle
            aside={
              props.enabledLanguages.size > 0 && (
                <button type="button" onClick={props.onClearLanguages} className="text-[12px] text-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
                  Show all
                </button>
              )
            }
          >
            <span id="lang-title">Languages</span>
          </SectionTitle>
          <ul className="-mx-1.5" role="list">
            {props.languages.map((l) => {
              const on = props.enabledLanguages.size === 0 || props.enabledLanguages.has(l.id);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    aria-pressed={props.enabledLanguages.has(l.id)}
                    onClick={() => props.onToggleLanguage(l.id)}
                    className={cn("flex min-h-8 w-full items-center gap-2.5 rounded-xs px-1.5 py-1 text-left text-[13px] hover:bg-black/[0.045]", !on && "text-faint")}
                  >
                    <span
                      className={cn("size-3 shrink-0 rounded-[1px] border", on ? "border-transparent" : "border-line-strong bg-transparent")}
                      style={on ? { background: l.color } : undefined}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="tabular font-mono text-[12px] text-faint">{formatNumber(l.files)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="border-b border-line p-4" aria-labelledby="dir-title">
          <SectionTitle
            aside={
              props.focusDir !== null && (
                <button type="button" onClick={() => props.onFocusDir(null)} className="text-[12px] text-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
                  Whole city
                </button>
              )
            }
          >
            <span id="dir-title">Neighborhoods</span>
          </SectionTitle>
          <ul className="-mx-1.5" role="tree" aria-label="Directories">
            {props.tree.children.map((n) => (
              <DirItem key={n.path} node={n} depth={0} focusDir={props.focusDir} onFocusDir={props.onFocusDir} />
            ))}
            {props.tree.children.length === 0 && <li className="px-1.5 text-[12px] text-faint">All files are at the repository root.</li>}
          </ul>
        </section>

        <section className="p-4" aria-labelledby="view-title">
          <SectionTitle>
            <span id="view-title">View</span>
          </SectionTitle>
          <div className="flex flex-col gap-1">
            <Switch checked={props.showLabels} onCheckedChange={props.onShowLabels} label="Neighborhood labels" />
          </div>
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-[12px] text-muted">Building height</legend>
            <div className="grid grid-cols-2 rounded-sm border border-line-strong p-0.5">
              {(
                [
                  ["lines", "Lines of code"],
                  ["size", "File size"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={props.heightMetric === value}
                  onClick={() => props.onHeightMetric(value)}
                  className={cn("h-8 rounded-xs text-[12.5px]", props.heightMetric === value ? "bg-ink text-paper" : "text-ink-2 hover:bg-black/[0.05]")}
                >
                  {label}
                </button>
              ))}
            </div>
            {!props.linesAvailable && props.heightMetric === "lines" && (
              <p className="mt-2 text-[12px] leading-snug text-muted">Line counts are unavailable for some files; those are shown flat and striped.</p>
            )}
          </fieldset>
        </section>
      </div>
    </div>
  );
});

function DirItem({ node, depth, focusDir, onFocusDir }: { node: DirNode; depth: number; focusDir: string | null; onFocusDir: (p: string | null) => void }) {
  const inFocusPath = focusDir !== null && (focusDir === node.path || focusDir.startsWith(node.path + "/"));
  const [open, setOpen] = useState(inFocusPath);
  const expanded = open || inFocusPath;
  const hasChildren = node.children.length > 0;
  const selected = focusDir === node.path;
  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined} aria-selected={selected}>
      <div className={cn("flex min-h-8 items-center rounded-xs pr-1.5 hover:bg-black/[0.045]", selected && "bg-black/[0.07]")} style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          onClick={() => setOpen(!expanded)}
          className={cn("grid size-7 shrink-0 place-items-center text-faint hover:text-ink", !hasChildren && "invisible")}
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          tabIndex={hasChildren ? 0 : -1}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <button type="button" onClick={() => onFocusDir(selected ? null : node.path)} className="flex min-w-0 flex-1 items-baseline gap-2 py-1 text-left">
          <span className={cn("truncate font-mono text-[12.5px]", selected ? "font-semibold text-ink" : "text-ink-2")}>{node.name}/</span>
          <span className="tabular ml-auto font-mono text-[11px] text-faint">{formatNumber(node.files)}</span>
        </button>
      </div>
      {hasChildren && expanded && (
        <ul role="group">
          {node.children.map((c) => (
            <DirItem key={c.path} node={c} depth={depth + 1} focusDir={focusDir} onFocusDir={onFocusDir} />
          ))}
        </ul>
      )}
    </li>
  );
}
