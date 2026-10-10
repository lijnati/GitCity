import { describe, expect, it, vi } from "vitest";
import { GitHubClient } from "@/lib/github/client";
import { buildTimelapseRecord } from "@/lib/repo/history";
import { MemorySnapshotStore, type SnapshotStore } from "@/lib/snapshot-store";
import { parseTimelapse } from "@/lib/snapshot-schema";
import type { TimelapseEvent } from "@/lib/types";
import { growingHistory, mockHistory } from "../fixtures/mock-history";

describe("buildTimelapseRecord", () => {
  it("samples history from oldest to head with exact, filtered trees", async () => {
    const commits = growingHistory(40);
    const { fetchImpl, calls } = mockHistory(commits);
    const progress: string[] = [];
    const t = await buildTimelapseRecord("acme", "demo", {
      client: new GitHubClient({ token: "t", fetchImpl }),
      frames: 8,
      onProgress: (_d, _t, label) => progress.push(label),
    });
    parseTimelapse(t);
    expect(t.totalCommits).toBe(40);
    expect(t.frames).toHaveLength(8);
    expect(t.frames.at(-1)!.sha).toBe(commits[0]!.sha);
    expect(t.frames[0]!.sha).toBe(commits[39]!.sha);
    expect(t.headSha).toBe(commits[0]!.sha);
    // Exclusions applied; the city grows over time.
    expect(t.paths.some((p) => p.startsWith("node_modules/"))).toBe(false);
    const counts = t.frames.map((f) => f.files.length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    // Sizes are the exact tree sizes of that commit.
    const head = t.frames.at(-1)!;
    const readme = t.paths.indexOf("README.md");
    expect(head.files.find(([i]) => i === readme)![1]).toBe(commits[0]!.files["README.md"]);
    expect(progress.at(-1)).toBe("Reading frame 8 of 8");
    // Bounded cost: repo + head + count + (frames - 1) commit lookups + frames trees.
    expect(calls.length).toBe(3 + 7 + 8);
  });

  it("pins the head to a given commit", async () => {
    const commits = growingHistory(10);
    const { fetchImpl } = mockHistory(commits);
    const t = await buildTimelapseRecord("acme", "demo", { client: new GitHubClient({ token: "t", fetchImpl }), sha: commits[3]!.sha, frames: 4 });
    expect(t.headSha).toBe(commits[3]!.sha);
    expect(t.totalCommits).toBe(7);
  });

  it("flags truncated frame trees", async () => {
    const commits = growingHistory(3);
    const { fetchImpl } = mockHistory(commits, { truncatedShas: [commits[1]!.sha] });
    const t = await buildTimelapseRecord("acme", "demo", { client: new GitHubClient({ token: "t", fetchImpl }) });
    expect(t.frames.map((f) => f.truncated)).toEqual([false, true, false]);
  });

  it("refuses private repositories", async () => {
    const { fetchImpl } = mockHistory(growingHistory(3), { private: true });
    await expect(buildTimelapseRecord("acme", "demo", { client: new GitHubClient({ token: "t", fetchImpl }) })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("/api/timelapse", () => {
  const commits = growingHistory(12);
  const head = commits[0]!.sha;

  async function instance(store: SnapshotStore, token: string | undefined) {
    vi.resetModules();
    vi.stubEnv("GITHUB_TOKEN", token ?? "");
    const storeModule = await import("@/lib/snapshot-store");
    storeModule.setSnapshotStore(store);
    return (await import("@/app/api/timelapse/route")).GET;
  }

  async function call(GET: (r: Request) => Promise<Response>, query: string) {
    const res = await GET(new Request(`http://localhost/api/timelapse?${query}`, { headers: { "x-forwarded-for": "9.9.9.9" } }));
    const text = await res.text();
    return { status: res.status, events: (text.trim() ? text.trim().split("\n").map((l) => JSON.parse(l)) : []) as TimelapseEvent[] };
  }

  it("requires a full commit SHA", async () => {
    const GET = await instance(new MemorySnapshotStore(), "t");
    expect((await call(GET, "owner=acme&repo=demo")).status).toBe(400);
    expect((await call(GET, "owner=acme&repo=demo&sha=main")).status).toBe(400);
  });

  it("explains that a server token is needed", async () => {
    const GET = await instance(new MemorySnapshotStore(), undefined);
    const { events } = await call(GET, `owner=acme&repo=demo&sha=${head}`);
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code: "timelapse_unavailable" } });
  });

  it("builds, stores, then serves from storage without GitHub", async () => {
    const store = new MemorySnapshotStore();
    const { fetchImpl, calls } = mockHistory(commits);
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const GET = await instance(store, "t");
      const first = await call(GET, `owner=acme&repo=demo&sha=${head}`);
      expect(first.events.filter((e) => e.type === "progress").length).toBeGreaterThan(1);
      const result = first.events.at(-1);
      expect(result?.type).toBe("result");
      const used = calls.length;
      // No token needed and no GitHub calls once stored.
      const GET2 = await instance(store, undefined);
      const second = await call(GET2, `owner=acme&repo=demo&sha=${head}`);
      expect(second.events).toHaveLength(1);
      expect(second.events[0]?.type).toBe("result");
      expect(calls.length).toBe(used);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
