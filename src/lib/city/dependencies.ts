import type { ImportGraph } from "@/lib/types";
import type { CityLayout } from "./layout";

/**
 * File-level import edges lifted to buildings: files merged into one aggregate
 * share its building, links inside one building are dropped, duplicates merged.
 * Sorted for deterministic drawing order (and a deterministic cap).
 */
export function buildingEdges(layout: CityLayout, graph: ImportGraph): [number, number][] {
  const seen = new Set<number>();
  const out: [number, number][] = [];
  const n = layout.buildings.length + 1;
  for (const [a, b] of graph.edges) {
    const ba = layout.fileToBuilding[a];
    const bb = layout.fileToBuilding[b];
    if (ba === undefined || bb === undefined || ba < 0 || bb < 0 || ba === bb) continue;
    const key = ba * n + bb;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([ba, bb]);
  }
  return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}
