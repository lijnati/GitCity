"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { RENDER_BUDGET } from "@/lib/city/aggregate";
import { generateCity } from "@/lib/city/layout";
import { formatDate, formatNumber, shortSha } from "@/lib/format";
import type { RepoSnapshot } from "@/lib/types";
import { useIsMobile, useReducedMotion, useWebGLSupport } from "@/components/explorer/hooks";
import { basename, languageInfo } from "@/lib/repo/languages";

const CityScene = dynamic(() => import("@/components/scene/city-scene"), { ssr: false });

/** A real, interactive city built from the bundled sample snapshot. */
export function LandingPreview({ snapshot }: { snapshot: RepoSnapshot }) {
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const webgl = useWebGLSupport();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const layout = useMemo(() => generateCity(snapshot.files, { heightMetric: "lines", budget: isMobile ? RENDER_BUDGET.mobile : RENDER_BUDGET.desktop }), [snapshot, isMobile]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const b = selected === null ? undefined : layout.buildings[selected];
  const file = b && b.kind === "file" ? snapshot.files[b.fileIndex] : undefined;
  const name = `${snapshot.repo.owner}/${snapshot.repo.name}`;

  return (
    <figure className="flex h-full flex-col border border-line-strong bg-surface">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 font-mono text-[11.5px] text-muted">
        <span className="truncate">
          <span className="text-ink">{name}</span> @ {shortSha(snapshot.revision.sha)}
        </span>
        <span className="shrink-0">Live preview · bundled snapshot</span>
      </figcaption>
      <div ref={ref} className="relative min-h-[320px] flex-1">
        {webgl === false ? (
          <p className="absolute inset-0 grid place-items-center p-6 text-center text-[14px] text-muted">This browser can’t display WebGL. The sample is still available as a list.</p>
        ) : (
          visible && (
            <CityScene
              className="absolute inset-0 touch-pan-y"
              layout={layout}
              active={null}
              selectedId={selected}
              showLabels={!isMobile}
              lowPower={isMobile}
              reducedMotion={reducedMotion}
              autoRotate
              onSelect={setSelected}
            />
          )
        )}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
          <div className="pointer-events-auto max-w-[75%] border border-line-strong bg-surface/95 px-3 py-2 text-[12px] text-ink-2">
            {file ? (
              <>
                <div className="flex items-center gap-1.5 font-mono text-[12.5px] text-ink">
                  <span className="size-2 rounded-[1px]" style={{ background: languageInfo(file.language).color }} aria-hidden />
                  {basename(file.path)}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                  {file.lines === null ? "lines n/a" : `${formatNumber(file.lines)} lines`} · {file.path}
                </div>
              </>
            ) : (
              <>Drag to orbit · tap a building</>
            )}
          </div>
          <Link
            href="/sample"
            className="pointer-events-auto inline-flex h-9 shrink-0 items-center rounded-sm bg-ink px-3 text-[13px] font-medium text-paper hover:bg-accent"
          >
            Explore →
          </Link>
        </div>
      </div>
      <p className="border-t border-line px-3 py-2 text-[11.5px] text-muted">
        {formatNumber(snapshot.files.length)} files from a snapshot captured {formatDate(snapshot.analyzedAt)} — not a live analysis.
      </p>
    </figure>
  );
}
