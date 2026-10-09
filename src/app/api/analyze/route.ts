import { ZodError } from "zod";
import { GitHubClient, GitHubError, toNetworkError } from "@/lib/github/client";
import { analyzeRepository } from "@/lib/repo/analyze";
import { isValidRepoId } from "@/lib/repo/parse-repo-input";
import { LruCache } from "@/lib/cache";
import { RateLimiter } from "@/lib/rate-limit";
import { getSnapshotStore, permalinkFor, SHA_RE } from "@/lib/snapshot-store";
import type { AnalysisEvent, PublicError, RepoSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How long a stored analysis of the default branch is reused before re-analyzing. */
const FRESH_MS = 60 * 60 * 1000;

interface Cached {
  snapshot: RepoSnapshot;
  permalink: string | null;
}

// Per-instance hot cache in front of the shared store.
const cache = new LruCache<Cached>(40, 10 * 60 * 1000);
// Per-instance backstop; the shared limit is a Vercel Firewall rule on this path.
const limiter = new RateLimiter(12, 10 * 60 * 1000);
const inflight = new Map<string, Promise<Cached>>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner") ?? "";
  const repo = url.searchParams.get("repo") ?? "";
  const sha = url.searchParams.get("sha");
  if (!isValidRepoId(owner, repo) || (sha !== null && !SHA_RE.test(sha))) {
    return Response.json({ type: "error", error: { code: "invalid_input", message: "Invalid repository." } }, { status: 400 });
  }
  const key = `${owner}/${repo}`.toLowerCase();
  const store = getSnapshotStore();

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
        // Pinned snapshot: served only from storage, never re-analyzed.
        if (sha) {
          send({ type: "stage", stage: "connect", detail: "loading saved snapshot" });
          const snapshot = await store.getSnapshot(owner, repo, sha);
          if (!snapshot) {
            send({
              type: "error",
              error: { code: "snapshot_not_found", message: `No saved snapshot of ${owner}/${repo} at ${sha.slice(0, 7)} exists. Open the repository to build its current city.` },
            });
            return;
          }
          send({ type: "stage", stage: "complete", detail: "saved snapshot" });
          send({ type: "result", snapshot, permalink: permalinkFor(snapshot) });
          return;
        }

        const hot = cache.get(key);
        if (hot) {
          send({ type: "stage", stage: "complete", detail: "cached" });
          send({ type: "result", ...hot });
          return;
        }

        let pending = inflight.get(key);
        if (pending) {
          send({ type: "stage", stage: "connect", detail: "joining an analysis already in progress" });
        } else {
          pending = (async (): Promise<Cached> => {
            // Shared cache across instances: reuse a recent stored analysis.
            const latest = await store.getLatest(owner, repo).catch((err) => {
              console.error("[analyze] snapshot store read failed", err);
              return null;
            });
            if (latest && Date.now() - latest.savedAt < FRESH_MS) {
              send({ type: "stage", stage: "complete", detail: "cached" });
              return { snapshot: latest.snapshot, permalink: permalinkFor(latest.snapshot) };
            }
            const verdict = limiter.check(clientIp(req));
            if (!verdict.ok) {
              throw new GitHubError("too_many_requests", "Too many cities requested from your network. Please wait a few minutes.", 429, verdict.retryAt);
            }
            const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });
            const snapshot = await analyzeRepository(owner, repo, { client, onStage: (stage, detail) => send({ type: "stage", stage, detail }) });
            let permalink: string | null = null;
            try {
              await store.save(snapshot);
              permalink = permalinkFor(snapshot);
            } catch (err) {
              // The city still works; it just can't be linked to permanently.
              console.error("[analyze] snapshot store write failed", err);
            }
            return { snapshot, permalink };
          })();
          inflight.set(key, pending);
          pending.then((c) => cache.set(key, c), () => {}).finally(() => inflight.delete(key));
        }
        send({ type: "result", ...(await pending) });
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
