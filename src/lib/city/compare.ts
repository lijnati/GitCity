import type { RepoFile, RepoSnapshot } from "@/lib/types";
import { generateCity, type CityLayout } from "./layout";
import { aggregateFootprintFor, footprintFor, heightForLines, SCALE } from "./scale";
import type { FrameValues } from "./timelapse";

/**
 * Comparing two cities of the same repository (two commits). Both are laid out
 * on one shared plan — the union of their files, each slot sized for its larger
 * version — so moving between them changes heights and footprints in place.
 *
 * A file is "modified" when its Git blob SHA differs (exact). Snapshots made
 * before blob SHAs were recorded fall back to size or line-count differences,
 * which can miss edits that keep both unchanged; `exact` says which applied.
 */
export type ChangeStatus = "added" | "removed" | "modified" | "unchanged";

export interface CompareEntry {
  path: string;
  status: ChangeStatus;
  base: RepoFile | null;
  head: RepoFile | null;
  /** Line difference when both counts are known (or the file exists on one side with known lines). */
  linesDelta: number | null;
  sizeDelta: number;
}

export interface CompareSummary {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  /** Lines added minus removed across changed files with known counts on both sides. */
  netLines: number;
  /** Changed files whose line delta is unknown. */
  unknownLines: number;
  /** True when every file on both sides has a blob SHA (exact change detection). */
  exact: boolean;
}

export interface CompareCity {
  layout: CityLayout;
  /** Union entries, in `layout`'s file index order (sorted by path). */
  entries: CompareEntry[];
  files: RepoFile[];
  base: FrameValues;
  head: FrameValues;
  /** Head plus removed files at their base size: everything that changed, at once. */
  changes: FrameValues;
  /** Status per building id (aggregates: modified when any file inside changed). */
  status: ChangeStatus[];
  summary: CompareSummary;
}

export const STATUS_COLORS: Record<Exclude<ChangeStatus, "unchanged">, string> = {
  added: "#3f8f5b",
  removed: "#c8462b",
  modified: "#d9a521",
};

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function compareStatus(base: RepoFile | null, head: RepoFile | null): ChangeStatus {
  if (!base) return "added";
  if (!head) return "removed";
  if (base.blob && head.blob) return base.blob === head.blob ? "unchanged" : "modified";
  if (base.size !== head.size) return "modified";
  if (base.lines !== null && head.lines !== null && base.lines !== head.lines) return "modified";
  return "unchanged";
}

export function compareSnapshots(baseSnap: RepoSnapshot, headSnap: RepoSnapshot, budget: number): CompareCity {
  const baseBy = new Map(baseSnap.files.map((f) => [f.path, f]));
  const headBy = new Map(headSnap.files.map((f) => [f.path, f]));
  const paths = [...new Set([...baseBy.keys(), ...headBy.keys()])].sort(byPath);

  const summary: CompareSummary = { added: 0, removed: 0, modified: 0, unchanged: 0, netLines: 0, unknownLines: 0, exact: true };
  const entries: CompareEntry[] = paths.map((path) => {
    const base = baseBy.get(path) ?? null;
    const head = headBy.get(path) ?? null;
    if ((base && !base.blob) || (head && !head.blob)) summary.exact = false;
    const status = compareStatus(base, head);
    summary[status]++;
    let linesDelta: number | null = null;
    if (status === "added") linesDelta = head!.lines;
    else if (status === "removed") linesDelta = base!.lines === null ? null : -base!.lines;
    else if (base!.lines !== null && head!.lines !== null) linesDelta = head!.lines - base!.lines;
    if (status !== "unchanged") {
      if (linesDelta === null) summary.unknownLines++;
      else summary.netLines += linesDelta;
    }
    return { path, status, base, head, linesDelta, sizeDelta: (head?.size ?? 0) - (base?.size ?? 0) };
  });

  // Union file for the shared plan: the newest version's metadata, sized for the larger version.
  const files: RepoFile[] = entries.map((e) => {
    const f = (e.head ?? e.base)!;
    const lines = [e.base?.lines, e.head?.lines].filter((l): l is number => typeof l === "number");
    return { ...f, size: Math.max(e.base?.size ?? 0, e.head?.size ?? 0), lines: lines.length ? Math.max(...lines) : null };
  });
  const layout = generateCity(files, { heightMetric: "lines", budget });

  const frame = (pick: (e: CompareEntry) => RepoFile | null): FrameValues => {
    const n = layout.buildings.length;
    const h = new Float32Array(n);
    const w = new Float32Array(n);
    const visible = new Uint8Array(n);
    let fileCount = 0;
    for (const e of entries) if (pick(e)) fileCount++;
    for (const b of layout.buildings) {
      if (b.kind === "file") {
        const f = pick(entries[b.fileIndex]!);
        if (!f) continue;
        visible[b.id] = 1;
        w[b.id] = footprintFor(f.size);
        h[b.id] = f.lines === null ? SCALE.unknownHeight : heightForLines(f.lines);
      } else {
        let bytes = 0;
        let present = 0;
        for (const i of b.aggregate!.files) {
          const f = pick(entries[i]!);
          if (f) {
            bytes += f.size;
            present++;
          }
        }
        if (!present) continue;
        visible[b.id] = 1;
        w[b.id] = aggregateFootprintFor(bytes);
        h[b.id] = SCALE.aggregateHeight;
      }
    }
    return { h, w, visible, fileCount };
  };

  const status: ChangeStatus[] = layout.buildings.map((b) => {
    if (b.kind === "file") return entries[b.fileIndex]!.status;
    const s = new Set(b.aggregate!.files.map((i) => entries[i]!.status));
    if (s.size === 1) return [...s][0]!;
    return s.has("modified") || s.has("added") || s.has("removed") ? "modified" : "unchanged";
  });

  return {
    layout,
    entries,
    files,
    base: frame((e) => e.base),
    head: frame((e) => e.head),
    changes: frame((e) => e.head ?? e.base),
    status,
    summary,
  };
}
