import type { ErrorCode } from "@/lib/types";

/**
 * Narrow GitHub REST client. Every request goes to a hard-coded host, with
 * path segments built from validated identifiers via `encodeURIComponent`.
 * Responses are size-capped and time-boxed. The token never leaves the server.
 */

export const API_HOST = "https://api.github.com";
const ALLOWED_REDIRECT_HOSTS = new Set(["codeload.github.com"]);

export class GitHubError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status?: number,
    public readonly retryAt?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface ClientOptions {
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** External abort (e.g. client disconnected). */
  signal?: AbortSignal;
}

export function repoPath(owner: string, repo: string, ...segments: string[]): string {
  return ["", "repos", owner, repo, ...segments].map((s) => (s === "" ? s : encodeURIComponent(s))).join("/");
}

export class GitHubClient {
  readonly token?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly signal?: AbortSignal;
  requests = 0;

  constructor(opts: ClientOptions = {}) {
    this.token = opts.token || undefined;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.signal = opts.signal;
  }

  private headers(accept = "application/vnd.github+json"): HeadersInit {
    const h: Record<string, string> = {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "GitCity",
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private timeoutSignal(ms: number): AbortSignal {
    const t = AbortSignal.timeout(ms);
    return this.signal ? AbortSignal.any([t, this.signal]) : t;
  }

  /** GET a JSON resource under api.github.com. `path` must come from `repoPath`. */
  async getJson<T = unknown>(path: string, opts: { maxBytes?: number; timeoutMs?: number; query?: Record<string, string> } = {}): Promise<T> {
    return (await this.getJsonWithHeaders<T>(path, opts)).data;
  }

  /** Like `getJson`, but also returns response headers (e.g. `Link` for pagination). */
  async getJsonWithHeaders<T = unknown>(
    path: string,
    opts: { maxBytes?: number; timeoutMs?: number; query?: Record<string, string> } = {},
  ): Promise<{ data: T; headers: Headers }> {
    if (!path.startsWith("/repos/")) throw new Error("Refusing to request a non-repository path");
    const url = new URL(API_HOST + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const res = await this.send(url, { timeoutMs: opts.timeoutMs });
    const text = await readTextLimited(res, opts.maxBytes ?? 5_000_000);
    try {
      return { data: JSON.parse(text) as T, headers: res.headers };
    } catch {
      throw new GitHubError("upstream", "GitHub returned an unreadable response.", res.status);
    }
  }

  /**
   * Open the tarball stream for an exact commit. The API answers with a redirect
   * to codeload.github.com, which is the only redirect target we follow.
   */
  async openTarball(owner: string, repo: string, sha: string, timeoutMs: number): Promise<{ body: ReadableStream<Uint8Array>; signal: AbortSignal }> {
    const signal = this.timeoutSignal(timeoutMs);
    const first = await this.raw(new URL(API_HOST + repoPath(owner, repo, "tarball", sha)), signal, "manual");
    let res = first;
    if (first.status >= 300 && first.status < 400) {
      const location = first.headers.get("location");
      if (!location) throw new GitHubError("upstream", "GitHub did not provide a download location.", first.status);
      const target = new URL(location);
      if (target.protocol !== "https:" || !ALLOWED_REDIRECT_HOSTS.has(target.hostname)) {
        throw new GitHubError("upstream", "Unexpected download redirect from GitHub.", first.status);
      }
      // Do not forward credentials to the download host.
      res = await this.raw(target, signal, "error", false);
    }
    if (!res.ok || !res.body) throw this.errorFor(res);
    return { body: res.body, signal };
  }

  private async send(url: URL, opts: { timeoutMs?: number }): Promise<Response> {
    const signal = this.timeoutSignal(opts.timeoutMs ?? this.timeoutMs);
    const res = await this.raw(url, signal, "follow");
    if (!res.ok) throw this.errorFor(res);
    return res;
  }

  private async raw(url: URL, signal: AbortSignal, redirect: RequestRedirect, auth = true): Promise<Response> {
    this.requests++;
    try {
      return await this.fetchImpl(url, {
        headers: auth ? this.headers() : { "User-Agent": "GitCity" },
        signal,
        redirect,
        cache: "no-store",
      });
    } catch (err) {
      throw toNetworkError(err);
    }
  }

  errorFor(res: Response): GitHubError {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const retryAfter = Number(res.headers.get("retry-after"));
    if (res.status === 429 || (res.status === 403 && (remaining === "0" || retryAfter > 0))) {
      const retryAt = retryAfter > 0 ? Date.now() + retryAfter * 1000 : reset > 0 ? reset * 1000 : undefined;
      return new GitHubError(
        "rate_limited",
        this.token
          ? "GitHub’s API rate limit for this server has been reached."
          : "GitHub’s anonymous API rate limit has been reached. The server can be configured with a GITHUB_TOKEN for a higher limit.",
        res.status,
        retryAt,
      );
    }
    if (res.status === 404 || res.status === 401) {
      return new GitHubError("not_found", "Repository not found. It may not exist, or it may be private.", res.status);
    }
    if (res.status === 403) return new GitHubError("not_found", "GitHub denied access to this repository. It may be private or restricted.", 403);
    if (res.status === 409) return new GitHubError("empty", "This repository is empty — there is nothing to build yet.", 409);
    if (res.status === 451) return new GitHubError("unavailable_for_legal_reasons", "This repository is unavailable for legal reasons.", 451);
    if (res.status === 422) return new GitHubError("too_large", "GitHub could not produce this data; the repository may be too large.", 422);
    return new GitHubError("upstream", `GitHub responded with an unexpected error (${res.status}). Try again shortly.`, res.status);
  }
}

export function toNetworkError(err: unknown): GitHubError {
  if (err instanceof GitHubError) return err;
  const name = (err as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    return new GitHubError("timeout", "GitHub took too long to respond. Try again in a moment.");
  }
  return new GitHubError("network", "Could not reach GitHub. Check the connection and try again.");
}

export async function readTextLimited(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) throw new GitHubError("too_large", "GitHub’s response was larger than GitCity can safely process.");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new GitHubError("too_large", "GitHub’s response was larger than GitCity can safely process.");
      }
      parts.push(value);
    }
  } catch (err) {
    throw toNetworkError(err);
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  return new TextDecoder().decode(buf);
}

/** Page number of the `rel="last"` link in a GitHub `Link` header, or null. */
export function lastPageFromLink(link: string | null): number | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="last"/.exec(part);
    if (!m) continue;
    try {
      const page = Number(new URL(m[1]!).searchParams.get("page"));
      return Number.isInteger(page) && page > 0 ? page : null;
    } catch {
      return null;
    }
  }
  return null;
}
