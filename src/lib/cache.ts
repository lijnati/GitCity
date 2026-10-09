/** Tiny in-memory LRU with TTL. Per server instance; documented as such. */
export class LruCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  constructor(private readonly max: number, private readonly ttlMs: number) {}

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, now = Date.now()) {
    this.map.delete(key);
    this.map.set(key, { value, expires: now + this.ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }

  get size() {
    return this.map.size;
  }
}
