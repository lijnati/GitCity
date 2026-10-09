/**
 * Metric → geometry mappings. All are monotonic, documented in the README, and
 * deliberately compressive so a 20k-line file does not dwarf the whole city.
 */

export type HeightMetric = "lines" | "size";

export const SCALE = {
  minFootprint: 1,
  maxFootprint: 5.5,
  aggregateMaxFootprint: 9,
  baseHeight: 0.5,
  heightPerLog2: 1.9,
  unknownHeight: 0.6,
  aggregateHeight: 0.9,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Footprint edge length from exact byte size: 0.8 + 0.5·√(bytes/100), clamped to [1, 5.5]. */
export function footprintFor(bytes: number): number {
  return clamp(0.8 + 0.5 * Math.sqrt(Math.max(0, bytes) / 100), SCALE.minFootprint, SCALE.maxFootprint);
}

export function aggregateFootprintFor(bytes: number): number {
  return clamp(0.8 + 0.5 * Math.sqrt(Math.max(0, bytes) / 100), 2, SCALE.aggregateMaxFootprint);
}

/** Height from exact line count: 0.5 + 1.9·log₂(1 + lines). */
export function heightForLines(lines: number): number {
  return SCALE.baseHeight + SCALE.heightPerLog2 * Math.log2(1 + Math.max(0, lines));
}

/** Height from exact byte size (alternative view): 0.5 + 1.9·log₂(1 + bytes/40). */
export function heightForBytes(bytes: number): number {
  return SCALE.baseHeight + SCALE.heightPerLog2 * Math.log2(1 + Math.max(0, bytes) / 40);
}

export function buildingHeight(metric: HeightMetric, lines: number | null, bytes: number): { h: number; unknown: boolean } {
  if (metric === "size") return { h: heightForBytes(bytes), unknown: false };
  if (lines === null) return { h: SCALE.unknownHeight, unknown: true };
  return { h: heightForLines(lines), unknown: false };
}
