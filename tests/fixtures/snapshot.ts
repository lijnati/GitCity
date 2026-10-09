import type { RepoSnapshot } from "@/lib/types";
import { file } from "./files";

export function makeSnapshot(over: { owner?: string; name?: string; sha?: string } = {}): RepoSnapshot {
  const owner = over.owner ?? "Acme";
  const name = over.name ?? "Demo";
  const files = [file("src/a.ts", 2048, 80), file("README.md", 300, 12)];
  return {
    schemaVersion: 1,
    source: "live",
    repo: { owner, name, description: null, defaultBranch: "main", htmlUrl: `https://github.com/${owner}/${name}`, stars: null },
    revision: { sha: over.sha ?? "a".repeat(40), ref: "main", committedAt: null },
    analyzedAt: "2026-01-01T00:00:00Z",
    files,
    excluded: { count: 0, bytes: 0, byReason: {} },
    tree: { truncated: false, entries: files.length },
    lines: { counted: 2, total: 2, stoppedEarly: false },
    activity: null,
    notes: [],
  };
}
