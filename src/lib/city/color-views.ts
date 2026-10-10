import { formatDate, formatDateTime } from "@/lib/format";
import type { RepoFile, RepoSnapshot } from "@/lib/types";
import type { CityLayout } from "./layout";

/**
 * Colour views: recolour buildings by a measured value instead of language.
 * Values are bucketed onto one sequential ramp; a file whose value GitCity did
 * not measure gets the explicit "unavailable" colour, never a guessed bucket.
 * Aggregate blocks keep their neutral colour (a mix of files has no one value).
 */
export type ColorMode = "language" | "activity" | "age" | "complexity";

export interface ColorStop {
  label: string;
  color: string;
}

export interface ColorView {
  mode: ColorMode;
  /** Hex per building id; null = keep the default (aggregates). */
  colors: (string | null)[];
  title: string;
  stops: ColorStop[];
  /** Present when some buildings have no value. */
  unavailable: ColorStop | null;
  /** What the colour measures, and its limits. */
  note: string;
}

/** Sequential ramp, low → high. Reads on both the light and dark ground. */
export const RAMP = ["#e6dccb", "#e8b07c", "#de7f45", "#c2502a", "#8a2a14"] as const;
export const UNAVAILABLE_COLOR = "#8c8a85";

export interface ModeAvailability {
  mode: ColorMode;
  label: string;
  available: boolean;
  reason?: string;
}

export function colorModes(snapshot: RepoSnapshot): ModeAvailability[] {
  const hasActivity = snapshot.activity !== null && snapshot.activity.commits > 0;
  const hasComplexity = snapshot.files.some((f) => f.complexity !== null);
  return [
    { mode: "language", label: "Language", available: true },
    { mode: "activity", label: "Activity", available: hasActivity, reason: hasActivity ? undefined : "No commit window was analyzed for this city." },
    { mode: "age", label: "Last change", available: hasActivity, reason: hasActivity ? undefined : "No commit window was analyzed for this city." },
    {
      mode: "complexity",
      label: "Complexity",
      available: hasComplexity,
      reason: hasComplexity ? undefined : "No file in a supported language had its contents read.",
    },
  ];
}

interface Bucketing {
  title: string;
  labels: string[];
  note: string;
  /** Bucket index, or null when the value is unavailable. */
  bucket: (f: RepoFile) => number | null;
}

const ACTIVITY_EDGES = [0, 1, 2, 4, 8]; // 0 · 1 · 2–3 · 4–7 · 8+
const COMPLEXITY_EDGES = [0, 6, 11, 26, 51]; // ≤5 · 6–10 · 11–25 · 26–50 · 51+

function edgeBucket(value: number, edges: number[]): number {
  let i = 0;
  while (i + 1 < edges.length && value >= edges[i + 1]!) i++;
  return i;
}

function bucketing(mode: Exclude<ColorMode, "language">, snapshot: RepoSnapshot): Bucketing {
  const act = snapshot.activity;
  if (mode === "activity") {
    return {
      title: `Commits in the last ${act?.commits ?? 0}`,
      labels: ["0", "1", "2–3", "4–7", "8+"],
      note: `Commits touching each file within the analyzed window of ${act?.commits ?? 0} commits on ${snapshot.revision.ref}. Exact within that window.`,
      bucket: (f) => (f.commits === null ? null : edgeBucket(f.commits, ACTIVITY_EDGES)),
    };
  }
  if (mode === "complexity") {
    return {
      title: "Estimated complexity",
      labels: ["≤5", "6–10", "11–25", "26–50", "51+"],
      note: "Keyword-based decision-point count per file — an estimate, not a parse. Unavailable for unsupported languages and unread files.",
      bucket: (f) => (f.complexity === null ? null : edgeBucket(f.complexity, COMPLEXITY_EDGES)),
    };
  }
  // age: files untouched in the window are "older than the window"; the window
  // itself is split into four equal time spans, newest darkest.
  const oldest = act?.oldest ? Date.parse(act.oldest) : NaN;
  const newest = act?.newest ? Date.parse(act.newest) : NaN;
  const span = newest - oldest;
  const cut = (k: number) => oldest + (span * k) / 4;
  const fmt = (t: number) => {
    const iso = new Date(t).toISOString();
    return span < 3 * 86_400_000 ? formatDateTime(iso) : formatDate(iso);
  };
  const labels = Number.isFinite(span) && span > 0 ? ["older", fmt(cut(0)), fmt(cut(1)), fmt(cut(2)), fmt(cut(3))] : ["older", "", "", "", "in window"];
  return {
    title: "Last change · from",
    labels,
    note: `When each file last changed within the last ${act?.commits ?? 0} commits. Files not touched in that window are shown as older than it; their exact date is not known.`,
    bucket: (f) => {
      if (f.commits === null) return null;
      if (!f.lastModified) return 0;
      const t = Date.parse(f.lastModified);
      if (!Number.isFinite(t)) return null;
      if (!(span > 0)) return 4;
      return 1 + Math.min(3, Math.max(0, Math.floor(((t - oldest) / span) * 4)));
    },
  };
}

export function colorView(mode: ColorMode, layout: CityLayout, snapshot: RepoSnapshot): ColorView | null {
  if (mode === "language") return null;
  const b = bucketing(mode, snapshot);
  const colors: (string | null)[] = new Array(layout.buildings.length).fill(null);
  let missing = 0;
  for (const building of layout.buildings) {
    if (building.kind !== "file") continue;
    const k = b.bucket(snapshot.files[building.fileIndex]!);
    if (k === null) {
      missing++;
      colors[building.id] = UNAVAILABLE_COLOR;
    } else colors[building.id] = RAMP[k]!;
  }
  return {
    mode,
    colors,
    title: b.title,
    stops: b.labels.map((label, i) => ({ label, color: RAMP[i]! })),
    unavailable: missing > 0 ? { label: "unavailable", color: UNAVAILABLE_COLOR } : null,
    note: b.note,
  };
}
