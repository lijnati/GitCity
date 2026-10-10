import { parseSnapshot } from "@/lib/snapshot-schema";
import type { AnalysisEvent, PublicError, RepoSnapshot } from "@/lib/types";

export class AnalysisFailed extends Error {
  constructor(readonly error: PublicError) {
    super(error.message);
  }
}

/** Streams `/api/analyze` and resolves with the snapshot; `onStage` receives progress text. */
export async function fetchAnalysis(
  params: { owner: string; repo: string; ref?: string },
  signal: AbortSignal,
  onStage?: (stage: string, detail?: string) => void,
): Promise<{ snapshot: RepoSnapshot; permalink: string | null }> {
  const query = new URLSearchParams({ owner: params.owner, repo: params.repo, ...(params.ref ? { ref: params.ref } : {}) });
  let res: Response;
  try {
    res = await fetch(`/api/analyze?${query}`, { signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new AnalysisFailed({ code: "network", message: "Could not reach the GitCity server." });
  }
  if (!res.body) throw new AnalysisFailed({ code: "network", message: "Could not reach the GitCity server." });
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
      let event: AnalysisEvent;
      try {
        event = JSON.parse(line) as AnalysisEvent;
      } catch {
        throw new AnalysisFailed({ code: "network", message: "Received an unreadable response." });
      }
      if (event.type === "stage") onStage?.(event.stage, event.detail);
      else if (event.type === "error") throw new AnalysisFailed(event.error);
      else if (event.type === "result") return { snapshot: parseSnapshot(event.snapshot), permalink: event.permalink ?? null };
    }
  }
  throw new AnalysisFailed({ code: "network", message: "The connection closed before the city was ready." });
}
