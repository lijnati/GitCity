"use client";

import dynamic from "next/dynamic";
import { ArrowUpRight } from "lucide-react";
import { useMemo, useRef } from "react";
import { RENDER_BUDGET } from "@/lib/city/aggregate";
import { generateCity } from "@/lib/city/layout";
import { formatNumber, shortSha } from "@/lib/format";
import type { RepoSnapshot } from "@/lib/types";
import type { CameraApi } from "@/components/scene/city-scene";
import { CameraControls } from "@/components/explorer/chrome";
import { useIsMobile, useReducedMotion, useWebGLSupport } from "@/components/explorer/hooks";
import { Logo } from "@/components/logo";

const CityScene = dynamic(() => import("@/components/scene/city-scene"), { ssr: false });

/** Minimal interactive city for iframes: orbit, zoom, and a link to the full explorer. */
export function EmbedCity({ snapshot, href }: { snapshot: RepoSnapshot; href: string }) {
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const webgl = useWebGLSupport();
  const camera = useRef<CameraApi | null>(null);
  const layout = useMemo(
    () => generateCity(snapshot.files, { heightMetric: "lines", budget: isMobile ? RENDER_BUDGET.mobile : RENDER_BUDGET.desktop }),
    [snapshot, isMobile],
  );
  const lines = snapshot.files.reduce((s, f) => s + (f.lines ?? 0), 0);
  return (
    <div className="relative h-dvh overflow-hidden bg-paper">
      {webgl !== false && (
        <CityScene className="absolute inset-0 touch-none" layout={layout} active={null} selectedId={null} showLabels cameraRef={camera} lowPower={isMobile} reducedMotion={reducedMotion} />
      )}
      {webgl === false && <p className="absolute inset-0 grid place-items-center text-[13px] text-muted">This browser cannot display WebGL.</p>}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-3 border border-line-strong bg-surface/95 px-3 py-2">
        <Logo />
        <span className="font-mono text-[12.5px] text-ink">
          <span className="text-muted">{snapshot.repo.owner}/</span>
          <span className="font-semibold">{snapshot.repo.name}</span>
          <span className="text-faint"> @ {shortSha(snapshot.revision.sha)}</span>
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-3">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto inline-flex h-9 items-center gap-1.5 border border-line-strong bg-surface/95 px-3 text-[12.5px] font-medium text-ink hover:border-ink"
        >
          {formatNumber(snapshot.files.length)} files · {formatNumber(lines)} lines · Explore on GitCity <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
        <CameraControls camera={camera} className="pointer-events-auto" />
      </div>
    </div>
  );
}
