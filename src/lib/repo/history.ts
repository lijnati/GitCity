import { GitHubClient, GitHubError, lastPageFromLink, repoPath } from "@/lib/github/client";
import { CommitListResponse, CommitResponse, RepoResponse, TreeResponse, commitDate } from "@/lib/github/schemas";
import type { Timelapse, TimelapseFrame } from "@/lib/types";
import { DEFAULT_EXCLUSIONS, exclusionReason } from "./exclusions";

/**
 * Time-lapse acquisition: sample commits evenly across the default branch's
 * history and read each one's file tree (exact sizes, no contents).
 *
 * Cost: 2 calls to resolve the repo and head, 1 to count commits, then
 * 1 commit lookup + 1 tree per frame (≈ 2·frames + 3 API requests).
 */
export const MAX_FRAMES = 16;
export const MAX_UNION_PATHS = 60_000;

/**
 * Pages (1 = newest) to sample from a newest-first commit list of `total`
 * commits: evenly spaced from the oldest to the newest, oldest first, always
 * ending with the head. Deterministic.
 */
export function sampleIndices(total: number, frames: number = MAX_FRAMES): number[] {
  if (total <= 0) return [];
  const n = Math.min(Math.max(1, frames), total);
  if (n === 1) return [1];
  const pages = new Set<number>();
  for (let i = 0; i < n; i++) pages.add(Math.round(total - (i * (total - 1)) / (n - 1)));
  return [...pages].sort((a, b) => b - a);
}

export interface FrameTree {
  files: [string, number][];
  truncated: boolean;
}

/** Included files of one commit's tree, filtered by the same rules as a full analysis. */
export function filterTree(tree: { path: string; type: string; mode?: string; size?: number }[]): [string, number][] {
  const out: [string, number][] = [];
  for (const e of tree) {
    if (e.type !== "blob" || e.mode === "120000") continue;
    if (exclusionReason(e.path, DEFAULT_EXCLUSIONS)) continue;
    out.push([e.path, e.size ?? 0]);
  }
  return out;
}

export interface TimelapseOptions {
  client: GitHubClient;
  /** Pin the head to this commit (must be on the default branch's history). Defaults to the branch head. */
  sha?: string;
  frames?: number;
  onProgress?: (done: number, total: number, label: string) => void;
  now?: () => Date;
}

export async function buildTimelapseRecord(owner: string, name: string, opts: TimelapseOptions): Promise<Timelapse> {
  const { client } = opts;
  const progress = opts.onProgress ?? (() => {});
  const repo = RepoResponse.parse(await client.getJson(repoPath(owner, name)));
  if (repo.private) throw new GitHubError("not_found", "Repository not found. It may not exist, or it may be private.", 404);
  const o = repo.owner.login;
  const r = repo.name;

  const head = CommitResponse.parse(await client.getJson(repoPath(o, r, "commits", opts.sha ?? repo.default_branch)));
  progress(0, 1, "Finding commits");
  const first = await client.getJsonWithHeaders(repoPath(o, r, "commits"), { query: { sha: head.sha, per_page: "1" } });
  const firstPage = CommitListResponse.parse(first.data);
  const total = lastPageFromLink(first.headers.get("link")) ?? firstPage.length;
  if (total === 0) throw new GitHubError("empty", "This repository is empty — there is nothing to build yet.", 409);

  const pages = sampleIndices(total, opts.frames ?? MAX_FRAMES);
  const frames: TimelapseFrame[] = [];
  const raw: FrameTree[] = [];
  let done = 0;
  const steps = pages.length;
  for (const page of pages) {
    const commit =
      page === 1
        ? head
        : CommitListResponse.parse(await client.getJson(repoPath(o, r, "commits"), { query: { sha: head.sha, per_page: "1", page: String(page) } }))[0];
    if (!commit) throw new GitHubError("upstream", "GitHub returned an incomplete commit list.");
    const tree = TreeResponse.parse(
      await client.getJson(repoPath(o, r, "git", "trees", commit.sha), { query: { recursive: "1" }, maxBytes: 40_000_000, timeoutMs: 25_000 }),
    );
    raw.push({ files: filterTree(tree.tree), truncated: tree.truncated });
    frames.push({ sha: commit.sha, date: commitDate(commit), index: page, files: [], truncated: tree.truncated });
    done++;
    progress(done, steps, `Reading frame ${done} of ${steps}`);
  }

  // Union of paths, sorted byte-wise; frames reference it by index.
  const pathSet = new Set<string>();
  for (const f of raw) for (const [p] of f.files) pathSet.add(p);
  if (pathSet.size > MAX_UNION_PATHS) {
    throw new GitHubError("too_large", `This repository's history has ${pathSet.size.toLocaleString("en-US")} distinct source files, above the time-lapse limit.`);
  }
  const paths = [...pathSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const index = new Map(paths.map((p, i) => [p, i]));
  raw.forEach((f, i) => {
    frames[i]!.files = f.files.map(([p, size]) => [index.get(p)!, size] as [number, number]).sort((a, b) => a[0] - b[0]);
  });

  return {
    schemaVersion: 1,
    source: "live",
    owner: o,
    name: r,
    ref: repo.default_branch,
    headSha: head.sha,
    totalCommits: total,
    paths,
    frames,
    createdAt: (opts.now ?? (() => new Date()))().toISOString(),
  };
}
