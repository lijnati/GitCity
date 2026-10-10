"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color } from "three";
import type { CityLayout } from "@/lib/city/layout";
import { buildingBase, type ScenePalette } from "./scene-utils";

export interface ArcSet {
  /** Building-level import edges [importer, imported], deduplicated, no self-edges. */
  edges: readonly (readonly [number, number])[];
  /** When set, only this building's arcs are drawn, coloured by direction. */
  focus: number | null;
  /** Buildings currently matching the filters (null = all). Arcs need one active end. */
  active: Uint8Array | null;
  /** Most arcs drawn without a focus. */
  limit: number;
}

const SEGMENTS = 14;

/**
 * Import links drawn as parabolic arcs from the top of the importing building to
 * the top of the imported one. Each arc brightens toward the file it imports, so
 * direction reads without arrowheads. One LineSegments draw call.
 */
export function DependencyArcs({ layout, arcs, palette }: { layout: CityLayout; arcs: ArcSet; palette: ScenePalette }) {
  const invalidate = useThree((s) => s.invalidate);

  const geometry = useMemo(() => {
    const { buildings } = layout;
    const chosen: { a: number; b: number; color: string }[] = [];
    if (arcs.focus !== null) {
      for (const [a, b] of arcs.edges) {
        if (a === arcs.focus) chosen.push({ a, b, color: palette.arcOut });
        else if (b === arcs.focus) chosen.push({ a, b, color: palette.arcIn });
      }
    } else {
      for (const [a, b] of arcs.edges) {
        if (chosen.length >= arcs.limit) break;
        if (arcs.active && !arcs.active[a] && !arcs.active[b]) continue;
        chosen.push({ a, b, color: palette.arc });
      }
    }

    const positions = new Float32Array(chosen.length * SEGMENTS * 2 * 3);
    const colors = new Float32Array(positions.length);
    const bg = new Color(palette.background);
    const c = new Color();
    const tmp = new Color();
    let p = 0;
    const point = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, lift: number, t: number, out: number[]) => {
      const u = 1 - t;
      out[0] = ax * u + bx * t;
      out[2] = az * u + bz * t;
      // Quadratic Bézier in height: endpoints at the roofs, apex lifted by `lift`.
      const my = (ay + by) / 2 + lift;
      out[1] = u * u * ay + 2 * u * t * my + t * t * by;
    };
    const v0 = [0, 0, 0];
    const v1 = [0, 0, 0];
    for (const { a, b, color } of chosen) {
      const A = buildings[a];
      const B = buildings[b];
      if (!A || !B) continue;
      const ay = buildingBase(A) + A.h;
      const by = buildingBase(B) + B.h;
      const dist = Math.hypot(B.x - A.x, B.z - A.z);
      const lift = 1.5 + dist * 0.32;
      c.set(color);
      for (let s = 0; s < SEGMENTS; s++) {
        const t0 = s / SEGMENTS;
        const t1 = (s + 1) / SEGMENTS;
        point(A.x, ay, A.z, B.x, by, B.z, lift, t0, v0);
        point(A.x, ay, A.z, B.x, by, B.z, lift, t1, v1);
        for (const [v, t] of [
          [v0, t0],
          [v1, t1],
        ] as const) {
          positions[p] = v[0]!;
          positions[p + 1] = v[1]!;
          positions[p + 2] = v[2]!;
          // Faint at the importer, full colour at the imported file.
          tmp.copy(bg).lerp(c, 0.25 + 0.75 * t);
          colors[p] = tmp.r;
          colors[p + 1] = tmp.g;
          colors[p + 2] = tmp.b;
          p += 3;
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions.subarray(0, p), 3));
    g.setAttribute("color", new BufferAttribute(colors.subarray(0, p), 3));
    g.computeBoundingSphere();
    return g;
  }, [layout, arcs, palette]);

  useEffect(() => {
    invalidate();
    return () => geometry.dispose();
  }, [geometry, invalidate]);

  const focused = arcs.focus !== null;
  return (
    <lineSegments geometry={geometry} raycast={() => null} renderOrder={2}>
      <lineBasicMaterial vertexColors transparent opacity={focused ? 0.95 : 0.7} depthWrite={false} />
    </lineSegments>
  );
}
