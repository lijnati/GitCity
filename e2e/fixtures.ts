import sample from "../src/data/sample-city.json" with { type: "json" };

/** A small "live" snapshot derived from the bundled sample, for mocked /api/analyze responses. */
export function liveSnapshot(owner = "acme", name = "demo") {
  const files = sample.files.filter((f) => f.path.startsWith("crates/tauri-utils/") || f.path.startsWith("packages/api/"));
  return {
    ...sample,
    source: "live",
    repo: { ...sample.repo, owner, name, htmlUrl: `https://github.com/${owner}/${name}`, stars: 1234 },
    files,
    lines: { counted: files.filter((f) => f.lines !== null).length, total: files.length, stoppedEarly: false },
    notes: [],
  };
}

export function ndjson(events: unknown[]) {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}
