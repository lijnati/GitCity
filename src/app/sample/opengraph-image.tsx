import { CACHE, cityCard, OG_ALT, OG_SIZE } from "@/lib/og/city-card";
import { sampleSnapshot } from "@/lib/sample";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

/** Drawn from the bundled sample snapshot (labelled as such on the card). */
export default async function Image() {
  return cityCard({ owner: sampleSnapshot.repo.owner, repo: sampleSnapshot.repo.name, snapshot: sampleSnapshot, kind: "sample" }, CACHE.latest);
}
