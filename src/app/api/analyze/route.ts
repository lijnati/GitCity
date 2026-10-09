import { ZodError } from "zod";
import { GitHubClient, GitHubError, toNetworkError } from "@/lib/github/client";
import { analyzeRepository } from "@/lib/repo/analyze";
import { isValidRepoId } from "@/lib/repo/parse-repo-input";
import { LruCache } from "@/lib/cache";
import { RateLimiter } from "@/lib/rate-limit";
import type { AnalysisEvent, PublicError, RepoSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cache = new LruCache<RepoSnapshot>(40, 60 * 60 * 1000);
const limiter = new RateLimiter(12, 10 * 60 * 1000);
const inflight = new Map<string, Promise<RepoSnapshot>>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner") ?? "";
  const repo = url.searchParams.get("repo") ?? "";
  if (!isValidRepoId(owner, repo)) {
    return Response.json({ type: "error", error: { code: "invalid_input", message: "Invalid repository." } }, { status: 400 });
  }
  const key = `${owner}/${repo}`.toLowerCase();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AnalysisEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          // client went away
        }
      };
      try {
        const cached = cache.get(key);
        if (cached) {
          send({ type: "stage", stage: "complete", detail: "cached" });
          send({ type: "result", snapshot: cached });
          return;
        }
        let pending = inflight.get(key);
        if (!pending) {
          const ip = clientIp(req);
          const verdict = limiter.check(ip);
          if (!verdict.ok) {
            send({ type: "error", error: { code: "too_many_requests", message: "Too many cities requested from your network. Please wait a few minutes.", retryAt: verdict.retryAt } });
            return;
          }
          const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });
          pending = analyzeRepository(owner, repo, { client, onStage: (stage, detail) => send({ type: "stage", stage, detail }) });
          inflight.set(key, pending);
          pending.then((s) => cache.set(key, s), () => {}).finally(() => inflight.delete(key));
        } else {
          send({ type: "stage", stage: "connect", detail: "joining an analysis already in progress" });
        }
        const snapshot = await pending;
        send({ type: "result", snapshot });
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
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
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
