"use client";

import { useEffect, useRef, useState } from "react";
import { parseTimelapse } from "@/lib/snapshot-schema";
import type { PublicError, RepoSnapshot, Timelapse, TimelapseEvent } from "@/lib/types";

export type TimelapseState =
  | { status: "off" }
  | { status: "loading"; label: string; done: number; total: number }
  | { status: "ready"; data: Timelapse }
  | { status: "error"; error: PublicError };

/**
 * Loads the time-lapse for the city on screen when enabled: the bundled one for
 * the sample, otherwise /api/timelapse pinned to the snapshot's exact head so the
 * last frame is the city being viewed. Results are kept for re-toggling.
 */
export function useTimelapse(snapshot: RepoSnapshot, enabled: boolean): TimelapseState {
  const [state, setState] = useState<TimelapseState>({ status: "off" });
  const loaded = useRef<Timelapse | null>(null);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "off" });
      return;
    }
    if (loaded.current) {
      setState({ status: "ready", data: loaded.current });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading", label: "Finding commits", done: 0, total: 1 });
    (async () => {
      try {
        if (snapshot.source === "sample") {
          const raw = (await import("@/data/sample-timelapse.json")).default;
          loaded.current = parseTimelapse(raw);
          setState({ status: "ready", data: loaded.current });
          return;
        }
        const q = new URLSearchParams({ owner: snapshot.repo.owner, repo: snapshot.repo.name, sha: snapshot.revision.sha });
        const res = await fetch(`/api/timelapse?${q}`, { signal: ctrl.signal });
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
            const event = JSON.parse(line) as TimelapseEvent;
            if (event.type === "progress") setState({ status: "loading", label: event.label, done: event.done, total: event.total });
            else if (event.type === "error") setState({ status: "error", error: event.error });
            else {
              loaded.current = parseTimelapse(event.timelapse);
              setState({ status: "ready", data: loaded.current });
            }
          }
        }
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", error: { code: "network", message: err instanceof SyntaxError ? "Received an unreadable response." : "Could not load the time-lapse." } });
      }
    })();
    return () => ctrl.abort();
  }, [enabled, snapshot]);

  return state;
}
