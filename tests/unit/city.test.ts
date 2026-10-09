import { describe, expect, it } from "vitest";
import { applyBudget } from "@/lib/city/aggregate";
import { generateCity, shelfPack, type Building } from "@/lib/city/layout";
import { footprintFor, heightForLines, SCALE, buildingHeight } from "@/lib/city/scale";
import { file, syntheticRepo } from "../fixtures/files";

function overlaps(a: Building, b: Building) {
  const eps = 1e-9;
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - eps && Math.abs(a.z - b.z) < (a.w + b.w) / 2 - eps;
}

describe("scale", () => {
  it("is monotonic and compressive", () => {
    expect(heightForLines(0)).toBe(SCALE.baseHeight);
    expect(heightForLines(100)).toBeGreaterThan(heightForLines(10));
    expect(heightForLines(100_000) / heightForLines(100)).toBeLessThan(3);
    expect(footprintFor(0)).toBe(SCALE.minFootprint);
    expect(footprintFor(10_000_000)).toBe(SCALE.maxFootprint);
    expect(footprintFor(5000)).toBeGreaterThan(footprintFor(500));
  });

  it("never substitutes bytes for unknown line counts", () => {
    expect(buildingHeight("lines", null, 50_000)).toEqual({ h: SCALE.unknownHeight, unknown: true });
    expect(buildingHeight("lines", null, 10)).toEqual({ h: SCALE.unknownHeight, unknown: true });
  });
});

describe("shelfPack", () => {
  it("produces non-overlapping placements within its bounds", () => {
    const rects = Array.from({ length: 50 }, (_, i) => ({ w: 1 + (i % 7), d: 1 + ((i * 3) % 5), key: String(i) }));
    const { w, d, positions } = shelfPack(rects, 0.5);
    for (let i = 0; i < rects.length; i++) {
      const a = positions[i]!;
      expect(a.x + rects[i]!.w).toBeLessThanOrEqual(w + 1e-9);
      expect(a.z + rects[i]!.d).toBeLessThanOrEqual(d + 1e-9);
      for (let j = i + 1; j < rects.length; j++) {
        const b = positions[j]!;
        const sep = a.x + rects[i]!.w <= b.x || b.x + rects[j]!.w <= a.x || a.z + rects[i]!.d <= b.z || b.z + rects[j]!.d <= a.z;
        expect(sep).toBe(true);
      }
    }
  });
});

describe("generateCity", () => {
  it("is deterministic for the same snapshot and options", () => {
    const files = syntheticRepo(600, 7);
    const a = generateCity(files, { heightMetric: "lines", budget: 5000 });
    const b = generateCity([...files], { heightMetric: "lines", budget: 5000 });
    expect(JSON.stringify(a.buildings)).toBe(JSON.stringify(b.buildings));
    expect(JSON.stringify(a.blocks)).toBe(JSON.stringify(b.blocks));
  });

  it.each([1, 2, 3])("has no overlapping footprints (seed %d)", (seed) => {
    const { buildings } = generateCity(syntheticRepo(700, seed), { heightMetric: "lines", budget: 5000 });
    // Sweep on x to keep this O(n log n)-ish.
    const sorted = [...buildings].sort((p, q) => p.x - p.w / 2 - (q.x - q.w / 2));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j]!.x - sorted[j]!.w / 2 >= sorted[i]!.x + sorted[i]!.w / 2) break;
        expect(overlaps(sorted[i]!, sorted[j]!)).toBe(false);
      }
    }
  });

  it("places every building inside its directory's block, and child blocks inside parents", () => {
    const { buildings, blocks } = generateCity(syntheticRepo(400, 4), { heightMetric: "lines", budget: 5000 });
    const byPath = new Map(blocks.map((b) => [b.path, b]));
    for (const b of buildings) {
      if (!b.dir) continue;
      const block = byPath.get(b.dir)!;
      expect(block).toBeDefined();
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(block.x - 1e-9);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(block.x + block.w + 1e-9);
      expect(b.z - b.w / 2).toBeGreaterThanOrEqual(block.z - 1e-9);
      expect(b.z + b.w / 2).toBeLessThanOrEqual(block.z + block.d + 1e-9);
    }
    for (const block of blocks) {
      const parentPath = block.path.includes("/") ? block.path.slice(0, block.path.lastIndexOf("/")) : "";
      if (!parentPath) continue;
      const parent = byPath.get(parentPath)!;
      expect(block.x).toBeGreaterThanOrEqual(parent.x - 1e-9);
      expect(block.x + block.w).toBeLessThanOrEqual(parent.x + parent.w + 1e-9);
      expect(block.z).toBeGreaterThanOrEqual(parent.z - 1e-9);
      expect(block.z + block.d).toBeLessThanOrEqual(parent.z + parent.d + 1e-9);
    }
  });

  it("maps every file to exactly one building, stable across height metrics", () => {
    const files = syntheticRepo(300, 9);
    const a = generateCity(files, { heightMetric: "lines", budget: 5000 });
    const b = generateCity(files, { heightMetric: "size", budget: 5000 });
    expect(a.buildings).toHaveLength(files.length);
    expect([...a.fileToBuilding].every((id) => id >= 0)).toBe(true);
    const pos = (l: typeof a) => l.buildings.map((x) => `${x.path}@${x.x.toFixed(4)},${x.z.toFixed(4)}`);
    expect(pos(a)).toEqual(pos(b));
    a.buildings.forEach((bl) => expect(files[bl.fileIndex]!.path).toBe(bl.path));
  });

  it("marks files with unknown line counts instead of inventing heights", () => {
    const files = [file("a.ts", 100_000, null), file("b.ts", 100, 10)];
    const { buildings } = generateCity(files, { heightMetric: "lines", budget: 10 });
    const a = buildings.find((b) => b.path === "a.ts")!;
    expect(a.unknown).toBe(true);
    expect(a.h).toBe(SCALE.unknownHeight);
  });

  it("handles an empty repository", () => {
    const city = generateCity([], { heightMetric: "lines", budget: 10 });
    expect(city.buildings).toHaveLength(0);
    expect(city.blocks).toHaveLength(0);
  });
});

describe("render budget", () => {
  it("enforces the budget and accounts for every file", () => {
    const files = syntheticRepo(3000, 5);
    for (const budget of [100, 500, 2000]) {
      const city = generateCity(files, { heightMetric: "lines", budget });
      expect(city.buildings.length).toBeLessThanOrEqual(budget);
      const accounted = city.buildings.reduce((s, b) => s + (b.kind === "aggregate" ? b.aggregate!.count : 1), 0);
      expect(accounted).toBe(files.length);
      expect(city.aggregatedFiles).toBe(files.length - city.buildings.filter((b) => b.kind === "file").length);
      expect([...city.fileToBuilding].every((id) => id >= 0 && id < city.buildings.length)).toBe(true);
    }
  });

  it("keeps the largest files individual and is deterministic", () => {
    const files = syntheticRepo(1000, 6);
    const a = applyBudget(files, 200);
    const b = applyBudget(files, 200);
    expect(a.kept).toEqual(b.kept);
    const minKept = Math.min(...a.kept.map((i) => files[i]!.size));
    const maxAgg = Math.max(...[...a.aggregates.values()].flat().map((i) => files[i]!.size));
    expect(minKept).toBeGreaterThanOrEqual(maxAgg);
  });

  it("does nothing under budget", () => {
    const files = syntheticRepo(50, 2);
    expect(applyBudget(files, 50).aggregates.size).toBe(0);
  });
});
