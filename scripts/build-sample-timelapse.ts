/**
 * Builds the bundled sample time-lapse from a local clone with full history.
 *
 *   git -C /tmp/tauri fetch --unshallow
 *   pnpm sample:timelapse /tmp/tauri tauri-apps tauri <head-sha>
 *
 * Uses the same sampling (`sampleIndices`) and tree filtering (`filterTree`) as
 * the live /api/timelapse route; only acquisition differs (`git rev-list` order
 * stands in for GitHub's newest-first commit list). Metadata only.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { filterTree, MAX_FRAMES, sampleIndices } from "../src/lib/repo/history";
import { parseTimelapse } from "../src/lib/snapshot-schema";
import type { Timelapse, TimelapseFrame } from "../src/lib/types";

const [dir, owner, name, head] = process.argv.slice(2);
if (!dir || !owner || !name || !head) {
  console.error("usage: pnpm sample:timelapse <clone-dir> <owner> <repo> <head-sha>");
  process.exit(1);
}
const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { maxBuffer: 1024 * 1024 * 1024 }).toString();

const commits = git("rev-list", head).trim().split("\n"); // newest first, like GitHub's commit list
const pages = sampleIndices(commits.length, MAX_FRAMES);
const ref = git("symbolic-ref", "--short", "HEAD").trim();

const raw = pages.map((page) => {
  const sha = commits[page - 1]!;
  const entries = git("ls-tree", "-r", "-l", "-z", sha)
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split("\t") as [string, string];
      const [mode, type, , size] = meta.split(/\s+/);
      return { path, mode, type: type!, size: size === "-" ? 0 : Number(size) };
    });
  return { sha, page, date: new Date(git("log", "-1", "--format=%cI", sha).trim()).toISOString(), files: filterTree(entries) };
});

const paths = [...new Set(raw.flatMap((f) => f.files.map(([p]) => p)))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const index = new Map(paths.map((p, i) => [p, i]));
const frames: TimelapseFrame[] = raw.map((f) => ({
  sha: f.sha,
  date: f.date,
  index: f.page,
  files: f.files.map(([p, s]) => [index.get(p)!, s] as [number, number]).sort((a, b) => a[0] - b[0]),
  truncated: false,
}));

const timelapse: Timelapse = {
  schemaVersion: 1,
  source: "sample",
  owner,
  name,
  ref,
  headSha: head,
  totalCommits: commits.length,
  paths,
  frames,
  createdAt: new Date().toISOString(),
};
parseTimelapse(timelapse);
const out = resolve(import.meta.dirname, "../src/data/sample-timelapse.json");
writeFileSync(out, JSON.stringify(timelapse) + "\n");
console.log(`wrote ${out}: ${frames.length} frames over ${commits.length} commits, ${paths.length} distinct paths, files per frame: ${frames.map((f) => f.files.length).join(" ")}`);
