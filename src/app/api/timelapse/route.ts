import { ZodError } from "zod";
import { GitHubClient, GitHubError, toNetworkError } from "@/lib/github/client";
import { buildTimelapseRecord } from "@/lib/repo/history";
import { isValidRepoId } from "@/lib/repo/parse-repo-input";
import { RateLimiter } from "@/lib/rate-limit";
import { getSnapshotStore, SHA_RE } from "@/lib/snapshot-store";
import type { PublicError, Timelapse, TimelapseEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A time-lapse costs ~2 API requests per frame, so it is limited more tightly than analyses.
const limiter = new RateLimiter(3, 10 * 60 * 1000);
const inflight = new Map<string, Promise<Timelapse>>();

/**
 * GET /api/timelapse?owner&repo&sha — sampled history ending at `sha` (required,
 * so the last frame is exactly the city on screen). Served from storage when
 * already built; otherwise built from the GitHub API, which requires a server token.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner") ?? "";
  const repo = url.searchParams.get("repo") ?? "";
  const sha = url.searchParams.get("sha") ?? "";
  if (!isValidRepoId(owner, repo) || !SHA_RE.test(sha)) {
    return Response.json({ type: "error", error: { code: "invalid_input", message: "Invalid repository or commit." } }, { status: 400 });
  }
  const key = `${owner}/${repo}@${sha}`.toLowerCase();
  const store = getSnapshotStore();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: TimelapseEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          // client went away
        }
      };
      try {
        const stored = await store.getTimelapse(owner, repo, sha).catch((err) => {
          console.error("[timelapse] store read failed", err);
          return null;
        });
        if (stored) {
          send({ type: "result", timelapse: stored });
          return;
        }
        let pending = inflight.get(key);
        if (!pending) {
          const token = process.env.GITHUB_TOKEN;
          if (!token) {
            throw new GitHubError(
              "timelapse_unavailable",
              "Time-lapse needs a GitHub token on the server (each one reads about 30 commits and trees). The server owner can add GITHUB_TOKEN to enable it.",
            );
          }
          const verdict = limiter.check(clientIp(req));
          if (!verdict.ok) throw new GitHubError("too_many_requests", "Too many time-lapses requested from your network. Please wait a few minutes.", 429, verdict.retryAt);
          pending = buildTimelapseRecord(owner, repo, {
            client: new GitHubClient({ token }),
            sha,
            onProgress: (done, total, label) => send({ type: "progress", done, total, label }),
          }).then(async (t) => {
            await store.saveTimelapse(t).catch((err) => console.error("[timelapse] store write failed", err));
            return t;
          });
          inflight.set(key, pending);
          pending.finally(() => inflight.delete(key)).catch(() => {});
        } else {
          send({ type: "progress", done: 0, total: 1, label: "Joining a time-lapse already in progress" });
        }
        send({ type: "result", timelapse: await pending });
      } catch (err) {
        send({ type: "error", error: toPublicError(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function toPublicError(err: unknown): PublicError {
  if (err instanceof ZodError) return { code: "upstream", message: "GitHub returned data in an unexpected format." };
  const e = err instanceof GitHubError ? err : toNetworkError(err);
  return { code: e.code, message: e.message, ...(e.retryAt ? { retryAt: e.retryAt } : {}) };
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim().slice(0, 64);
}
