import { CACHE, cityCard, OG_ALT, OG_SIZE } from "@/lib/og/city-card";
import { isValidRepoId } from "@/lib/repo/parse-repo-input";
import { getSnapshotStore } from "@/lib/snapshot-store";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

/** Preview of the latest stored city. Never triggers a GitHub analysis (crawlers would burn the rate limit). */
export default async function Image({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  if (!isValidRepoId(owner, repo)) return cityCard({ owner: "github", repo: "repository", snapshot: null, kind: "live" }, CACHE.missing);
  const latest = await getSnapshotStore()
    .getLatest(owner, repo)
    .catch(() => null);
  return cityCard({ owner, repo, snapshot: latest?.snapshot ?? null, kind: "live" }, latest ? CACHE.latest : CACHE.missing);
}
