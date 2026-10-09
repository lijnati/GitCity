import { detectLanguage } from "@/lib/repo/languages";
import type { RepoFile, Timelapse } from "@/lib/types";
import { generateCity, type CityLayout } from "./layout";
import { aggregateFootprintFor, footprintFor, heightForBytes, SCALE } from "./scale";

/**
 * Per-frame building state, indexed by building id. Positions come from one
 * shared layout, so the city grows in place instead of reshuffling.
 */
export interface FrameValues {
  h: Float32Array;
  w: Float32Array;
  visible: Uint8Array;
  /** Files present in this frame (before aggregation). */
  fileCount: number;
}

export interface TimelapseCity {
  /** Layout of the union of all files, each slot sized for its largest version. */
  layout: CityLayout;
  /** Union files (max size across frames), in `layout`'s file index order. */
  files: RepoFile[];
  frames: FrameValues[];
}

/**
 * Builds the stable layout and the per-frame values. Heights use exact byte
 * size (`heightForBytes`): frames have no line counts.
 */
export function buildTimelapseCity(t: Timelapse, budget: number): TimelapseCity {
  const maxSize = new Float64Array(t.paths.length);
  for (const f of t.frames) for (const [i, size] of f.files) if (size > maxSize[i]!) maxSize[i] = size;

  const files: RepoFile[] = t.paths.map((path, i) => ({
    path,
    size: maxSize[i]!,
    language: detectLanguage(path),
    lines: null,
    complexity: null,
    commits: null,
    lastModified: null,
  }));
  const layout = generateCity(files, { heightMetric: "size", budget });

  const frames = t.frames.map((frame): FrameValues => {
    const size = new Float64Array(t.paths.length).fill(-1);
    for (const [i, s] of frame.files) size[i] = s;
    const n = layout.buildings.length;
    const h = new Float32Array(n);
    const w = new Float32Array(n);
    const visible = new Uint8Array(n);
    for (const b of layout.buildings) {
      if (b.kind === "file") {
        const s = size[b.fileIndex]!;
        if (s < 0) continue;
        visible[b.id] = 1;
        w[b.id] = footprintFor(s);
        h[b.id] = heightForBytes(s);
      } else {
        let bytes = 0;
        let present = 0;
        for (const i of b.aggregate!.files) {
          const s = size[i]!;
          if (s >= 0) {
            bytes += s;
            present++;
          }
        }
        if (present === 0) continue;
        visible[b.id] = 1;
        w[b.id] = aggregateFootprintFor(bytes);
        h[b.id] = SCALE.aggregateHeight;
      }
    }
    return { h, w, visible, fileCount: frame.files.length };
  });

  return { layout, files, frames };
}
