/**
 * Builds the bundled sample city from a local clone of a real public repository.
 *
 *   git clone --depth 31 https://github.com/honojs/hono.git /tmp/hono
 *   pnpm sample /tmp/hono honojs hono "Web framework built on Web Standards"
 *
 * It reuses the exact exclusion, language, line-count and complexity functions of
 * the live pipeline; only acquisition differs (git plumbing instead of the REST API).
 * Commit activity uses `git log -n 30 --name-only` on the default branch (merge
 * commits list no files, matching a path-based window). Stars are left null because
 * they are not part of a git clone. Only metadata is stored — never file contents.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_EXCLUSIONS, exclusionReason, hasGeneratedMarker } from "../src/lib/repo/exclusions";
import { detectLanguage, languageInfo } from "../src/lib/repo/languages";
import { countLines, estimateComplexity, isBinary } from "../src/lib/repo/metrics";
import { parseSnapshot } from "../src/lib/snapshot-schema";
import type { RepoFile, RepoSnapshot } from "../src/lib/types";

const [dir, owner, name, description = null] = process.argv.slice(2);
if (!dir || !owner || !name) {
  console.error("usage: pnpm sample <clone-dir> <owner> <repo> [description]");
  process.exit(1);
}
const WINDOW = 30;
const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { maxBuffer: 512 * 1024 * 1024 });

const sha = git("rev-parse", "HEAD").toString().trim();
const branch = git("symbolic-ref", "--short", "HEAD").toString().trim();
const committedAt = git("log", "-1", "--format=%cI").toString().trim();

const excluded = { count: 0, bytes: 0, byReason: {} as Record<string, number> };
const exclude = (reason: string, size: number) => {
  excluded.count++;
  excluded.bytes += size;
  excluded.byReason[reason] = (excluded.byReason[reason] ?? 0) + 1;
};

const files = new Map<string, RepoFile>();
let entries = 0;
for (const line of git("ls-tree", "-r", "-l", "-z", "HEAD").toString().split("\0")) {
  if (!line) continue;
  const [meta, path] = line.split("\t") as [string, string];
  const [mode, type, , sizeStr] = meta.split(/\s+/);
  if (type !== "blob") continue;
  entries++;
  const size = Number(sizeStr);
  if (mode === "120000") {
    exclude("symlink", size);
    continue;
  }
  const reason = exclusionReason(path, DEFAULT_EXCLUSIONS);
  if (reason) {
    exclude(reason, size);
    continue;
  }
  const body = git("show", `HEAD:${path}`);
  const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  const file: RepoFile = { path, size, language: detectLanguage(path), lines: null, complexity: null, commits: 0, lastModified: null };
  if (size > 1_000_000) file.linesNote = "too-large";
  else if (isBinary(bytes)) file.linesNote = "binary";
  else {
    const text = new TextDecoder().decode(bytes);
    if (hasGeneratedMarker(text.slice(0, 2048))) {
      exclude("generated", size);
      continue;
    }
    file.lines = countLines(bytes);
    file.complexity = estimateComplexity(text, languageInfo(file.language).family);
  }
  files.set(path, file);
}

// Commit window, newest first.
const log = git("log", `-n${WINDOW}`, "--name-only", "--format=%x00%H%x09%cI").toString();
const commits = log.split("\0").filter(Boolean).map((chunk) => {
  const [header, ...rest] = chunk.split("\n");
  const [, date] = header!.split("\t");
  return { date: date!, files: rest.filter(Boolean) };
});
for (const c of commits) {
  for (const p of c.files) {
    const f = files.get(p);
    if (!f) continue;
    f.commits = (f.commits ?? 0) + 1;
    if (!f.lastModified) f.lastModified = new Date(c.date).toISOString();
  }
}

const list = [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
const snapshot: RepoSnapshot = {
  schemaVersion: 1,
  source: "sample",
  repo: { owner, name, description, defaultBranch: branch, htmlUrl: `https://github.com/${owner}/${name}`, stars: null },
  revision: { sha, ref: branch, committedAt: new Date(committedAt).toISOString() },
  analyzedAt: new Date().toISOString(),
  files: list,
  excluded,
  tree: { truncated: false, entries },
  lines: { counted: list.filter((f) => f.lines !== null).length, total: list.length, stoppedEarly: false },
  activity: {
    commits: commits.length,
    newest: commits[0] ? new Date(commits[0].date).toISOString() : null,
    oldest: commits.at(-1) ? new Date(commits.at(-1)!.date).toISOString() : null,
    partial: false,
  },
  notes: [],
};

parseSnapshot(snapshot);
const out = resolve(import.meta.dirname, "../src/data/sample-city.json");
writeFileSync(out, JSON.stringify(snapshot) + "\n");
console.log(`wrote ${out}: ${list.length} files, ${excluded.count} excluded, ${commits.length} commits in window, sha ${sha}`);
