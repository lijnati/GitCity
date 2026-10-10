import { languageInfo } from "@/lib/repo/languages";
import type { Building } from "./layout";

/**
 * Scene palette and plinth geometry shared by the WebGL scene and the
 * server-rendered preview image, so both draw the same city.
 */
export const PLINTH_HEIGHT = 0.16;

export type SceneTheme = "light" | "dark";

export interface ScenePalette {
  background: string;
  ground: string;
  plinths: readonly string[];
  aggregate: string;
  /** Buildings filtered out of view. */
  faded: string;
  /** Hemisphere light sky/ground colours and intensity. */
  sky: string;
  bounce: string;
  hemisphere: number;
  sun: number;
  selection: string;
  /** Dependency arcs: all, outgoing (imports), incoming (imported by). */
  arc: string;
  arcOut: string;
  arcIn: string;
}

export const PALETTES: Record<SceneTheme, ScenePalette> = {
  light: {
    background: "#f3f1ec",
    ground: "#d9d4c9",
    plinths: ["#e9e5dc", "#efece5", "#f4f2ed", "#f8f6f2"],
    aggregate: "#b9b4aa",
    faded: "#ece9e2",
    sky: "#ffffff",
    bounce: "#cfc8b8",
    hemisphere: 1.55,
    sun: 1.9,
    selection: "#151515",
    arc: "#3a3936",
    arcOut: "#d6401f",
    arcIn: "#2f6fb0",
  },
  dark: {
    background: "#141413",
    ground: "#1d1c1a",
    plinths: ["#292825", "#2f2e2a", "#353430", "#3b3a35"],
    aggregate: "#6d6962",
    faded: "#262522",
    sky: "#e9e6df",
    bounce: "#3a3731",
    hemisphere: 1.25,
    sun: 1.6,
    selection: "#f3f1ec",
    arc: "#d8d4cb",
    arcOut: "#ff7a52",
    arcIn: "#6aa8ea",
  },
};

export const BACKGROUND = PALETTES.light.background;
export const GROUND_COLOR = PALETTES.light.ground;
export const AGGREGATE_COLOR = PALETTES.light.aggregate;

export function dirDepth(dir: string): number {
  return dir ? dir.split("/").length : 0;
}

export function plinthColor(depth: number, palette: ScenePalette = PALETTES.light): string {
  return palette.plinths[Math.min(depth - 1, palette.plinths.length - 1)]!;
}

export function buildingBase(b: Building): number {
  return dirDepth(b.dir) * PLINTH_HEIGHT;
}

export function buildingHex(b: Building, palette: ScenePalette = PALETTES.light): string {
  return b.kind === "aggregate" ? palette.aggregate : languageInfo(b.language).color;
}
