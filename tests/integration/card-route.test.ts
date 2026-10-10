import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySnapshotStore } from "@/lib/snapshot-store";
import { makeSnapshot } from "../fixtures/snapshot";

const analyze = vi.fn();
vi.mock("@/lib/repo/analyze", () => ({ analyzeRepository: (...args: unknown[]) => analyze(...args) }));

let store: MemorySnapshotStore;

async function route() {
  vi.resetModules();
  const storeModule = await import("@/lib/snapshot-store");
  storeModule.setSnapshotStore(store);
  return (await import("@/app/api/card/[owner]/[repo]/route")).GET;
}

const get = async (path: string, owner = "acme", repo = "demo") => {
  const GET = await route();
  return GET(new Request(`http://localhost/api/card/${owner}/${repo}${path}`), { params: Promise.resolve({ owner, repo }) });
};

beforeEach(() => {
  store = new MemorySnapshotStore();
  analyze.mockReset();
});

describe("/api/card (README image)", () => {
  it("renders a PNG from the stored city, cached, without analyzing", async () => {
    await store.save(makeSnapshot());
    const res = await get("?theme=dark");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("s-maxage=3600");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("pins a saved snapshot immutably, and falls back to a 'not built yet' card", async () => {
    await store.save(makeSnapshot());
    expect((await get(`?sha=${"a".repeat(40)}`)).headers.get("cache-control")).toContain("immutable");
    const missing = await get("", "nobody", "nothing");
    expect(missing.status).toBe(200);
    expect(missing.headers.get("cache-control")).toContain("s-maxage=300");
    expect(analyze).not.toHaveBeenCalled();
  });

  it("rejects invalid input", async () => {
    expect((await get("?sha=HEAD")).status).toBe(400);
    expect((await get("", "-bad", "x")).status).toBe(400);
  });
});
