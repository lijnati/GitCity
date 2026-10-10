import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmbedCity } from "@/components/embed/embed-city";
import { isValidRepoId } from "@/lib/repo/parse-repo-input";
import { getSnapshotStore, SHA_RE } from "@/lib/snapshot-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false } };

/**
 * Interactive iframe embed. Shows a stored snapshot (pinned by `?sha=`, else the
 * latest one); it never starts an analysis, so embedding pages can't burn the
 * GitHub rate limit.
 */
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { owner, repo } = await params;
  const sha = (await searchParams).sha;
  if (!isValidRepoId(owner, repo) || (sha !== undefined && (typeof sha !== "string" || !SHA_RE.test(sha)))) notFound();
  const store = getSnapshotStore();
  const snapshot = sha ? await store.getSnapshot(owner, repo, sha).catch(() => null) : ((await store.getLatest(owner, repo).catch(() => null))?.snapshot ?? null);
  const href = `/city/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${sha ? `/${sha}` : ""}`;
  if (!snapshot) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-paper p-6 text-center">
        <p className="font-mono text-[14px] text-ink">
          {owner}/{repo}
        </p>
        <p className="text-[13px] text-muted">This city hasn’t been built on GitCity yet.</p>
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-ink underline decoration-accent decoration-2 underline-offset-4">
          Build it on GitCity ↗
        </a>
      </div>
    );
  }
  return <EmbedCity snapshot={snapshot} href={href} />;
}
