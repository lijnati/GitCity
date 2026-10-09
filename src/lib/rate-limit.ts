/** Fixed-window per-key limiter (in-memory, per instance). Basic abuse protection only. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}

  check(key: string, now = Date.now()): { ok: true } | { ok: false; retryAt: number } {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
      return { ok: true };
    }
    if (entry.count >= this.limit) return { ok: false, retryAt: entry.resetAt };
    entry.count++;
    return { ok: true };
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
