import { CACHE, cityCard, type CardTheme } from "@/lib/og/city-card";
import { isValidRepoId } from "@/lib/repo/parse-repo-input";
import { getSnapshotStore, SHA_RE } from "@/lib/snapshot-store";

export const runtime = "nodejs";

/**
 * README card: a PNG of the city for `<img>` embeds (GitHub proxies and caches
 * it). `?theme=dark` matches dark READMEs; `?sha=` pins a saved snapshot.
 * Reads stored snapshots only: an image request never starts a GitHub analysis.
 */
export async function GET(req: Request, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  const url = new URL(req.url);
  const theme: CardTheme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
  const sha = url.searchParams.get("sha");
  if (!isValidRepoId(owner, repo) || (sha !== null && !SHA_RE.test(sha))) {
    return new Response("Invalid repository", { status: 400 });
  }
  const store = getSnapshotStore();
  if (sha) {
    const snapshot = await store.getSnapshot(owner, repo, sha).catch(() => null);
    return cityCard({ owner, repo, snapshot, kind: "saved", theme }, snapshot ? CACHE.immutable : CACHE.missing);
  }
  const latest = await store.getLatest(owner, repo).catch(() => null);
  return cityCard({ owner, repo, snapshot: latest?.snapshot ?? null, kind: "live", theme }, latest ? CACHE.latest : CACHE.missing);
}
