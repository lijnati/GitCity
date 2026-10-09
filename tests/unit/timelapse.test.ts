import { describe, expect, it } from "vitest";
import { lastPageFromLink } from "@/lib/github/client";
import { filterTree, sampleIndices } from "@/lib/repo/history";
import { buildTimelapseCity } from "@/lib/city/timelapse";
import { footprintFor, heightForBytes } from "@/lib/city/scale";
import type { Timelapse } from "@/lib/types";

describe("sampleIndices", () => {
  it("spans oldest to newest and ends at the head", () => {
    const pages = sampleIndices(1000, 16);
    expect(pages).toHaveLength(16);
    expect(pages[0]).toBe(1000);
    expect(pages.at(-1)).toBe(1);
    for (let i = 1; i < pages.length; i++) expect(pages[i]!).toBeLessThan(pages[i - 1]!);
  });

  it("uses every commit of a short history", () => {
    expect(sampleIndices(5, 16)).toEqual([5, 4, 3, 2, 1]);
    expect(sampleIndices(1, 16)).toEqual([1]);
    expect(sampleIndices(0, 16)).toEqual([]);
  });

  it("is deterministic and evenly spaced", () => {
    expect(sampleIndices(101, 5)).toEqual([101, 76, 51, 26, 1]);
  });
});

describe("lastPageFromLink", () => {
  it("reads rel=last", () => {
    const link =
      '<https://api.github.com/repositories/1/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/commits?per_page=1&page=4821>; rel="last"';
    expect(lastPageFromLink(link)).toBe(4821);
  });
  it("handles missing or malformed headers", () => {
    expect(lastPageFromLink(null)).toBeNull();
    expect(lastPageFromLink('<not a url>; rel="last"')).toBeNull();
    expect(lastPageFromLink('<https://x/y?page=2>; rel="next"')).toBeNull();
  });
});

describe("filterTree", () => {
  it("applies the same exclusions as a full analysis", () => {
    expect(
      filterTree([
        { path: "src/a.ts", type: "blob", size: 10 },
        { path: "node_modules/x.js", type: "blob", size: 10 },
        { path: "pnpm-lock.yaml", type: "blob", size: 10 },
        { path: "link", type: "blob", mode: "120000", size: 4 },
        { path: "src", type: "tree" },
      ]),
    ).toEqual([["src/a.ts", 10]]);
  });
});

function timelapse(frames: [string, number][][]): Timelapse {
  const paths = [...new Set(frames.flat().map(([p]) => p))].sort();
  return {
    schemaVersion: 1,
    source: "live",
    owner: "acme",
    name: "demo",
    ref: "main",
    headSha: "f".repeat(40),
    totalCommits: frames.length,
    paths,
    frames: frames.map((files, i) => ({
      sha: String(i).repeat(40).slice(0, 40).replace(/./g, String(i % 10)),
      date: null,
      index: frames.length - i,
      files: files.map(([p, s]) => [paths.indexOf(p), s] as [number, number]),
      truncated: false,
    })),
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("buildTimelapseCity", () => {
  const t = timelapse([
    [["src/a.ts", 100]],
    [
      ["src/a.ts", 4000],
      ["src/b.ts", 500],
    ],
    [
      ["src/a.ts", 2500],
      ["lib/c.py", 9000],
    ],
  ]);

  it("lays out the union once, sized for each file's largest version", () => {
    const city = buildTimelapseCity(t, 5000);
    expect(city.files.map((f) => [f.path, f.size])).toEqual([
      ["lib/c.py", 9000],
      ["src/a.ts", 4000],
      ["src/b.ts", 500],
    ]);
    expect(city.layout.buildings).toHaveLength(3);
  });

  it("gives each frame exact size-based values and hides absent files", () => {
    const city = buildTimelapseCity(t, 5000);
    const a = city.layout.buildings.find((b) => b.path === "src/a.ts")!;
    const b = city.layout.buildings.find((x) => x.path === "src/b.ts")!;
    const c = city.layout.buildings.find((x) => x.path === "lib/c.py")!;
    const [f0, f1, f2] = city.frames;
    expect(f0!.visible[a.id]).toBe(1);
    expect(f0!.h[a.id]).toBeCloseTo(heightForBytes(100));
    expect(f0!.w[a.id]).toBeCloseTo(footprintFor(100));
    expect(f0!.visible[b.id]).toBe(0);
    expect(f1!.visible[b.id]).toBe(1);
    expect(f2!.visible[b.id]).toBe(0);
    expect(f2!.visible[c.id]).toBe(1);
    expect(city.frames.map((f) => f.fileCount)).toEqual([1, 2, 2]);
  });

  it("never grows a building beyond its slot", () => {
    const city = buildTimelapseCity(t, 5000);
    for (const f of city.frames) for (const b of city.layout.buildings) if (f.visible[b.id]) expect(f.w[b.id]).toBeLessThanOrEqual(b.w + 1e-6);
  });

  it("is deterministic", () => {
    const a = buildTimelapseCity(t, 5000);
    const b = buildTimelapseCity(t, 5000);
    expect(JSON.stringify(a.layout.buildings)).toBe(JSON.stringify(b.layout.buildings));
    expect([...a.frames[1]!.h]).toEqual([...b.frames[1]!.h]);
  });

  it("aggregates per frame within the budget", () => {
    const many = timelapse([
      Array.from({ length: 40 }, (_, i) => [`src/f${i}.ts`, 100 + i] as [string, number]),
      Array.from({ length: 80 }, (_, i) => [`src/f${i}.ts`, 100 + i] as [string, number]),
    ]);
    const city = buildTimelapseCity(many, 20);
    expect(city.layout.buildings.length).toBeLessThanOrEqual(20);
    const agg = city.layout.buildings.find((b) => b.kind === "aggregate")!;
    expect(agg).toBeDefined();
    for (const f of city.frames) if (f.visible[agg.id]) expect(f.w[agg.id]).toBeLessThanOrEqual(agg.w + 1e-6);
  });
});
