import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSnapshot } from "../fixtures/snapshot";

// In-memory fake of the Blob SDK surface the store uses.
const blobs = new Map<string, { body: string; opts: Record<string, unknown> }>();
const putCalls: string[] = [];
vi.mock("@vercel/blob", () => {
  class BlobNotFoundError extends Error {}
  return {
    BlobNotFoundError,
    head: vi.fn(async (path: string) => {
      if (!blobs.has(path)) throw new BlobNotFoundError("not found");
      return { pathname: path };
    }),
    get: vi.fn(async (path: string) => {
      const b = blobs.get(path);
      if (!b) return null;
      return { statusCode: 200, stream: new Response(b.body).body, headers: new Headers(), blob: { size: b.body.length } };
    }),
    put: vi.fn(async (path: string, body: string, opts: Record<string, unknown>) => {
      putCalls.push(path);
      if (blobs.has(path) && !opts.allowOverwrite) throw new Error("This blob already exists");
      blobs.set(path, { body, opts });
      return { pathname: path };
    }),
  };
});

const { BlobSnapshotStore, MemorySnapshotStore, permalinkFor } = await import("@/lib/snapshot-store");

describe.each([
  ["memory", () => new MemorySnapshotStore()],
  ["blob", () => new BlobSnapshotStore("test-token")],
])("%s snapshot store", (_name, create) => {
  beforeEach(() => {
    blobs.clear();
    putCalls.length = 0;
  });

  it("round-trips a snapshot by owner/repo/sha, case-insensitively", async () => {
    const store = create();
    const snap = makeSnapshot();
    await store.save(snap);
    expect(await store.getSnapshot("acme", "demo", snap.revision.sha)).toEqual(snap);
    expect(await store.getSnapshot("ACME", "DEMO", snap.revision.sha)).toEqual(snap);
    expect(await store.getSnapshot("acme", "demo", "b".repeat(40))).toBeNull();
  });

  it("rejects malformed SHAs without touching storage", async () => {
    const store = create();
    expect(await store.getSnapshot("acme", "demo", "../../etc")).toBeNull();
    expect(await store.getSnapshot("acme", "demo", "A".repeat(40))).toBeNull();
  });

  it("tracks the latest analysis per repository", async () => {
    const store = create();
    expect(await store.getLatest("acme", "demo")).toBeNull();
    await store.save(makeSnapshot({ sha: "a".repeat(40) }));
    await store.save(makeSnapshot({ sha: "b".repeat(40) }));
    const latest = await store.getLatest("acme", "demo");
    expect(latest?.snapshot.revision.sha).toBe("b".repeat(40));
    expect(latest?.savedAt).toBeGreaterThan(0);
    // The older commit remains available for its permanent link.
    expect(await store.getSnapshot("acme", "demo", "a".repeat(40))).not.toBeNull();
  });

  it("is write-once per commit so permanent links never change", async () => {
    const store = create();
    const first = makeSnapshot();
    await store.save(first);
    await store.save({ ...first, analyzedAt: "2030-01-01T00:00:00Z" });
    expect((await store.getSnapshot("acme", "demo", first.revision.sha))?.analyzedAt).toBe(first.analyzedAt);
  });
});

describe("BlobSnapshotStore specifics", () => {
  beforeEach(() => {
    blobs.clear();
    putCalls.length = 0;
  });

  it("writes private, deterministic, lower-cased paths", async () => {
    await new BlobSnapshotStore("t").save(makeSnapshot());
    expect(putCalls).toEqual([`snapshots/acme/demo/${"a".repeat(40)}.json`, "latest/acme/demo.json"]);
    for (const b of blobs.values()) {
      expect(b.opts.access).toBe("private");
      expect(b.opts.addRandomSuffix).toBe(false);
    }
    expect(blobs.get(`snapshots/acme/demo/${"a".repeat(40)}.json`)!.opts.allowOverwrite).toBe(false);
  });

  it("skips the snapshot upload when the commit is already stored", async () => {
    const store = new BlobSnapshotStore("t");
    await store.save(makeSnapshot());
    putCalls.length = 0;
    await store.save(makeSnapshot());
    expect(putCalls).toEqual(["latest/acme/demo.json"]);
  });

  it("validates stored data on read", async () => {
    blobs.set(`snapshots/acme/demo/${"c".repeat(40)}.json`, { body: JSON.stringify({ nope: true }), opts: {} });
    await expect(new BlobSnapshotStore("t").getSnapshot("acme", "demo", "c".repeat(40))).rejects.toThrow();
  });
});

describe("permalinkFor", () => {
  it("builds an encoded, SHA-pinned path", () => {
    expect(permalinkFor(makeSnapshot({ owner: "a-b", name: "c.d" }))).toBe(`/city/a-b/c.d/${"a".repeat(40)}`);
  });
});
