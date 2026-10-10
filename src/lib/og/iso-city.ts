import type { CityLayout } from "@/lib/city/layout";
import { buildingBase, buildingHex, PALETTES, PLINTH_HEIGHT, plinthColor, type ScenePalette } from "@/lib/city/palette";

/**
 * Renders a city layout as a flat-shaded isometric SVG for preview images.
 * It draws the same geometry as the WebGL scene (same layout, heights and
 * palette) but needs no GPU, so it can run inside an image route.
 *
 * Projection: screen x = (x − z)·cos30°, screen y = (x + z)·sin30° − y.
 * Boxes are painted back-to-front by x + z; only the three faces that face the
 * viewer (top, +x, +z) are drawn.
 */
export interface IsoOptions {
  width: number;
  height: number;
  /** Vertical exaggeration so low cities still read as skylines. */
  heightScale?: number;
  padding?: number;
  palette?: ScenePalette;
}

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

type P = [number, number];

export function renderIsoCitySvg(layout: CityLayout, opts: IsoOptions): string {
  const { width, height, heightScale = 1.25, padding = 16, palette = PALETTES.light } = opts;
  const project = (x: number, y: number, z: number): P => [(x - z) * COS, (x + z) * SIN - y * heightScale];

  // Projected bounds of every vertex that can be drawn.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const extend = ([px, py]: P) => {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
  const { bounds } = layout;
  for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) extend(project(x, 0, z));
  for (const b of layout.buildings) {
    const top = buildingBase(b) + b.h;
    extend(project(b.x - b.w / 2, top, b.z - b.w / 2));
    extend(project(b.x + b.w / 2, top, b.z - b.w / 2));
    extend(project(b.x - b.w / 2, top, b.z + b.w / 2));
  }
  if (!Number.isFinite(minX)) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;

  const scale = Math.min((width - padding * 2) / Math.max(maxX - minX, 1e-6), (height - padding * 2) / Math.max(maxY - minY, 1e-6));
  const ox = (width - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (height - (maxY - minY) * scale) / 2 - minY * scale;
  const pt = (x: number, y: number, z: number) => {
    const [px, py] = project(x, y, z);
    return `${(px * scale + ox).toFixed(1)},${(py * scale + oy).toFixed(1)}`;
  };
  const poly = (fill: string, pts: string[]) => `<polygon fill="${fill}" points="${pts.join(" ")}"/>`;

  const out: string[] = [];
  // Ground under the whole city.
  const g = 2;
  out.push(
    poly(palette.ground, [
      pt(bounds.minX - g, 0, bounds.minZ - g),
      pt(bounds.maxX + g, 0, bounds.minZ - g),
      pt(bounds.maxX + g, 0, bounds.maxZ + g),
      pt(bounds.minX - g, 0, bounds.maxZ + g),
    ]),
  );
  // Neighbourhood plinths, parents before children.
  const blocks = [...layout.blocks].sort((a, b) => a.depth - b.depth);
  for (const b of blocks) {
    const y = b.depth * PLINTH_HEIGHT;
    out.push(poly(plinthColor(b.depth, palette), [pt(b.x, y, b.z), pt(b.x + b.w, y, b.z), pt(b.x + b.w, y, b.z + b.d), pt(b.x, y, b.z + b.d)]));
  }
  // Buildings, far to near.
  const order = layout.buildings.map((b) => b.id).sort((a, b) => {
    const A = layout.buildings[a]!;
    const B = layout.buildings[b]!;
    return A.x + A.z - (B.x + B.z) || a - b;
  });
  for (const id of order) {
    const b = layout.buildings[id]!;
    const hex = buildingHex(b, palette);
    const x0 = b.x - b.w / 2;
    const x1 = b.x + b.w / 2;
    const z0 = b.z - b.w / 2;
    const z1 = b.z + b.w / 2;
    const y0 = buildingBase(b);
    const y1 = y0 + b.h;
    out.push(poly(shade(hex, 0.86), [pt(x0, y0, z1), pt(x1, y0, z1), pt(x1, y1, z1), pt(x0, y1, z1)])); // +z face
    out.push(poly(shade(hex, 0.7), [pt(x1, y0, z0), pt(x1, y0, z1), pt(x1, y1, z1), pt(x1, y1, z0)])); // +x face
    out.push(poly(shade(hex, 1.12), [pt(x0, y1, z0), pt(x1, y1, z0), pt(x1, y1, z1), pt(x0, y1, z1)])); // top
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision">${out.join("")}</svg>`;
}

/** Multiply an sRGB hex colour (factor > 1 lightens toward white). */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(factor >= 1 ? c + (255 - c) * (factor - 1) : c * factor),
  );
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}
