import { CACHE, cityCard, OG_ALT, OG_SIZE } from "@/lib/og/city-card";
import { isValidRepoId } from "@/lib/repo/parse-repo-input";
import { getSnapshotStore, SHA_RE } from "@/lib/snapshot-store";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

/** Preview of a saved snapshot: immutable, so it is cached forever once it exists. */
export default async function Image({ params }: { params: Promise<{ owner: string; repo: string; sha: string }> }) {
  const { owner, repo, sha } = await params;
  const valid = isValidRepoId(owner, repo) && SHA_RE.test(sha);
  const snapshot = valid ? await getSnapshotStore().getSnapshot(owner, repo, sha).catch(() => null) : null;
  return cityCard({ owner, repo, snapshot, kind: "saved" }, snapshot ? CACHE.immutable : CACHE.missing);
}
