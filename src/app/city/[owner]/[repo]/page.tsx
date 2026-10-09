import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityLoader } from "@/components/explorer/city-loader";
import { isValidRepoId } from "@/lib/repo/parse-repo-input";

interface Params {
  owner: string;
  repo: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner, repo } = await params;
  if (!isValidRepoId(owner, repo)) return { title: "Not found" };
  const name = `${owner}/${repo}`;
  return {
    title: name,
    description: `Explore ${name} as an interactive 3D city: files are buildings, directories are neighborhoods.`,
    openGraph: { title: `${name} as a city — GitCity`, description: `Files are buildings, directories are neighborhoods. Explore ${name} in 3D.` },
    twitter: { card: "summary_large_image", title: `${name} as a city — GitCity`, description: `Files are buildings, directories are neighborhoods. Explore ${name} in 3D.` },
  };
}

export default async function CityPage({ params }: { params: Promise<Params> }) {
  const { owner, repo } = await params;
  if (!isValidRepoId(owner, repo)) notFound();
  return <CityLoader key={`${owner}/${repo}`} owner={owner} repo={repo} />;
}
