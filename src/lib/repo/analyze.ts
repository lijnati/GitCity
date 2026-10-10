import { GitHubClient, GitHubError, repoPath, toNetworkError } from "@/lib/github/client";
import { CommitDetailResponse, CommitListResponse, CommitResponse, RepoResponse, TreeResponse, commitDate } from "@/lib/github/schemas";
import type { ActivityWindow, AnalysisStage, LinesNote, RepoFile, RepoSnapshot } from "@/lib/types";
import { DEFAULT_EXCLUSIONS, type ExclusionConfig, exclusionReason, hasGeneratedMarker } from "./exclusions";
import { detectLanguage, languageInfo } from "./languages";
import { ImportCollector } from "./imports";
import { countLines, estimateComplexity, isBinary } from "./metrics";
import { readTar } from "./tar";

export interface AnalysisLimits {
  /** Included files above this fail with `too_large` (rendering also aggregates far below this). */
  maxIncludedFiles: number;
  /** Files above this size are not read for line counts. */
  maxFileBytesForLines: number;
  /** Compressed tarball bytes read before stopping. */
  tarballMaxBytes: number;
  /** Decompressed bytes read before stopping (zip-bomb guard). */
  tarballMaxInflatedBytes: number;
  /** Wall-clock budget for the content pass. */
  tarballTimeMs: number;
  maxTreeBytes: number;
  /** Most-recent commits inspected for activity. 0 disables. */
  commitWindow: number;
  commitConcurrency: number;
}

export function defaultLimits(hasToken: boolean): AnalysisLimits {
  return {
    maxIncludedFiles: 60_000,
    maxFileBytesForLines: 1_000_000,
    tarballMaxBytes: 80_000_000,
    tarballMaxInflatedBytes: 400_000_000,
    tarballTimeMs: 25_000,
    maxTreeBytes: 40_000_000,
    commitWindow: hasToken ? 30 : 5,
    commitConcurrency: 6,
  };
}

export interface AnalyzeOptions {
  client: GitHubClient;
  /** Branch, tag or commit SHA to analyze instead of the default branch. */
  ref?: string;
  exclusions?: ExclusionConfig;
  limits?: Partial<AnalysisLimits>;
  onStage?: (stage: AnalysisStage, detail?: string) => void;
  now?: () => Date;
}

const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export async function analyzeRepository(owner: string, name: string, opts: AnalyzeOptions): Promise<RepoSnapshot> {
  const { client } = opts;
  const limits = { ...defaultLimits(Boolean(client.token)), ...opts.limits };
  const exclusions = opts.exclusions ?? DEFAULT_EXCLUSIONS;
  const stage = opts.onStage ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const notes: string[] = [];

  // 1. Repository + exact revision of the default branch (or the requested ref).
  stage("connect", `${owner}/${name}`);
  const repo = RepoResponse.parse(await client.getJson(repoPath(owner, name)));
  if (repo.private) {
    // Never visualise private repositories, even if the server token could read them.
    throw new GitHubError("not_found", "Repository not found. It may not exist, or it may be private.", 404);
  }
  const ref = opts.ref ?? repo.default_branch;
  const head = CommitResponse.parse(await client.getJson(repoPath(repo.owner.login, repo.name, "commits", ref)));
  const sha = head.sha;

  // 2. Full file tree at that revision.
  stage("structure", ref);
  const tree = TreeResponse.parse(
    await client.getJson(repoPath(repo.owner.login, repo.name, "git", "trees", sha), {
      query: { recursive: "1" },
      maxBytes: limits.maxTreeBytes,
      timeoutMs: 25_000,
    }),
  );
  const blobs = tree.tree.filter((e) => e.type === "blob");
  if (tree.truncated) {
    notes.push(`GitHub truncated the file tree for this repository; only the ${blobs.length.toLocaleString("en-US")} files it returned are shown.`);
  }

  const excluded = { count: 0, bytes: 0, byReason: {} as Record<string, number> };
  const exclude = (reason: string, size: number) => {
    excluded.count++;
    excluded.bytes += size;
    excluded.byReason[reason] = (excluded.byReason[reason] ?? 0) + 1;
  };

  const files = new Map<string, RepoFile>();
  for (const entry of blobs) {
    const size = entry.size ?? 0;
    if (entry.mode === "120000") {
      exclude("symlink", size);
      continue;
    }
    const reason = exclusionReason(entry.path, exclusions);
    if (reason) {
      exclude(reason, size);
      continue;
    }
    files.set(entry.path, {
      path: entry.path,
      size,
      language: detectLanguage(entry.path),
      lines: null,
      linesNote: "not-fetched",
      complexity: null,
      commits: null,
      lastModified: null,
      ...(entry.sha && /^[0-9a-f]{40}$/.test(entry.sha) ? { blob: entry.sha } : {}),
    });
  }
  if (files.size > limits.maxIncludedFiles) {
    throw new GitHubError(
      "too_large",
      `This repository has ${files.size.toLocaleString("en-US")} source files, above GitCity’s limit of ${limits.maxIncludedFiles.toLocaleString("en-US")}.`,
    );
  }

  // 3. Contents pass: exact line counts from one streamed tarball.
  stage("contents", `${files.size} files`);
  let stoppedEarly = false;
  let contentsRead = false;
  const imports = new ImportCollector();
  if (files.size > 0) {
    try {
      stoppedEarly = await readContents(client, repo.owner.login, repo.name, sha, files, limits, imports, (path) => {
        const f = files.get(path);
        if (f) {
          files.delete(path);
          exclude("generated", f.size);
        }
      });
      contentsRead = true;
    } catch (err) {
      const e = toNetworkError(err);
      if (e.code === "rate_limited") throw e;
      notes.push("File contents could not be downloaded, so line counts are unavailable for this city.");
    }
  }
  let counted = 0;
  for (const f of files.values()) {
    if (f.lines !== null) counted++;
    else if (stoppedEarly && f.linesNote === "not-fetched") f.linesNote = "budget";
  }
  if (stoppedEarly) {
    notes.push(`Content analysis reached its size/time budget; line counts are available for ${counted.toLocaleString("en-US")} of ${files.size.toLocaleString("en-US")} files.`);
  }

  // 4. Bounded commit-activity window.
  let activity: ActivityWindow | null = null;
  if (limits.commitWindow > 0 && files.size > 0) {
    stage("history", `last ${limits.commitWindow} commits`);
    try {
      activity = await readActivity(client, repo.owner.login, repo.name, sha, files, limits);
    } catch (err) {
      const e = toNetworkError(err);
      notes.push(
        e.code === "rate_limited"
          ? "Commit activity is unavailable because GitHub’s rate limit was reached."
          : "Commit activity could not be loaded for this repository.",
      );
      for (const f of files.values()) {
        f.commits = null;
        f.lastModified = null;
      }
    }
  }

  stage("complete");
  const list = [...files.values()].sort(byPath);
  const importGraph = contentsRead ? imports.finish(list) : undefined;
  if (importGraph && stoppedEarly && importGraph.scanned > 0) {
    notes.push("Dependency arcs only include imports from files whose contents were read before the budget was reached.");
  }
  return {
    schemaVersion: 1,
    source: "live",
    repo: {
      owner: repo.owner.login,
      name: repo.name,
      description: repo.description ?? null,
      defaultBranch: repo.default_branch,
      htmlUrl: repo.html_url,
      stars: repo.stargazers_count ?? null,
    },
    revision: { sha, ref, committedAt: commitDate(head) },
    analyzedAt: now().toISOString(),
    files: list,
    excluded,
    tree: { truncated: tree.truncated, entries: blobs.length },
    lines: { counted, total: list.length, stoppedEarly },
    activity,
    ...(importGraph ? { imports: importGraph } : {}),
    notes,
  };
}

/** Returns true when the read stopped before the end of the archive. */
async function readContents(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
  files: Map<string, RepoFile>,
  limits: AnalysisLimits,
  imports: ImportCollector,
  onGenerated: (path: string) => void,
): Promise<boolean> {
  const { body } = await client.openTarball(owner, repo, sha, limits.tarballTimeMs);
  const deadline = Date.now() + limits.tarballTimeMs;
  let compressed = 0;
  let inflated = 0;
  let stopped = false;

  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      compressed += chunk.length;
      controller.enqueue(chunk);
    },
  });
  const stream = body.pipeThrough(counter).pipeThrough(new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>);
  const reader = stream.getReader();

  async function* chunks(): AsyncGenerator<Uint8Array> {
    try {
      for (;;) {
        if (compressed > limits.tarballMaxBytes || inflated > limits.tarballMaxInflatedBytes || Date.now() > deadline) {
          stopped = true;
          return;
        }
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await reader.read();
        } catch (err) {
          // A timeout mid-stream keeps everything counted so far.
          if ((err as { name?: string })?.name === "TimeoutError" || (err as { name?: string })?.name === "AbortError") {
            stopped = true;
            return;
          }
          throw err;
        }
        if (result.done) return;
        inflated += result.value.length;
        yield result.value;
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  await readTar(chunks(), {
    wants(entry) {
      const path = stripArchiveRoot(entry.path);
      const f = path ? files.get(path) : undefined;
      if (!f) return false;
      if (entry.size > limits.maxFileBytesForLines) {
        f.linesNote = "too-large";
        return false;
      }
      return true;
    },
    onFile(entry, data) {
      const path = stripArchiveRoot(entry.path)!;
      const f = files.get(path);
      if (!f) return;
      if (isBinary(data)) {
        f.linesNote = "binary";
        return;
      }
      const text = decoder.decode(data);
      if (hasGeneratedMarker(text.slice(0, 2048))) {
        onGenerated(path);
        return;
      }
      f.lines = countLines(data);
      delete f.linesNote;
      f.complexity = estimateComplexity(text, languageInfo(f.language).family);
      imports.consider(path, f.language, text);
    },
  });
  return stopped;
}

/** GitHub tarballs wrap everything in a single `owner-repo-sha/` directory. */
export function stripArchiveRoot(path: string): string | null {
  const slash = path.indexOf("/");
  if (slash === -1) return null;
  const rest = path.slice(slash + 1);
  return rest.length ? rest : null;
}

async function readActivity(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
  files: Map<string, RepoFile>,
  limits: AnalysisLimits,
): Promise<ActivityWindow> {
  const list = CommitListResponse.parse(
    await client.getJson(repoPath(owner, repo, "commits"), { query: { sha, per_page: String(limits.commitWindow) } }),
  ).slice(0, limits.commitWindow);

  const details = await mapLimit(list, limits.commitConcurrency, async (c) =>
    CommitDetailResponse.parse(await client.getJson(repoPath(owner, repo, "commits", c.sha))),
  );

  for (const f of files.values()) {
    f.commits = 0;
    f.lastModified = null;
  }
  let partial = false;
  // `list` is newest-first, so the first commit touching a path is its latest change.
  for (const d of details) {
    if (d.files.length >= 300) partial = true;
    const date = commitDate(d);
    for (const changed of d.files) {
      const f = files.get(changed.filename);
      if (!f) continue;
      f.commits = (f.commits ?? 0) + 1;
      if (!f.lastModified && date) f.lastModified = date;
    }
  }
  return {
    commits: details.length,
    newest: details.length ? commitDate(details[0]!) : null,
    oldest: details.length ? commitDate(details[details.length - 1]!) : null,
    partial,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export type { LinesNote };
