import { json } from "./mock-github";

/** A fake repository history: commits[0] is the newest (head). */
export interface HistoryCommit {
  sha: string;
  date: string;
  files: Record<string, number>;
}

export function mockHistory(commits: HistoryCommit[], opts: { private?: boolean; truncatedShas?: string[] } = {}) {
  const calls: string[] = [];
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.pathname + url.search);
    const p = url.pathname;
    if (p === "/repos/acme/demo") return json({ name: "demo", owner: { login: "acme" }, default_branch: "main", html_url: "https://github.com/acme/demo", private: opts.private ?? false });
    const one = /^\/repos\/acme\/demo\/commits\/([^/]+)$/.exec(p);
    if (one) {
      const c = one[1] === "main" ? commits[0] : bySha.get(one[1]!);
      return c ? json({ sha: c.sha, commit: { committer: { date: c.date } } }) : json({ message: "No commit found" }, 422);
    }
    if (p === "/repos/acme/demo/commits") {
      const head = url.searchParams.get("sha");
      const start = commits.findIndex((c) => c.sha === head);
      const list = commits.slice(start);
      const perPage = Number(url.searchParams.get("per_page") ?? 30);
      const page = Number(url.searchParams.get("page") ?? 1);
      const items = list.slice((page - 1) * perPage, page * perPage);
      const last = Math.ceil(list.length / perPage);
      const headers: Record<string, string> =
        last > 1 ? { link: `<https://api.github.com/repositories/1/commits?sha=${head}&per_page=${perPage}&page=${last}>; rel="last"` } : {};
      return json(items.map((c) => ({ sha: c.sha, commit: { committer: { date: c.date } } })), 200, headers);
    }
    const tree = /^\/repos\/acme\/demo\/git\/trees\/([0-9a-f]{40})$/.exec(p);
    if (tree) {
      const c = bySha.get(tree[1]!);
      if (!c) return json({ message: "Not Found" }, 404);
      return json({
        sha: c.sha,
        truncated: (opts.truncatedShas ?? []).includes(c.sha),
        tree: Object.entries(c.files).map(([path, size]) => ({ path, mode: "100644", type: "blob", size })),
      });
    }
    return json({ message: "Not Found" }, 404);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/** n commits, newest first; the repository gains one file per commit and the newest commit has the most. */
export function growingHistory(n: number): HistoryCommit[] {
  const commits: HistoryCommit[] = [];
  for (let step = n - 1; step >= 0; step--) {
    const files: Record<string, number> = { "README.md": 100 + step, "node_modules/x/index.js": 50 };
    for (let i = 0; i <= step; i++) files[`src/f${String(i).padStart(3, "0")}.ts`] = 200 + (step - i) * 10;
    commits.push({ sha: (step + 1).toString(16).padStart(40, "a"), date: new Date(Date.UTC(2024, 0, 1 + step)).toISOString(), files });
  }
  return commits;
}
