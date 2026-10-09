"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSnapshot } from "@/lib/snapshot-schema";
import type { AnalysisEvent, PublicError, RepoSnapshot } from "@/lib/types";
import { Logo } from "@/components/logo";
import { ErrorState } from "./error-state";
import { Explorer } from "./explorer";
import { LoadingStages, type StageId } from "./loading-stages";

type State =
  | { phase: "loading"; stage: StageId; detail?: string; skipped: Set<StageId> }
  | { phase: "error"; error: PublicError }
  | { phase: "ready"; snapshot: RepoSnapshot; sceneReady: boolean };

const SERVER_STAGE: Record<string, StageId> = { connect: "connect", structure: "structure", contents: "contents", history: "history", complete: "plan" };

export function CityLoader({ owner, repo }: { owner: string; repo: string }) {
  const [state, setState] = useState<State>({ phase: "loading", stage: "connect", skipped: new Set() });
  const [attempt, setAttempt] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    let finished = false;
    (async () => {
      try {
        const res = await fetch(`/api/analyze?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`, { signal: ctrl.signal });
        if (!res.body) throw new Error("no body");
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const event = JSON.parse(line) as AnalysisEvent;
            if (event.type === "stage") {
              const stage = SERVER_STAGE[event.stage] ?? "connect";
              setState((s) => {
                if (s.phase !== "loading") return s;
                const skipped = new Set(s.skipped);
                if (stage === "plan" && s.stage !== "history" && event.detail !== "cached") skipped.add("history");
                return { phase: "loading", stage, detail: event.detail, skipped };
              });
            } else if (event.type === "error") {
              finished = true;
              setState({ phase: "error", error: event.error });
            } else if (event.type === "result") {
              finished = true;
              const snapshot = parseSnapshot(event.snapshot);
              if (snapshot.files.length === 0) {
                setState({ phase: "error", error: { code: "empty", message: "No source files remain after excluding dependencies, build output, lockfiles and binaries." } });
                return;
              }
              setState((s) => (s.phase === "loading" ? { ...s, stage: "plan", detail: `${snapshot.files.length} files` } : s));
              // Let the "planning" stage paint before the synchronous layout runs.
              await new Promise((r) => setTimeout(r, 30));
              setState({ phase: "ready", snapshot, sceneReady: false });
            }
          }
        }
        if (!finished) setState({ phase: "error", error: { code: "network", message: "The connection closed before the city was ready." } });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setState({ phase: "error", error: { code: "network", message: err instanceof SyntaxError ? "Received an unreadable response." : "Could not reach the GitCity server." } });
      }
    })();
    return () => ctrl.abort();
  }, [owner, repo, attempt]);

  const onSceneReady = useCallback(() => setState((s) => (s.phase === "ready" ? { ...s, sceneReady: true } : s)), []);
  const label = `${owner}/${repo}`;

  if (state.phase === "ready") {
    return (
      <>
        <Explorer snapshot={state.snapshot} onSceneReady={onSceneReady} />
        {!state.sceneReady && <BuildOverlay label={label} />}
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex h-14 items-center border-b border-line px-4">
        <Logo />
      </header>
      <div className="flex flex-1 items-center px-5 py-12">
        {state.phase === "loading" ? (
          <LoadingStages current={state.stage} detail={state.detail} repo={label} skipped={state.skipped} />
        ) : (
          <ErrorState error={state.error} repo={label} onRetry={() => { setState({ phase: "loading", stage: "connect", skipped: new Set() }); setAttempt((a) => a + 1); }} />
        )}
      </div>
    </div>
  );
}

/** Covers the explorer until the first WebGL frame is drawn (real signal from the canvas). */
function BuildOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center bg-paper px-5" aria-hidden="false">
      <LoadingStages current="build" repo={label} skipped={new Set()} />
    </div>
  );
}
