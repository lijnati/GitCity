import { gzipSync } from "node:zlib";
import { buildTar } from "@/lib/repo/tar";

export const SHA = "a".repeat(40);

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

export interface MockRepo {
  files: { path: string; content: string; mode?: string }[];
  truncated?: boolean;
  private?: boolean;
  commits?: { sha: string; date: string; files: string[] }[];
  /** Stream the tarball in chunks of this size (default: one chunk). */
  tarChunk?: number;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** Router-style fetch mock. Overrides win over the default repo handlers. */
export function mockGitHub(repo: MockRepo, overrides: Record<string, Handler> = {}) {
  const calls: string[] = [];
  const enc = new TextEncoder();
  const commits = repo.commits ?? [];
  const tarball = gzipSync(buildTar(repo.files.map((f) => ({ path: `acme-demo-${SHA.slice(0, 7)}/${f.path}`, content: f.content }))));

  const routes: Record<string, Handler> = {
    "/repos/acme/demo": () =>
      json({ name: "demo", owner: { login: "acme" }, description: "Demo", default_branch: "main", html_url: "https://github.com/acme/demo", private: repo.private ?? false, stargazers_count: 3 }),
    "/repos/acme/demo/commits/main": () => json({ sha: SHA, commit: { committer: { date: "2026-01-02T00:00:00Z" } } }),
    [`/repos/acme/demo/git/trees/${SHA}`]: () =>
      json({
        sha: SHA,
        truncated: repo.truncated ?? false,
        tree: repo.files.map((f) => ({ path: f.path, mode: f.mode ?? "100644", type: "blob", size: enc.encode(f.content).length })),
      }),
    [`/repos/acme/demo/tarball/${SHA}`]: () => new Response(null, { status: 302, headers: { location: `https://codeload.github.com/acme/demo/legacy.tar.gz/${SHA}` } }),
    [`/codeload/acme/demo/legacy.tar.gz/${SHA}`]: () => new Response(chunkedStream(tarball, repo.tarChunk ?? tarball.length), { status: 200 }),
    "/repos/acme/demo/commits": () => json(commits.map((c) => ({ sha: c.sha, commit: { committer: { date: c.date } } }))),
  };
  for (const c of commits) {
    routes[`/repos/acme/demo/commits/${c.sha}`] = () =>
      json({ sha: c.sha, commit: { committer: { date: c.date } }, files: c.files.map((filename) => ({ filename, status: "modified" })) });
  }
  Object.assign(routes, overrides);

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const key = url.hostname === "codeload.github.com" ? `/codeload${url.pathname}` : url.pathname;
    calls.push(`${url.hostname}${url.pathname}${url.search}`);
    if (url.hostname !== "api.github.com" && url.hostname !== "codeload.github.com") throw new Error(`unexpected host ${url.hostname}`);
    const handler = routes[key];
    if (!handler) return json({ message: "Not Found" }, 404);
    return handler(url, init);
  }) as typeof fetch;

  return { fetchImpl, calls };
}

function chunkedStream(buf: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= buf.length) return controller.close();
      controller.enqueue(buf.slice(offset, offset + size));
      offset += size;
    },
  });
}
