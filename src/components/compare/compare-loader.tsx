"use client";

import { ArrowLeftRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PublicError, RepoSnapshot } from "@/lib/types";
import { isValidRef } from "@/lib/repo/parse-repo-input";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/explorer/error-state";
import { AnalysisFailed, fetchAnalysis } from "./fetch-analysis";
import { CompareView } from "./compare-view";

type State =
  | { phase: "idle" }
  | { phase: "loading"; label: string }
  | { phase: "error"; error: PublicError }
  | { phase: "ready"; base: RepoSnapshot; head: RepoSnapshot; sceneReady: boolean };

/** `base`/`head` are branches, tags or commit SHAs; an empty head means the default branch. */
export function CompareLoader({ owner, repo, base, head }: { owner: string; repo: string; base: string | null; head: string | null }) {
  const [state, setState] = useState<State>(base ? { phase: "loading", label: "Starting" } : { phase: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!base) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        // Sequential: the second request often reuses work (and the rate limit) better.
        setState({ phase: "loading", label: `Building the base city (${base})` });
        const b = await fetchAnalysis({ owner, repo, ref: base }, ctrl.signal, (_, detail) =>
          setState({ phase: "loading", label: `Base (${base}): ${detail ?? "working"}` }),
        );
        setState({ phase: "loading", label: `Building the head city (${head ?? "default branch"})` });
        const h = await fetchAnalysis({ owner, repo, ...(head ? { ref: head } : {}) }, ctrl.signal, (_, detail) =>
          setState({ phase: "loading", label: `Head (${head ?? "default branch"}): ${detail ?? "working"}` }),
        );
        setState({ phase: "ready", base: b.snapshot, head: h.snapshot, sceneReady: false });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setState({ phase: "error", error: err instanceof AnalysisFailed ? err.error : { code: "network", message: "Could not reach the GitCity server." } });
      }
    })();
    return () => ctrl.abort();
  }, [owner, repo, base, head, attempt]);

  const onSceneReady = useCallback(() => setState((s) => (s.phase === "ready" ? { ...s, sceneReady: true } : s)), []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <CompareHeader owner={owner} repo={repo} base={base} head={head} />
      {state.phase === "ready" ? (
        <>
          <CompareView base={state.base} head={state.head} onSceneReady={onSceneReady} />
          {!state.sceneReady && <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[57px] z-[60] grid place-items-center bg-paper text-[14px] text-muted">Drawing both cities…</div>}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-5 py-12">
          {state.phase === "idle" && (
            <div className="max-w-md text-[15px] leading-relaxed text-ink-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Compare two cities</h1>
              <p className="mt-2">
                Enter a branch, tag or commit SHA of <span className="font-mono">{owner}/{repo}</span> as the base. The head defaults to the default branch.
              </p>
            </div>
          )}
          {state.phase === "loading" && (
            <p className="font-mono text-[13px] text-muted" role="status" aria-live="polite">
              {state.label}…
            </p>
          )}
          {state.phase === "error" && <ErrorState error={state.error} repo={`${owner}/${repo}`} onRetry={() => setAttempt((a) => a + 1)} />}
        </div>
      )}
    </div>
  );
}

function CompareHeader({ owner, repo, base, head }: { owner: string; repo: string; base: string | null; head: string | null }) {
  const router = useRouter();
  const [b, setB] = useState(base ?? "");
  const [h, setH] = useState(head ?? "");
  const [error, setError] = useState<string | null>(null);
  const go = (nb: string, nh: string) => {
    if (!isValidRef(nb) || (nh && !isValidRef(nh))) {
      setError("Use a branch, tag or commit SHA.");
      return;
    }
    setError(null);
    const q = new URLSearchParams({ base: nb, ...(nh ? { head: nh } : {}) });
    router.push(`/compare/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?${q}`);
  };
  const input = "h-8 w-full min-w-0 rounded-sm border border-line-strong bg-surface px-2 font-mono text-[12.5px] text-ink placeholder:font-sans placeholder:text-faint focus-visible:border-ink";
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-paper px-3 py-2.5 md:h-14 md:flex-nowrap md:px-4 md:py-0">
      <Logo />
      <a href={`/city/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`} className="min-w-0 truncate font-mono text-[13px] text-ink hover:underline">
        <span className="text-muted">{owner}/</span>
        <span className="font-semibold">{repo}</span>
      </a>
      <form
        className="order-last flex w-full items-center gap-1.5 md:order-none md:ml-auto md:w-auto"
        onSubmit={(e) => {
          e.preventDefault();
          go(b.trim(), h.trim());
        }}
        aria-label="Choose commits to compare"
      >
        <label className="sr-only" htmlFor="cmp-base">
          Base
        </label>
        <input id="cmp-base" className={`${input} md:w-40`} placeholder="base: tag, branch, SHA" value={b} onChange={(e) => setB(e.target.value)} spellCheck={false} autoComplete="off" />
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center text-muted hover:text-ink"
          aria-label="Swap base and head"
          title="Swap"
          onClick={() => {
            setB(h);
            setH(b);
          }}
        >
          <ArrowLeftRight className="size-4" />
        </button>
        <label className="sr-only" htmlFor="cmp-head">
          Head
        </label>
        <input id="cmp-head" className={`${input} md:w-40`} placeholder="head: default branch" value={h} onChange={(e) => setH(e.target.value)} spellCheck={false} autoComplete="off" />
        <Button type="submit" variant="primary" size="sm" disabled={!b.trim()}>
          Compare
        </Button>
      </form>
      {error && (
        <p className="order-last w-full text-[12px] text-accent-ink" role="alert">
          {error}
        </p>
      )}
      <ThemeToggle className="ml-auto md:ml-0" />
    </header>
  );
}
