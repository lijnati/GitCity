import sample from "../src/data/sample-city.json" with { type: "json" };

/** A small "live" snapshot derived from the bundled sample, for mocked /api/analyze responses. */
export function liveSnapshot(owner = "acme", name = "demo", opts: { sha?: string; drop?: string[] } = {}) {
  const keep = (p: string) => (p.startsWith("crates/tauri-utils/") || p.startsWith("packages/api/")) && !opts.drop?.includes(p);
  const remap = new Map<number, number>();
  const files = sample.files.filter((f, i) => keep(f.path) && (remap.set(i, remap.size), true));
  // Import edges index into `files`; keep the ones between retained files.
  const edges = (sample.imports.edges as [number, number][]).filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!]);
  return {
    ...sample,
    source: "live",
    repo: { ...sample.repo, owner, name, htmlUrl: `https://github.com/${owner}/${name}`, stars: 1234 },
    revision: { ...sample.revision, sha: opts.sha ?? sample.revision.sha },
    imports: { ...sample.imports, edges },
    files,
    lines: { counted: files.filter((f) => f.lines !== null).length, total: files.length, stoppedEarly: false },
    notes: [],
  };
}

export function ndjson(events: unknown[]) {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}
