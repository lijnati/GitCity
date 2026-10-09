import { languageInfo } from "@/lib/repo/languages";
import type { Building } from "./layout";

/**
 * Scene palette and plinth geometry shared by the WebGL scene and the
 * server-rendered preview image, so both draw the same city.
 */
export const PLINTH_HEIGHT = 0.16;
export const GROUND_COLOR = "#d9d4c9";
export const BACKGROUND = "#f3f1ec";
export const AGGREGATE_COLOR = "#b9b4aa";
const PLINTH_SHADES = ["#e9e5dc", "#efece5", "#f4f2ed", "#f8f6f2"];

export function dirDepth(dir: string): number {
  return dir ? dir.split("/").length : 0;
}

export function plinthColor(depth: number): string {
  return PLINTH_SHADES[Math.min(depth - 1, PLINTH_SHADES.length - 1)]!;
}

export function buildingBase(b: Building): number {
  return dirDepth(b.dir) * PLINTH_HEIGHT;
}

export function buildingHex(b: Building): string {
  return b.kind === "aggregate" ? AGGREGATE_COLOR : languageInfo(b.language).color;
}
