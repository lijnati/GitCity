import { describe, expect, it } from "vitest";
import { colorModes, colorView, RAMP, UNAVAILABLE_COLOR } from "@/lib/city/color-views";
import { compareSnapshots, compareStatus } from "@/lib/city/compare";
import { buildingEdges } from "@/lib/city/dependencies";
import { generateCity } from "@/lib/city/layout";
import { isValidRef } from "@/lib/repo/parse-repo-input";
import { parseSnapshot } from "@/lib/snapshot-schema";
import { MemorySnapshotStore, summarize } from "@/lib/snapshot-store";
import type { RepoFile, RepoSnapshot } from "@/lib/types";
import { file } from "../fixtures/files";
import { makeSnapshot } from "../fixtures/snapshot";

const withFiles = (files: RepoFile[], over: Partial<RepoSnapshot> = {}): RepoSnapshot => ({
  ...makeSnapshot(),
  files,
  lines: { counted: files.length, total: files.length, stoppedEarly: false },
  ...over,
});

describe("colour views", () => {
  const files = [
    { ...file("a.ts"), commits: 0, lastModified: null, complexity: 3 },
    { ...file("b.ts"), commits: 1, lastModified: "2026-01-01T00:00:00Z", complexity: 12 },
    { ...file("c.ts"), commits: 9, lastModified: "2026-01-04T00:00:00Z", complexity: null },
  ];
  const snap = withFiles(files, { activity: { commits: 30, newest: "2026-01-04T00:00:00Z", oldest: "2026-01-01T00:00:00Z", partial: false } });
  const layout = generateCity(snap.files, { heightMetric: "lines", budget: 5000 });
  const colorOf = (view: ReturnType<typeof colorView>, path: string) => view!.colors[layout.fileToBuilding[snap.files.findIndex((f) => f.path === path)]!];

  it("buckets commits in the window", () => {
    const v = colorView("activity", layout, snap);
    expect(colorOf(v, "a.ts")).toBe(RAMP[0]);
    expect(colorOf(v, "b.ts")).toBe(RAMP[1]);
    expect(colorOf(v, "c.ts")).toBe(RAMP[4]);
    expect(v!.unavailable).toBeNull();
  });

  it("marks unmeasured values as unavailable instead of guessing", () => {
    const v = colorView("complexity", layout, snap);
    expect(colorOf(v, "c.ts")).toBe(UNAVAILABLE_COLOR);
    expect(v!.unavailable).not.toBeNull();
  });

  it("places untouched files before the window and recent changes last", () => {
    const v = colorView("age", layout, snap);
    expect(colorOf(v, "a.ts")).toBe(RAMP[0]);
    expect(colorOf(v, "b.ts")).toBe(RAMP[1]);
    expect(colorOf(v, "c.ts")).toBe(RAMP[4]);
  });

  it("disables views without data", () => {
    const modes = colorModes(withFiles([file("x.md")]));
    expect(modes.find((m) => m.mode === "activity")!.available).toBe(false);
    expect(modes.find((m) => m.mode === "complexity")!.available).toBe(false);
    expect(colorView("language", layout, snap)).toBeNull();
  });
});

describe("compare", () => {
  const blob = (c: string) => c.repeat(40);
  const base = withFiles(
    [
      { ...file("keep.ts", 100, 10), blob: blob("a") },
      { ...file("edit.ts", 100, 10), blob: blob("b") },
      { ...file("gone.ts", 300, 30), blob: blob("c") },
    ],
    { revision: { sha: "1".repeat(40), ref: "v1", committedAt: null } },
  );
  const head = withFiles(
    [
      { ...file("edit.ts", 100, 14), blob: blob("d") },
      { ...file("keep.ts", 100, 10), blob: blob("a") },
      { ...file("new.ts", 500, 50), blob: blob("e") },
    ],
    { revision: { sha: "2".repeat(40), ref: "main", committedAt: null } },
  );

  it("classifies files by blob SHA and sums line changes", () => {
    const c = compareSnapshots(base, head, 5000);
    const status = Object.fromEntries(c.entries.map((e) => [e.path, e.status]));
    expect(status).toEqual({ "edit.ts": "modified", "gone.ts": "removed", "keep.ts": "unchanged", "new.ts": "added" });
    expect(c.summary).toMatchObject({ added: 1, removed: 1, modified: 1, unchanged: 1, netLines: 4 + 50 - 30, exact: true });
  });

  it("shares one plan: frames only toggle visibility and size", () => {
    const c = compareSnapshots(base, head, 5000);
    const id = (p: string) => c.layout.fileToBuilding[c.entries.findIndex((e) => e.path === p)]!;
    expect(c.base.visible[id("gone.ts")]).toBe(1);
    expect(c.head.visible[id("gone.ts")]).toBe(0);
    expect(c.base.visible[id("new.ts")]).toBe(0);
    expect(c.changes.visible[id("gone.ts")]).toBe(1);
    expect(c.head.h[id("edit.ts")]!).toBeGreaterThan(c.base.h[id("edit.ts")]!);
    expect(c.head.fileCount).toBe(3);
  });

  it("falls back to size and lines without blob SHAs, and says so", () => {
    expect(compareStatus(file("x", 10, 1), file("x", 10, 1))).toBe("unchanged");
    expect(compareStatus(file("x", 10, 1), file("x", 11, 1))).toBe("modified");
    expect(compareStatus(file("x", 10, 1), file("x", 10, 2))).toBe("modified");
    const c = compareSnapshots(withFiles([file("x.ts")]), withFiles([file("x.ts")]), 5000);
    expect(c.summary.exact).toBe(false);
  });
});

describe("dependency edges", () => {
  it("lifts file edges to buildings, merging aggregates and dropping internal links", () => {
    const files = [file("a.ts"), file("b.ts"), file("c.ts")];
    const layout = generateCity(files, { heightMetric: "lines", budget: 5000 });
    const edges = buildingEdges(layout, { edges: [[0, 1], [0, 1], [1, 2], [2, 2]], scanned: 3, resolved: 4, external: 0, unresolved: 0, truncated: false });
    expect(edges).toHaveLength(2);
  });

  it("rejects stored edges that point outside the file list", () => {
    const s = { ...makeSnapshot(), imports: { edges: [[0, 9]], scanned: 1, resolved: 1, external: 0, unresolved: 0, truncated: false } };
    expect(() => parseSnapshot(s)).toThrow();
  });
});

describe("refs", () => {
  it("accepts branches, tags and SHAs, rejects traversal and odd forms", () => {
    for (const ok of ["main", "v1.2.3", "feature/x", "a".repeat(40), "release-2026_10"]) expect(isValidRef(ok)).toBe(true);
    for (const bad of ["", "../x", "a..b", "-x", "/x", "x/", "a//b", "x.lock", "a b", "a?b", "x".repeat(201)]) expect(isValidRef(bad)).toBe(false);
  });
});

describe("gallery storage", () => {
  it("lists default-branch cities newest first, with summaries", async () => {
    const store = new MemorySnapshotStore();
    await store.save(makeSnapshot({ owner: "a", name: "one", sha: "1".repeat(40) }), {}, 1000);
    await store.save(makeSnapshot({ owner: "b", name: "two", sha: "2".repeat(40) }), {}, 2000);
    await store.save(makeSnapshot({ owner: "a", name: "one", sha: "3".repeat(40) }), { latest: false }, 3000);
    const recent = await store.listRecent(10);
    expect(recent.map((r) => `${r.owner}/${r.name}@${r.sha[0]}`)).toEqual(["b/two@2", "a/one@1"]);
    expect(recent[0]).toMatchObject({ files: 2, lines: 92 });
    // A non-default ref is stored for its permalink but doesn't move "latest".
    expect(await store.getSnapshot("a", "one", "3".repeat(40))).not.toBeNull();
    expect((await store.getLatest("a", "one"))!.snapshot.revision.sha).toBe("1".repeat(40));
  });

  it("summarizes languages by file count", () => {
    expect(summarize(makeSnapshot(), 5).languages).toEqual([
      { id: "markdown", files: 1 },
      { id: "typescript", files: 1 },
    ]);
  });
});
