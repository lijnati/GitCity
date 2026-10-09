import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySnapshotStore, type SnapshotStore } from "@/lib/snapshot-store";
import type { AnalysisEvent } from "@/lib/types";
import { makeSnapshot } from "../fixtures/snapshot";

const analyze = vi.fn();
vi.mock("@/lib/repo/analyze", () => ({ analyzeRepository: (...args: unknown[]) => analyze(...args) }));

/**
 * Fresh route module = a fresh serverless instance with empty in-memory caches,
 * wired to the given shared store (set on the module copy the route imports).
 */
async function newInstance(shared: SnapshotStore = store) {
  vi.resetModules();
  const storeModule = await import("@/lib/snapshot-store");
  storeModule.setSnapshotStore(shared);
  const mod = await import("@/app/api/analyze/route");
  return mod.GET;
}

async function call(GET: (req: Request) => Promise<Response>, query: string, ip = "1.1.1.1"): Promise<{ status: number; events: AnalysisEvent[] }> {
  const res = await GET(new Request(`http://localhost/api/analyze?${query}`, { headers: { "x-forwarded-for": ip } }));
  const text = await res.text();
  const events = text.trim() ? text.trim().split("\n").map((l) => JSON.parse(l)) : [];
  return { status: res.status, events };
}

const result = (events: AnalysisEvent[]) => events.find((e) => e.type === "result") as Extract<AnalysisEvent, { type: "result" }> | undefined;
const error = (events: AnalysisEvent[]) => events.find((e) => e.type === "error") as Extract<AnalysisEvent, { type: "error" }> | undefined;

let store: MemorySnapshotStore;

beforeEach(() => {
  analyze.mockReset();
  analyze.mockImplementation(async () => makeSnapshot());
  store = new MemorySnapshotStore();
});

describe("/api/analyze with the snapshot store", () => {
  it("analyzes, stores, and returns a permanent link", async () => {
    const GET = await newInstance();
    const { events } = await call(GET, "owner=acme&repo=demo");
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result(events)?.permalink).toBe(`/city/Acme/Demo/${"a".repeat(40)}`);
    expect(await store.getSnapshot("acme", "demo", "a".repeat(40))).not.toBeNull();
  });

  it("reuses a fresh stored analysis from another instance instead of calling GitHub", async () => {
    const first = await newInstance();
    await call(first, "owner=acme&repo=demo");
    const second = await newInstance();
    const { events } = await call(second, "owner=ACME&repo=demo");
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result(events)?.snapshot.revision.sha).toBe("a".repeat(40));
  });

  it("re-analyzes when the stored analysis is stale", async () => {
    await store.save(makeSnapshot(), Date.now() - 2 * 60 * 60 * 1000);
    const GET = await newInstance();
    analyze.mockImplementation(async () => makeSnapshot({ sha: "b".repeat(40) }));
    const { events } = await call(GET, "owner=acme&repo=demo");
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result(events)?.snapshot.revision.sha).toBe("b".repeat(40));
    // The old commit's permanent link still resolves.
    expect(await store.getSnapshot("acme", "demo", "a".repeat(40))).not.toBeNull();
  });

  it("serves pinned SHAs from storage only", async () => {
    await store.save(makeSnapshot());
    const GET = await newInstance();
    const hit = await call(GET, `owner=acme&repo=demo&sha=${"a".repeat(40)}`);
    expect(result(hit.events)?.permalink).toBe(`/city/Acme/Demo/${"a".repeat(40)}`);
    const miss = await call(GET, `owner=acme&repo=demo&sha=${"f".repeat(40)}`);
    expect(error(miss.events)?.error.code).toBe("snapshot_not_found");
    expect(analyze).not.toHaveBeenCalled();
  });

  it("rejects malformed SHAs", async () => {
    const GET = await newInstance();
    expect((await call(GET, "owner=acme&repo=demo&sha=HEAD")).status).toBe(400);
    expect((await call(GET, "owner=acme&repo=demo&sha=../../x")).status).toBe(400);
  });

  it("still returns the city when storage fails, without a permanent link", async () => {
    const broken: SnapshotStore = {
      kind: "memory",
      getSnapshot: async () => null,
      getLatest: async () => {
        throw new Error("read down");
      },
      save: async () => {
        throw new Error("write down");
      },
    };
    const GET = await newInstance(broken);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { events } = await call(GET, "owner=acme&repo=demo");
    spy.mockRestore();
    expect(result(events)?.snapshot.files).toHaveLength(2);
    expect(result(events)?.permalink).toBeNull();
  });

  it("rate-limits uncached analyses per IP but not cached hits", async () => {
    const GET = await newInstance();
    analyze.mockImplementation(async (_o: string, repo: string) => makeSnapshot({ name: repo }));
    for (let i = 0; i < 12; i++) expect(result((await call(GET, `owner=acme&repo=r${i}`)).events)).toBeDefined();
    expect(error((await call(GET, "owner=acme&repo=r99")).events)?.error.code).toBe("too_many_requests");
    // A repository analyzed earlier is still served.
    expect(result((await call(GET, "owner=acme&repo=r0")).events)).toBeDefined();
  });
});
