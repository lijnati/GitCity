import { BlobNotFoundError, get, head, put } from "@vercel/blob";
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
  save(snapshot: RepoSnapshot): Promise<void>;
  /** Time-lapse sampled up to `headSha`; write-once like snapshots. */
  getTimelapse(owner: string, repo: string, headSha: string): Promise<Timelapse | null>;
  saveTimelapse(timelapse: Timelapse): Promise<void>;
}

interface LatestPointer {
  sha: string;
  savedAt: number;
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

  async save(snapshot: RepoSnapshot, now = Date.now()) {
    const { owner, name } = snapshot.repo;
    const path = snapshotPath(owner, name, snapshot.revision.sha);
    if (!this.data.has(path)) this.data.set(path, JSON.stringify(snapshot));
    this.data.set(latestPath(owner, name), JSON.stringify({ sha: snapshot.revision.sha, savedAt: now } satisfies LatestPointer));
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

  async getLatest(owner: string, repo: string) {
    const pointer = (await this.read(latestPath(owner, repo))) as LatestPointer | null;
    if (!pointer || typeof pointer.sha !== "string" || typeof pointer.savedAt !== "number") return null;
    const snapshot = await this.getSnapshot(owner, repo, pointer.sha);
    return snapshot ? { snapshot, savedAt: pointer.savedAt } : null;
  }

  async save(snapshot: RepoSnapshot) {
    const { owner, name } = snapshot.repo;
    const body = JSON.stringify(snapshot);
    const common = { access: "private" as const, addRandomSuffix: false, contentType: "application/json", token: this.token };
    // Write-once: a permanent link must keep showing the analysis it was shared with.
    await this.putOnce(snapshotPath(owner, name, snapshot.revision.sha), body);
    await put(latestPath(owner, name), JSON.stringify({ sha: snapshot.revision.sha, savedAt: Date.now() } satisfies LatestPointer), {
      ...common,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
  }
}

let store: SnapshotStore | null = null;

export function getSnapshotStore(): SnapshotStore {
  store ??= process.env.BLOB_READ_WRITE_TOKEN ? new BlobSnapshotStore() : new MemorySnapshotStore();
  return store;
}

/** Test hook. */
export function setSnapshotStore(next: SnapshotStore | null) {
  store = next;
}
