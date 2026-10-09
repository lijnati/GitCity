import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityLoader } from "@/components/explorer/city-loader";
import { isValidRepoId } from "@/lib/repo/parse-repo-input";

interface Params {
  owner: string;
  repo: string;
  sha: string;
}

const SHA_RE = /^[0-9a-f]{40}$/;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner, repo, sha } = await params;
  if (!isValidRepoId(owner, repo) || !SHA_RE.test(sha)) return { title: "Not found" };
  const name = `${owner}/${repo}`;
  return {
    title: `${name} @ ${sha.slice(0, 7)}`,
    description: `A saved 3D city of ${name} at commit ${sha.slice(0, 7)}: files are buildings, directories are neighborhoods.`,
    openGraph: { title: `${name} @ ${sha.slice(0, 7)} as a city — GitCity`, description: `Explore a saved snapshot of ${name} in 3D.` },
  };
}

/** Permanent link: always renders the stored snapshot of this exact commit. */
export default async function PinnedCityPage({ params }: { params: Promise<Params> }) {
  const { owner, repo, sha } = await params;
  if (!isValidRepoId(owner, repo) || !SHA_RE.test(sha)) notFound();
  return <CityLoader key={`${owner}/${repo}@${sha}`} owner={owner} repo={repo} sha={sha} />;
}
