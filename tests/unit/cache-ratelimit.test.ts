import { describe, expect, it } from "vitest";
import { LruCache } from "@/lib/cache";
import { RateLimiter } from "@/lib/rate-limit";

describe("LruCache", () => {
  it("evicts least-recently-used and expired entries", () => {
    const c = new LruCache<number>(2, 1000);
    c.set("a", 1, 0);
    c.set("b", 2, 0);
    c.get("a", 1);
    c.set("c", 3, 2);
    expect(c.get("b", 3)).toBeUndefined();
    expect(c.get("a", 3)).toBe(1);
    expect(c.get("a", 5000)).toBeUndefined();
  });
});

describe("RateLimiter", () => {
  it("limits per key per window", () => {
    const r = new RateLimiter(2, 1000);
    expect(r.check("ip", 0).ok).toBe(true);
    expect(r.check("ip", 1).ok).toBe(true);
    expect(r.check("ip", 2)).toEqual({ ok: false, retryAt: 1000 });
    expect(r.check("other", 2).ok).toBe(true);
    expect(r.check("ip", 1001).ok).toBe(true);
  });
});
