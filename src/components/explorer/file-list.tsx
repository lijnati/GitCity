"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { languageInfo } from "@/lib/repo/languages";
import type { RepoFile } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "path" | "language" | "lines" | "size" | "commits" | "lastModified";
const PAGE = 300;

/** Accessible alternative to the 3D city: the same data as a sortable table. */
export function FileList({
  files,
  fileMask,
  filtered,
  selectedFile,
  onSelectFile,
  activityLabel,
}: {
  files: readonly RepoFile[];
  fileMask: Uint8Array;
  filtered: boolean;
  selectedFile: number | null;
  onSelectFile: (i: number) => void;
  activityLabel: string | null;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "path", dir: 1 });
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const idx: number[] = [];
    files.forEach((_, i) => {
      if (!filtered || fileMask[i]) idx.push(i);
    });
    const { key, dir } = sort;
    const val = (f: RepoFile): string | number | null => (key === "language" ? languageInfo(f.language).name : f[key]);
    idx.sort((a, b) => {
      const va = val(files[a]!);
      const vb = val(files[b]!);
      // Unavailable values always sort last.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir || (files[a]!.path < files[b]!.path ? -1 : 1);
    });
    return idx;
  }, [files, fileMask, filtered, sort]);

  const header = (key: SortKey, label: string, className = "") => {
    const active = sort.key === key;
    return (
      <th scope="col" className={cn("sticky top-0 z-10 border-b border-line-strong bg-paper px-3 py-0 text-left font-medium", className)} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => setSort({ key, dir: active ? (sort.dir === 1 ? -1 : 1) : key === "path" || key === "language" ? 1 : -1 })}
          className={cn("inline-flex h-10 items-center gap-1 text-[12px] uppercase tracking-[0.06em]", active ? "text-ink" : "text-muted hover:text-ink")}
        >
          {label}
          {active && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
        </button>
      </th>
    );
  };

  return (
    <div className="h-full overflow-auto bg-paper" data-testid="file-list">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <caption className="sr-only">
          Files in this city ({formatNumber(rows.length)}). Sortable by column. {activityLabel ?? ""}
        </caption>
        <thead>
          <tr>
            {header("path", "Path", "w-[44%]")}
            {header("language", "Language")}
            {header("lines", "Lines", "text-right")}
            {header("size", "Size", "text-right")}
            {header("commits", "Commits", "text-right")}
            {header("lastModified", "Last change")}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((i) => {
            const f = files[i]!;
            const lang = languageInfo(f.language);
            return (
              <tr key={f.path} className={cn("border-b border-line hover:bg-black/[0.03]", selectedFile === i && "bg-black/[0.06]")}>
                <td className="max-w-0 px-3 py-0">
                  <button type="button" onClick={() => onSelectFile(i)} className="block h-9 w-full truncate text-left font-mono text-[12.5px] text-ink hover:underline">
                    {f.path}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3">
                  <span className="mr-2 inline-block size-2 rounded-[1px] align-middle" style={{ background: lang.color }} aria-hidden />
                  {lang.name}
                </td>
                <td className="tabular px-3 text-right font-mono">{f.lines === null ? <span className="text-faint">n/a</span> : formatNumber(f.lines)}</td>
                <td className="tabular whitespace-nowrap px-3 text-right font-mono">{formatBytes(f.size)}</td>
                <td className="tabular px-3 text-right font-mono">{f.commits === null ? <span className="text-faint">n/a</span> : formatNumber(f.commits)}</td>
                <td className="whitespace-nowrap px-3 font-mono text-[12px]">{f.lastModified ? formatDate(f.lastModified) : <span className="text-faint">{f.commits === null ? "n/a" : "earlier"}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > limit && (
        <div className="p-4">
          <button type="button" onClick={() => setLimit(limit + PAGE * 3)} className="h-9 rounded-sm border border-line-strong px-3 text-[13px] hover:border-ink">
            Show more ({formatNumber(rows.length - limit)} remaining)
          </button>
        </div>
      )}
      {rows.length === 0 && <p className="p-6 text-[13px] text-muted">No files match the current filters.</p>}
      {activityLabel && <p className="px-3 pb-6 pt-3 text-[12px] text-faint">{activityLabel}</p>}
    </div>
  );
}
