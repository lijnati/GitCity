"use client";

import { ArrowUpRight, Crosshair, X } from "lucide-react";
import type { Building } from "@/lib/city/layout";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { basename, dirname, languageInfo } from "@/lib/repo/languages";
import type { LinesNote, RepoFile, RepoSnapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { githubFileUrl, githubTreeUrl } from "./model";

const LINES_NOTE: Record<LinesNote, string> = {
  binary: "Binary file — no lines to count",
  "too-large": "File is larger than 1 MB, so it was not read",
  budget: "Analysis budget reached before this file was read",
  "not-fetched": "File contents could not be downloaded",
};

type Provenance = "exact" | "estimate" | "unavailable";

function Tag({ kind }: { kind: Provenance }) {
  const label = kind === "exact" ? "exact" : kind === "estimate" ? "estimate" : "n/a";
  return (
    <span
      className={
        "ml-2 inline-flex h-[18px] items-center rounded-xs border px-1 font-mono text-[10px] uppercase tracking-wide " +
        (kind === "exact" ? "border-line-strong text-muted" : kind === "estimate" ? "border-dashed border-line-strong text-muted" : "border-transparent bg-black/[0.04] text-faint")
      }
    >
      {label}
    </span>
  );
}

function Row({ label, kind, children }: { label: string; kind: Provenance; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 border-t border-line py-2.5 first:border-t-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink">
        <span className={kind === "unavailable" ? "text-muted" : "tabular font-mono"}>{children}</span>
        <Tag kind={kind} />
      </dd>
    </div>
  );
}

export function DetailContent({
  snapshot,
  building,
  fileIndex,
  onClose,
  onFocus,
  onSelectFile,
}: {
  snapshot: RepoSnapshot;
  building: Building;
  /** A specific file inside an aggregate, when one was picked. */
  fileIndex: number | null;
  onClose: () => void;
  onFocus: () => void;
  onSelectFile: (fileIndex: number | null) => void;
}) {
  if (building.kind === "aggregate" && fileIndex === null) {
    return <AggregateDetail snapshot={snapshot} building={building} onClose={onClose} onFocus={onFocus} onSelectFile={onSelectFile} />;
  }
  const file = snapshot.files[building.kind === "file" ? building.fileIndex : fileIndex!]!;
  return (
    <>
      {building.kind === "aggregate" && (
        <button type="button" onClick={() => onSelectFile(null)} className="mb-3 text-[12px] text-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
          ← Part of an aggregated block ({building.aggregate!.count} files)
        </button>
      )}
      <FileDetail snapshot={snapshot} file={file} onClose={onClose} onFocus={onFocus} />
    </>
  );
}

function Header({ eyebrow, title, onClose, onFocus }: { eyebrow: React.ReactNode; title: string; onClose: () => void; onFocus: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-[12px] text-muted">{eyebrow}</div>
        <h2 className="break-words text-[19px] font-semibold leading-tight tracking-[-0.015em] text-ink" id="detail-title">
          {title}
        </h2>
      </div>
      <div className="-mr-1.5 -mt-1 flex shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onFocus} aria-label="Move camera to this building" title="Focus camera">
          <Crosshair />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details" title="Close (Esc)">
          <X />
        </Button>
      </div>
    </div>
  );
}

function FileDetail({ snapshot, file, onClose, onFocus }: { snapshot: RepoSnapshot; file: RepoFile; onClose: () => void; onFocus: () => void }) {
  const lang = languageInfo(file.language);
  const activity = snapshot.activity;
  const windowLabel = activity ? `last ${activity.commits} commits` : "";
  const complexitySupported = lang.family !== "none";

  return (
    <div>
      <Header
        eyebrow={
          <>
            <span className="inline-block size-2.5 rounded-[1px]" style={{ background: lang.color }} aria-hidden />
            {lang.name}
          </>
        }
        title={basename(file.path)}
        onClose={onClose}
        onFocus={onFocus}
      />
      <p className="mt-2 break-all font-mono text-[12px] leading-relaxed text-muted">{file.path}</p>

      <dl className="mt-4 border-y border-line">
        {file.lines !== null ? (
          <Row label="Lines" kind="exact">{formatNumber(file.lines)}</Row>
        ) : (
          <Row label="Lines" kind="unavailable">{LINES_NOTE[file.linesNote ?? "not-fetched"]}</Row>
        )}
        <Row label="Size" kind="exact">
          {formatBytes(file.size)} <span className="text-faint">({formatNumber(file.size)} B)</span>
        </Row>
        {!activity ? (
          <>
            <Row label="Last modified" kind="unavailable">Commit history unavailable</Row>
            <Row label="Commits" kind="unavailable">Commit history unavailable</Row>
          </>
        ) : (
          <>
            {file.lastModified ? (
              <Row label="Last modified" kind="exact">{formatDate(file.lastModified)}</Row>
            ) : (
              <Row label="Last modified" kind="unavailable">
                Not changed in the {windowLabel}
                {activity.oldest ? ` (before ${formatDate(activity.oldest)})` : ""}
              </Row>
            )}
            <Row label="Commits" kind="exact">
              {formatNumber(file.commits ?? 0)} <span className="font-sans text-faint">in the {windowLabel}</span>
            </Row>
          </>
        )}
        {file.complexity !== null ? (
          <Row label="Complexity" kind="estimate">
            ~{formatNumber(file.complexity)} <span className="font-sans text-faint">decision points</span>
          </Row>
        ) : (
          <Row label="Complexity" kind="unavailable">{complexitySupported ? "Not computed (contents unavailable)" : `Not computed for ${lang.name}`}</Row>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={githubFileUrl(snapshot, file.path)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-ink px-3 text-[13px] font-medium text-paper hover:bg-ink-2"
        >
          View on GitHub <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-faint">
        Height ∝ log₂(1 + lines) · footprint ∝ √bytes · at {snapshot.revision.sha.slice(0, 7)}
        {dirname(file.path) ? "" : " · repository root"}
      </p>
    </div>
  );
}

function AggregateDetail({
  snapshot,
  building,
  onClose,
  onFocus,
  onSelectFile,
}: {
  snapshot: RepoSnapshot;
  building: Building;
  onClose: () => void;
  onFocus: () => void;
  onSelectFile?: (fileIndex: number) => void;
}) {
  const agg = building.aggregate!;
  const files = agg.files.map((i) => ({ i, f: snapshot.files[i]! })).sort((a, b) => b.f.size - a.f.size);
  const lines = files.reduce((s, x) => s + (x.f.lines ?? 0), 0);
  const unknown = files.filter((x) => x.f.lines === null).length;
  return (
    <div>
      <Header eyebrow={<span>Aggregated block</span>} title={`${formatNumber(agg.count)} smaller files`} onClose={onClose} onFocus={onFocus} />
      <p className="mt-2 break-all font-mono text-[12px] text-muted">{building.dir || "(repository root)"}/</p>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
        To stay within the rendering budget, the smallest files in this directory are merged into one flat, striped block. They are all listed here and in
        the list view.
      </p>
      <dl className="mt-4 border-y border-line">
        <Row label="Files" kind="exact">{formatNumber(agg.count)}</Row>
        <Row label="Total size" kind="exact">{formatBytes(agg.bytes)}</Row>
        <Row label="Lines" kind={unknown === files.length ? "unavailable" : "exact"}>
          {unknown === files.length ? "Unavailable" : `${formatNumber(lines)}${unknown ? ` (+${unknown} files unknown)` : ""}`}
        </Row>
      </dl>
      <ul className="mt-3 max-h-64 overflow-auto pr-1">
        {files.slice(0, 200).map(({ i, f }) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => onSelectFile?.(i)}
              className="flex w-full items-baseline justify-between gap-3 rounded-xs px-1 py-1 text-left hover:bg-black/[0.04]"
            >
              <span className="truncate font-mono text-[12px] text-ink-2">{basename(f.path)}</span>
              <span className="tabular shrink-0 font-mono text-[11px] text-faint">{formatBytes(f.size)}</span>
            </button>
          </li>
        ))}
      </ul>
      {files.length > 200 && <p className="mt-2 text-[12px] text-faint">+{formatNumber(files.length - 200)} more in the list view</p>}
      <a
        href={githubTreeUrl(snapshot, building.dir)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-[13px] font-medium hover:border-ink"
      >
        Open directory on GitHub <ArrowUpRight className="size-4" aria-hidden />
      </a>
    </div>
  );
}
