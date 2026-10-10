import { BlobNotFoundError, get, head, list, put } from "@vercel/blob";
import { parseSnapshot, parseTimelapse } from "./snapshot-schema";
import type { RepoSnapshot, Timelapse } from "./types";

/**
 * Durable snapshot storage, shared by every server instance.
 *
 *   snapshots/{owner}/{repo}/{sha}.json   immutable — backs permanent links
 *   latest/{owner}/{repo}.json            pointer to the newest analysis — backs the shared cache
 *
 * Owner and repo are lower-cased (GitHub names are case-insensitive). Snapshots
 * only contain metadata about public repositories, never file contents.
 * Production uses a private Vercel Blob store (enabled by BLOB_READ_WRITE_TOKEN);
 * development and tests fall back to an in-memory store.
 */
export interface SnapshotStore {
  readonly kind: "blob" | "memory";
  getSnapshot(owner: string, repo: string, sha: string): Promise<RepoSnapshot | null>;
  getLatest(owner: string, repo: string): Promise<{ snapshot: RepoSnapshot; savedAt: number } | null>;
  /** Stores the snapshot (write-once). `latest: false` keeps the default-branch pointer unchanged (other refs). */
  save(snapshot: RepoSnapshot, opts?: SaveOptions): Promise<void>;
  /** Time-lapse sampled up to `headSha`; write-once like snapshots. */
  getTimelapse(owner: string, repo: string, headSha: string): Promise<Timelapse | null>;
  saveTimelapse(timelapse: Timelapse): Promise<void>;
  /** Most recently built default-branch cities, newest first (for the gallery). */
  listRecent(limit: number): Promise<CitySummary[]>;
}

/** What the gallery shows for one city; stored inside the latest pointer. */
export interface CitySummary {
  owner: string;
  name: string;
  description: string | null;
  sha: string;
  ref: string;
  files: number;
  /** Sum of known line counts. */
  lines: number;
  stars: number | null;
  /** Most common languages by file count. */
  languages: { id: string; files: number }[];
  analyzedAt: string;
  savedAt: number;
}

export function summarize(s: RepoSnapshot, savedAt: number): CitySummary {
  const counts = new Map<string, number>();
  for (const f of s.files) counts.set(f.language, (counts.get(f.language) ?? 0) + 1);
  return {
    owner: s.repo.owner,
    name: s.repo.name,
    description: s.repo.description,
    sha: s.revision.sha,
    ref: s.revision.ref,
    files: s.files.length,
    lines: s.files.reduce((t, f) => t + (f.lines ?? 0), 0),
    stars: s.repo.stars,
    languages: [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 5)
      .map(([id, files]) => ({ id, files })),
    analyzedAt: s.analyzedAt,
    savedAt,
  };
}

/** Repositories hidden from the gallery (comma-separated owner/repo, case-insensitive), e.g. on request. */
function galleryExcluded(owner: string, name: string): boolean {
  const list = (process.env.GALLERY_EXCLUDE ?? "").toLowerCase().split(",").map((x) => x.trim());
  return list.includes(`${owner}/${name}`.toLowerCase()) || list.includes(owner.toLowerCase());
}

export interface SaveOptions {
  latest?: boolean;
}

interface LatestPointer {
  sha: string;
  savedAt: number;
  /** Absent in pointers written before the gallery existed. */
  summary?: CitySummary;
}

export const SHA_RE = /^[0-9a-f]{40}$/;

/** Permanent URL of a stored snapshot. */
export function permalinkFor(s: RepoSnapshot): string {
  return `/city/${encodeURIComponent(s.repo.owner)}/${encodeURIComponent(s.repo.name)}/${s.revision.sha}`;
}
const MAX_SNAPSHOT_BYTES = 60_000_000;

const snapshotPath = (owner: string, repo: string, sha: string) => `snapshots/${owner.toLowerCase()}/${repo.toLowerCase()}/${sha}.json`;
const timelapsePath = (owner: string, repo: string, sha: string) => `timelapse/${owner.toLowerCase()}/${repo.toLowerCase()}/${sha}.json`;
const latestPath = (owner: string, repo: string) => `latest/${owner.toLowerCase()}/${repo.toLowerCase()}.json`;

export class MemorySnapshotStore implements SnapshotStore {
  readonly kind = "memory" as const;
  private readonly data = new Map<string, string>();

  async getSnapshot(owner: string, repo: string, sha: string) {
    if (!SHA_RE.test(sha)) return null;
    const raw = this.data.get(snapshotPath(owner, repo, sha));
    return raw ? parseSnapshot(JSON.parse(raw)) : null;
  }

  async getLatest(owner: string, repo: string) {
    const raw = this.data.get(latestPath(owner, repo));
    if (!raw) return null;
    const pointer = JSON.parse(raw) as LatestPointer;
    const snapshot = await this.getSnapshot(owner, repo, pointer.sha);
    return snapshot ? { snapshot, savedAt: pointer.savedAt } : null;
  }

  async save(snapshot: RepoSnapshot, opts: SaveOptions = {}, now = Date.now()) {
    const { owner, name } = snapshot.repo;
    const path = snapshotPath(owner, name, snapshot.revision.sha);
    if (!this.data.has(path)) this.data.set(path, JSON.stringify(snapshot));
    if (opts.latest === false) return;
    this.data.set(latestPath(owner, name), JSON.stringify({ sha: snapshot.revision.sha, savedAt: now, summary: summarize(snapshot, now) } satisfies LatestPointer));
  }

  async listRecent(limit: number) {
    const out: CitySummary[] = [];
    for (const [key, raw] of this.data) {
      if (!key.startsWith("latest/")) continue;
      const p = JSON.parse(raw) as LatestPointer;
      if (p.summary && !galleryExcluded(p.summary.owner, p.summary.name)) out.push(p.summary);
    }
    return out.sort((a, b) => b.savedAt - a.savedAt || (a.owner + a.name < b.owner + b.name ? -1 : 1)).slice(0, limit);
  }

  async getTimelapse(owner: string, repo: string, headSha: string) {
    if (!SHA_RE.test(headSha)) return null;
    const raw = this.data.get(timelapsePath(owner, repo, headSha));
    return raw ? parseTimelapse(JSON.parse(raw)) : null;
  }

  async saveTimelapse(t: Timelapse) {
    const path = timelapsePath(t.owner, t.name, t.headSha);
    if (!this.data.has(path)) this.data.set(path, JSON.stringify(t));
  }
}

export class BlobSnapshotStore implements SnapshotStore {
  readonly kind = "blob" as const;
  constructor(private readonly token?: string) {}

  private async read(pathname: string): Promise<unknown | null> {
    const res = await get(pathname, { access: "private", useCache: false, token: this.token });
    if (!res || res.statusCode !== 200) return null;
    if (res.blob.size > MAX_SNAPSHOT_BYTES) throw new Error("Stored snapshot exceeds size limit");
    return JSON.parse(await new Response(res.stream).text());
  }

  private async putOnce(pathname: string, body: string) {
    if (await this.exists(pathname)) return;
    try {
      await put(pathname, body, {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        token: this.token,
        allowOverwrite: false,
        multipart: body.length > 4_000_000,
      });
    } catch (err) {
      // Another instance may have stored the same object concurrently.
      if (!(await this.exists(pathname))) throw err;
    }
  }

  async getTimelapse(owner: string, repo: string, headSha: string) {
    if (!SHA_RE.test(headSha)) return null;
    const data = await this.read(timelapsePath(owner, repo, headSha));
    return data ? parseTimelapse(data) : null;
  }

  async saveTimelapse(t: Timelapse) {
    await this.putOnce(timelapsePath(t.owner, t.name, t.headSha), JSON.stringify(t));
  }

  private async exists(pathname: string): Promise<boolean> {
    try {
      await head(pathname, { token: this.token });
      return true;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return false;
      throw err;
    }
  }

  async getSnapshot(owner: string, repo: string, sha: string) {
    if (!SHA_RE.test(sha)) return null;
    const data = await this.read(snapshotPath(owner, repo, sha));
    return data ? parseSnapshot(data) : null;
  }

  async listRecent(limit: number) {
    const blobs: { pathname: string; uploadedAt: Date }[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const res = await list({ prefix: "latest/", limit: 1000, cursor, token: this.token });
      blobs.push(...res.blobs);
      if (!res.hasMore || !res.cursor) break;
      cursor = res.cursor;
    }
    blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime() || (a.pathname < b.pathname ? -1 : 1));
    const out: CitySummary[] = [];
    // Read a few extra pointers in case some are hidden or unreadable.
    const candidates = blobs.slice(0, limit + 12);
    const read = await Promise.all(
      candidates.map(async (b) => {
        try {
          const p = (await this.read(b.pathname)) as LatestPointer | null;
          if (!p || typeof p.sha !== "string") return null;
          if (p.summary) return p.summary;
          // Pointer from before summaries existed: derive one from the snapshot itself.
          const [, owner, file] = b.pathname.split("/");
          const snap = owner && file ? await this.getSnapshot(owner, file.replace(/\.json$/, ""), p.sha) : null;
          return snap ? summarize(snap, p.savedAt) : null;
        } catch {
          return null;
        }
      }),
    );
    for (const s of read) if (s && !galleryExcluded(s.owner, s.name) && out.length < limit) out.push(s);
    return out;
  }

  async getLatest(owner: string, repo: string) {
    const pointer = (await this.read(latestPath(owner, repo))) as LatestPointer | null;
    if (!pointer || typeof pointer.sha !== "string" || typeof pointer.savedAt !== "number") return null;
    const snapshot = await this.getSnapshot(owner, repo, pointer.sha);
    return snapshot ? { snapshot, savedAt: pointer.savedAt } : null;
  }

  async save(snapshot: RepoSnapshot, opts: SaveOptions = {}) {
    const { owner, name } = snapshot.repo;
    const body = JSON.stringify(snapshot);
    const common = { access: "private" as const, addRandomSuffix: false, contentType: "application/json", token: this.token };
    // Write-once: a permanent link must keep showing the analysis it was shared with.
    await this.putOnce(snapshotPath(owner, name, snapshot.revision.sha), body);
    if (opts.latest === false) return;
    const savedAt = Date.now();
    await put(latestPath(owner, name), JSON.stringify({ sha: snapshot.revision.sha, savedAt, summary: summarize(snapshot, savedAt) } satisfies LatestPointer), {
      ...common,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
  }
}

let store: SnapshotStore | null = null;

/** Upper bound on pointers scanned for the gallery (10 pages of 1,000). */
const MAX_LIST_PAGES = 10;

// Next.js can load this module once per bundle (pages, route handlers); the memory
// fallback must still be one store per process, so it lives on globalThis.
const shared = globalThis as { __gitcityMemoryStore?: MemorySnapshotStore };

export function getSnapshotStore(): SnapshotStore {
  store ??= process.env.BLOB_READ_WRITE_TOKEN ? new BlobSnapshotStore() : (shared.__gitcityMemoryStore ??= new MemorySnapshotStore());
  return store;
}

/** Test hook. */
export function setSnapshotStore(next: SnapshotStore | null) {
  store = next;
}
