import { dirname } from "@/lib/repo/languages";
import type { RepoFile } from "@/lib/types";

export const RENDER_BUDGET = { desktop: 5000, mobile: 2000 } as const;

export interface BudgetResult {
  /** Indices (into `files`) rendered as individual buildings, ascending. */
  kept: number[];
  /** Directory path → indices of files merged into that directory's aggregate block. */
  aggregates: Map<string, number[]>;
}

/**
 * Deterministic render budget. When there are more files than `budget`, the
 * largest files (by exact byte size, ties by path) stay individual and the rest
 * are merged into one clearly-marked aggregate block per directory, so the total
 * number of rendered objects is ≤ budget and every file is still accounted for.
 */
export function applyBudget(files: readonly RepoFile[], budget: number): BudgetResult {
  const n = files.length;
  if (n <= budget) return { kept: files.map((_, i) => i), aggregates: new Map() };

  const ranked = files
    .map((f, i) => i)
    .sort((a, b) => files[b]!.size - files[a]!.size || cmp(files[a]!.path, files[b]!.path));

  let k = Math.max(0, budget - 1);
  for (;;) {
    const dirs = new Set<string>();
    for (let r = k; r < n; r++) dirs.add(dirname(files[ranked[r]!]!.path));
    if (k + dirs.size <= budget || k === 0) break;
    k = Math.max(0, budget - dirs.size);
  }

  const kept = ranked.slice(0, k).sort((a, b) => a - b);
  const aggregates = new Map<string, number[]>();
  for (const i of ranked.slice(k).sort((a, b) => a - b)) {
    const d = dirname(files[i]!.path);
    const list = aggregates.get(d);
    if (list) list.push(i);
    else aggregates.set(d, [i]);
  }
  return { kept, aggregates };
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
