import { basename, dirname } from "@/lib/repo/languages";
import type { RepoFile } from "@/lib/types";
import { applyBudget, cmp } from "./aggregate";
import { aggregateFootprintFor, buildingHeight, footprintFor, SCALE, type HeightMetric } from "./scale";

/**
 * City generation: RepoFile[] → directory tree → bottom-up rectangle packing.
 *
 * Every directory is a rectangular "block". Inside a block, the directory's own
 * files are shelf-packed into one lot; the lot and the child blocks are then
 * shelf-packed with street-width gaps. Because each block's size is computed from
 * its packed contents, nothing can overflow or overlap. Every ordering decision
 * uses byte-wise path comparison, so the same input always yields the same city.
 */

export interface Building {
  /** Instance index (0..n-1). */
  id: number;
  kind: "file" | "aggregate";
  /** Index into snapshot.files for kind "file"; -1 for aggregates. */
  fileIndex: number;
  /** File path, or the directory path for aggregates. */
  path: string;
  dir: string;
  language: string;
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Footprint edge length (square). */
  w: number;
  h: number;
  /** Height metric unavailable for this building (rendered striped and flat). */
  unknown: boolean;
  aggregate?: { count: number; bytes: number; files: number[] };
}

export interface Block {
  path: string;
  name: string;
  depth: number;
  /** Minimum corner and size. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Files beneath this directory (recursive, before aggregation). */
  fileCount: number;
}

export interface CityLayout {
  buildings: Building[];
  blocks: Block[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxHeight: number };
  /** Number of files folded into aggregate blocks. */
  aggregatedFiles: number;
  /** fileIndex → building id (aggregated files map to their aggregate). */
  fileToBuilding: Int32Array;
}

export interface LayoutOptions {
  heightMetric: HeightMetric;
  budget: number;
}

export const SPACING = {
  buildingGap: 0.45,
  blockPadding: 0.7,
  street: (depth: number) => Math.max(1, 3.2 - 0.6 * depth),
} as const;

interface DirNode {
  path: string;
  name: string;
  depth: number;
  dirs: Map<string, DirNode>;
  items: Omit<Building, "id" | "x" | "z">[];
  fileCount: number;
}

interface Rect {
  w: number;
  d: number;
  key: string;
}

interface Placed {
  x: number;
  z: number;
}

export function generateCity(files: readonly RepoFile[], opts: LayoutOptions): CityLayout {
  const { kept, aggregates } = applyBudget(files, opts.budget);
  const root: DirNode = newDir("", "", 0);

  for (const i of kept) {
    const f = files[i]!;
    const { h, unknown } = buildingHeight(opts.heightMetric, f.lines, f.size);
    dirFor(root, dirname(f.path)).items.push({
      kind: "file",
      fileIndex: i,
      path: f.path,
      dir: dirname(f.path),
      language: f.language,
      w: footprintFor(f.size),
      h,
      unknown,
    });
  }
  let aggregatedFiles = 0;
  for (const [dir, indices] of aggregates) {
    const bytes = indices.reduce((s, i) => s + files[i]!.size, 0);
    aggregatedFiles += indices.length;
    dirFor(root, dir).items.push({
      kind: "aggregate",
      fileIndex: -1,
      path: dir,
      dir,
      language: "other",
      w: aggregateFootprintFor(bytes),
      h: SCALE.aggregateHeight,
      unknown: true,
      aggregate: { count: indices.length, bytes, files: indices },
    });
  }
  for (const f of files) {
    // Recursive file counts for every ancestor (including the root).
    let node: DirNode | undefined = root;
    node.fileCount++;
    const parts = dirname(f.path).split("/").filter(Boolean);
    for (const p of parts) {
      node = node.dirs.get(p);
      if (!node) break;
      node.fileCount++;
    }
  }

  const buildings: Building[] = [];
  const blocks: Block[] = [];
  const packed = packDir(root);
  packed.emit(0, 0, buildings, blocks);

  // Centre the city on the origin.
  const cx = packed.w / 2;
  const cz = packed.d / 2;
  let maxHeight = 0;
  for (const b of buildings) {
    b.x -= cx;
    b.z -= cz;
    maxHeight = Math.max(maxHeight, b.h);
  }
  for (const b of blocks) {
    b.x -= cx;
    b.z -= cz;
  }

  const fileToBuilding = new Int32Array(files.length).fill(-1);
  for (const b of buildings) {
    if (b.kind === "file") fileToBuilding[b.fileIndex] = b.id;
    else for (const i of b.aggregate!.files) fileToBuilding[i] = b.id;
  }

  return {
    buildings,
    blocks,
    bounds: { minX: -cx, maxX: cx, minZ: -cz, maxZ: cz, maxHeight },
    aggregatedFiles,
    fileToBuilding,
  };
}

function newDir(path: string, name: string, depth: number): DirNode {
  return { path, name, depth, dirs: new Map(), items: [], fileCount: 0 };
}

function dirFor(root: DirNode, dir: string): DirNode {
  let node = root;
  if (!dir) return node;
  for (const part of dir.split("/")) {
    let next = node.dirs.get(part);
    if (!next) {
      next = newDir(node.path ? `${node.path}/${part}` : part, part, node.depth + 1);
      node.dirs.set(part, next);
    }
    node = next;
  }
  return node;
}

interface PackedDir {
  w: number;
  d: number;
  emit(ox: number, oz: number, buildings: Building[], blocks: Block[]): void;
}

function packDir(node: DirNode): PackedDir {
  const pad = node.depth === 0 ? SPACING.street(0) : SPACING.blockPadding;
  const street = SPACING.street(node.depth);

  // 1. This directory's own buildings → one lot.
  const items = [...node.items].sort((a, b) => cmp(a.path, b.path));
  const lotRects: Rect[] = items.map((it) => ({ w: it.w, d: it.w, key: it.path }));
  const lot = lotRects.length ? shelfPack(lotRects, SPACING.buildingGap) : null;

  // 2. Child directories.
  const children = [...node.dirs.values()].sort((a, b) => cmp(a.name, b.name)).map((c) => ({ node: c, packed: packDir(c) }));

  // 3. Lot + child blocks → this block.
  const rects: Rect[] = [];
  if (lot) rects.push({ w: lot.w, d: lot.d, key: "\u0000lot" });
  for (const c of children) rects.push({ w: c.packed.w, d: c.packed.d, key: c.node.path });
  const outer = shelfPack(rects, street);
  const w = outer.w + pad * 2;
  const d = outer.d + pad * 2;

  return {
    w,
    d,
    emit(ox, oz, buildings, blocks) {
      if (node.depth > 0) {
        blocks.push({ path: node.path, name: node.name, depth: node.depth, x: ox, z: oz, w, d, fileCount: node.fileCount });
      }
      let ri = 0;
      if (lot) {
        const lp = outer.positions[ri++]!;
        items.forEach((it, i) => {
          const p = lot.positions[i]!;
          buildings.push({
            ...it,
            id: buildings.length,
            x: ox + pad + lp.x + p.x + it.w / 2,
            z: oz + pad + lp.z + p.z + it.w / 2,
          });
        });
      }
      for (const c of children) {
        const p = outer.positions[ri++]!;
        c.packed.emit(ox + pad + p.x, oz + pad + p.z, buildings, blocks);
      }
    },
  };
}

/**
 * Shelf packing. Items are ordered by depth (desc), width (desc), key (asc) and
 * laid out in rows no wider than a target chosen to make the result near-square.
 * Returns positions (min corners) in the input order.
 */
export function shelfPack(rects: Rect[], gap: number): { w: number; d: number; positions: Placed[] } {
  if (rects.length === 0) return { w: 0, d: 0, positions: [] };
  const order = rects.map((_, i) => i).sort((a, b) => {
    const ra = rects[a]!;
    const rb = rects[b]!;
    return rb.d - ra.d || rb.w - ra.w || cmp(ra.key, rb.key);
  });
  const area = rects.reduce((s, r) => s + (r.w + gap) * (r.d + gap), 0);
  const widest = rects.reduce((m, r) => Math.max(m, r.w), 0);
  const target = Math.max(widest, Math.sqrt(area) * 1.15);

  const positions: Placed[] = new Array(rects.length);
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  let maxW = 0;
  for (const i of order) {
    const r = rects[i]!;
    if (x > 0 && x + r.w > target) {
      z += rowDepth + gap;
      x = 0;
      rowDepth = 0;
    }
    positions[i] = { x, z };
    x += r.w;
    maxW = Math.max(maxW, x);
    x += gap;
    rowDepth = Math.max(rowDepth, r.d);
  }
  return { w: maxW, d: z + rowDepth, positions };
}

export function displayName(b: Building): string {
  if (b.kind === "aggregate") return `${b.aggregate!.count} smaller files`;
  return basename(b.path);
}
