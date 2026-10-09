import type { RepoFile } from "@/lib/types";
import { detectLanguage } from "@/lib/repo/languages";

/** Deterministic pseudo-random generator (mulberry32) for property-style tests. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function file(path: string, size = 1000, lines: number | null = 40): RepoFile {
  return { path, size, language: detectLanguage(path), lines, complexity: null, commits: null, lastModified: null };
}

export function syntheticRepo(count: number, seed = 1): RepoFile[] {
  const r = rng(seed);
  const dirs = ["", "src", "src/lib", "src/lib/util", "src/components", "src/components/ui", "test", "docs", "packages/a/src", "packages/b/src/deep/er"];
  const exts = ["ts", "tsx", "py", "go", "md", "json", "css"];
  const files: RepoFile[] = [];
  const seen = new Set<string>();
  for (let i = 0; files.length < count; i++) {
    const dir = dirs[Math.floor(r() * dirs.length)]!;
    const name = `f${i}.${exts[Math.floor(r() * exts.length)]}`;
    const path = dir ? `${dir}/${name}` : name;
    if (seen.has(path)) continue;
    seen.add(path);
    const size = Math.floor(r() ** 3 * 60_000);
    files.push(file(path, size, r() < 0.1 ? null : Math.floor(size / 35)));
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}
