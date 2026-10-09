import { Color, CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { buildingHex } from "@/lib/city/palette";
import type { Building, CityLayout } from "@/lib/city/layout";

export { AGGREGATE_COLOR, BACKGROUND, buildingBase, dirDepth, GROUND_COLOR, PLINTH_HEIGHT, plinthColor } from "@/lib/city/palette";

export function buildingColor(b: Building, out: Color): Color {
  return out.set(buildingHex(b));
}

/** Diagonal hatching: the non-colour cue for "metric unavailable" and aggregates. */
export function createStripeTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#9c968b";
  ctx.lineWidth = 9;
  for (let i = -size; i < size * 2; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export interface FitResult {
  position: [number, number, number];
  target: [number, number, number];
  distance: number;
}

export const DEFAULT_DIRECTION: [number, number, number] = normalize([0.78, 0.72, 1]);

export function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Camera placement that frames the whole city. Projects the eight corners of the
 * city's bounding box into the camera basis and solves for the smallest distance
 * at which every corner fits inside both the vertical and horizontal FOV.
 */
export function fitCity(layout: CityLayout, fovDeg: number, aspect: number, dir = DEFAULT_DIRECTION, margin = 1.06): FitResult {
  const { minX, maxX, minZ, maxZ, maxHeight } = layout.bounds;
  const top = Math.max(1, maxHeight);
  const target: [number, number, number] = [(minX + maxX) / 2, top * 0.22, (minZ + maxZ) / 2];
  return fitBox([minX, 0, minZ], [maxX, top, maxZ], target, fovDeg, aspect, dir, margin);
}

export function fitBox(
  min: [number, number, number],
  max: [number, number, number],
  target: [number, number, number],
  fovDeg: number,
  aspect: number,
  dir: [number, number, number],
  margin = 1.06,
): FitResult {
  // Forward points from camera to target.
  const f = normalize([-dir[0], -dir[1], -dir[2]]);
  let r = cross(f, [0, 1, 0]);
  if (Math.hypot(...r) < 1e-6) r = [1, 0, 0];
  r = normalize(r);
  const u = cross(r, f);
  const tv = Math.tan((fovDeg * Math.PI) / 360);
  const th = tv * Math.max(0.2, aspect);
  let distance = 1;
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        const p: [number, number, number] = [x - target[0], y - target[1], z - target[2]];
        const along = dot(p, f);
        distance = Math.max(distance, Math.abs(dot(p, r)) / th - along, Math.abs(dot(p, u)) / tv - along);
      }
  distance *= margin;
  return {
    position: [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance],
    target,
    distance,
  };
}

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
