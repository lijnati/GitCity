/**
 * Shared data contracts. Everything that crosses the server → client boundary
 * is described here and validated with zod in `snapshot-schema.ts`.
 *
 * Metric provenance (see README "Metric definitions"):
 *  - size          exact     (blob byte size from the Git tree API)
 *  - lines         exact     when non-null (newline count of the real file contents)
 *  - complexity    estimate  (keyword-based decision-point count), null when unsupported
 *  - commits       exact within the analysed commit window, null when no window
 *  - lastModified  exact     when the file was touched inside the window, else null
 */

export type LinesNote = "binary" | "too-large" | "budget" | "not-fetched";

export interface RepoFile {
  path: string;
  /** Exact blob size in bytes. */
  size: number;
  /** Language id, see `languages.ts`. */
  language: string;
  lines: number | null;
  /** Why `lines` is null. Absent when lines is known. */
  linesNote?: LinesNote;
  complexity: number | null;
  commits: number | null;
  lastModified: string | null;
  /** Git blob SHA (exact content identity). Absent in snapshots made before it was recorded. */
  blob?: string;
}

/**
 * File-to-file import edges (JS/TS and Python), resolved inside the repository.
 * Absent in snapshots made before the dependency layer existed.
 */
export interface ImportGraph {
  /** [importer, imported] as indexes into `files`; sorted, unique, no self-edges. */
  edges: [number, number][];
  /** Files whose import statements were read. */
  scanned: number;
  /** Import statements that resolved to a file of this repository. */
  resolved: number;
  /** Imports of packages outside the repository (third-party or standard library). */
  external: number;
  /** Relative or aliased imports that matched no included file (excluded, generated, or missing). */
  unresolved: number;
  /** True when the edge list hit its cap. */
  truncated: boolean;
}

export interface ActivityWindow {
  /** Number of most-recent commits on the analysed ref that were inspected. */
  commits: number;
  newest: string | null;
  oldest: string | null;
  /** True when at least one commit listed more files than GitHub returns (300). */
  partial: boolean;
}

export interface RepoSnapshot {
  schemaVersion: 1;
  source: "live" | "sample";
  repo: {
    owner: string;
    name: string;
    description: string | null;
    defaultBranch: string;
    htmlUrl: string;
    stars: number | null;
  };
  revision: {
    sha: string;
    ref: string;
    committedAt: string | null;
  };
  analyzedAt: string;
  files: RepoFile[];
  excluded: {
    count: number;
    bytes: number;
    byReason: Record<string, number>;
  };
  tree: {
    truncated: boolean;
    /** Blob entries GitHub returned (before exclusions). */
    entries: number;
  };
  lines: {
    /** Files whose lines were counted from real contents. */
    counted: number;
    /** Included files. */
    total: number;
    stoppedEarly: boolean;
  };
  activity: ActivityWindow | null;
  imports?: ImportGraph;
  notes: string[];
}

export type AnalysisStage = "connect" | "structure" | "contents" | "history" | "complete";

export type ErrorCode =
  | "invalid_input"
  | "not_found"
  | "empty"
  | "rate_limited"
  | "too_large"
  | "timeout"
  | "network"
  | "upstream"
  | "unavailable_for_legal_reasons"
  | "too_many_requests"
  | "snapshot_not_found"
  | "timelapse_unavailable";

export interface PublicError {
  code: ErrorCode;
  message: string;
  /** Epoch ms after which a retry is likely to succeed. */
  retryAt?: number;
}

export type AnalysisEvent =
  | { type: "stage"; stage: AnalysisStage; detail?: string }
  /** `permalink` is set when the snapshot is stored and can be linked to permanently. */
  | { type: "result"; snapshot: RepoSnapshot; permalink: string | null }
  | { type: "error"; error: PublicError };

/**
 * A sampled history of the default branch, oldest frame first; the last frame
 * is the head commit. File sizes are exact (Git tree API); frames carry no line
 * counts, so the time-lapse sizes buildings by bytes.
 */
export interface TimelapseFrame {
  sha: string;
  date: string | null;
  /** 1-based position in the commit list, newest = 1. */
  index: number;
  /** [index into `paths`, exact blob size in bytes] for every included file. */
  files: [number, number][];
  truncated: boolean;
}

export interface Timelapse {
  schemaVersion: 1;
  source: "live" | "sample";
  owner: string;
  name: string;
  ref: string;
  headSha: string;
  /** Commits reachable from the head when sampled. */
  totalCommits: number;
  /** Union of included file paths across frames, sorted. */
  paths: string[];
  frames: TimelapseFrame[];
  createdAt: string;
}

export type TimelapseEvent =
  | { type: "progress"; done: number; total: number; label: string }
  | { type: "result"; timelapse: Timelapse }
  | { type: "error"; error: PublicError };
