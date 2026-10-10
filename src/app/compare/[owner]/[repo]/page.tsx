import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompareLoader } from "@/components/compare/compare-loader";
import { isValidRef, isValidRepoId } from "@/lib/repo/parse-repo-input";

interface Params {
  owner: string;
  repo: string;
}

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (typeof v === "string" && isValidRef(v) ? v : null);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner, repo } = await params;
  if (!isValidRepoId(owner, repo)) return { title: "Not found" };
  return {
    title: `Compare ${owner}/${repo}`,
    description: `Two commits of ${owner}/${repo} as one 3D city: added, removed and changed files highlighted.`,
    robots: { index: false },
  };
}

export default async function ComparePage({ params, searchParams }: { params: Promise<Params>; searchParams: Search }) {
  const { owner, repo } = await params;
  if (!isValidRepoId(owner, repo)) notFound();
  const sp = await searchParams;
  const base = one(sp.base);
  const head = one(sp.head);
  return <CompareLoader key={`${owner}/${repo}@${base}...${head}`} owner={owner} repo={repo} base={base} head={head} />;
}
