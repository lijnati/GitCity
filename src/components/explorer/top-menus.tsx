"use client";

import { Check, Code2, Copy, GitCompare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isValidRef } from "@/lib/repo/parse-repo-input";
import type { RepoSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** A button with a small anchored panel; closes on Escape and outside clicks. */
function Popover({ label, icon, children, testid }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode; testid: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} data-testid={testid}>
        {icon}
        <span className="hidden lg:inline">{label}</span>
        <span className="sr-only lg:hidden">{label}</span>
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="gc-rise absolute right-0 top-[calc(100%+6px)] z-50 w-[min(92vw,420px)] border border-line-strong bg-surface p-4 text-[13px] shadow-[0_10px_40px_rgba(20,20,20,0.14)]"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function CompareMenu({ snapshot }: { snapshot: RepoSnapshot }) {
  const router = useRouter();
  const [base, setBase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { owner, name } = snapshot.repo;
  return (
    <Popover label="Compare" icon={<GitCompare />} testid="compare-menu">
      {() => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const ref = base.trim();
            if (!isValidRef(ref)) {
              setError("Use a branch, tag or commit SHA.");
              return;
            }
            const q = new URLSearchParams({ base: ref, head: snapshot.revision.sha });
            router.push(`/compare/${encodeURIComponent(owner)}/${encodeURIComponent(name)}?${q}`);
          }}
        >
          <h2 className="text-[14px] font-semibold text-ink">Compare with another commit</h2>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">
            Both cities are drawn on one plan, with added, removed and changed files highlighted. This city ({snapshot.revision.sha.slice(0, 7)}) is the head.
          </p>
          <label htmlFor="compare-base" className="mt-3 block text-[12px] text-muted">
            Base: branch, tag or commit SHA
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="compare-base"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="e.g. v1.0.0"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="h-9 min-w-0 flex-1 rounded-sm border border-line-strong bg-paper px-2.5 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-faint focus-visible:border-ink"
            />
            <Button type="submit" variant="primary" size="md" className="h-9" disabled={!base.trim()}>
              Compare
            </Button>
          </div>
          {error && (
            <p className="mt-2 text-[12px] text-accent-ink" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Popover>
  );
}

function CopyField({ label, value, testid }: { label: string; value: string; testid?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] text-muted">{label}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-ink"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              window.prompt(label, value);
            }
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-xs border border-line bg-paper p-2 font-mono text-[11.5px] leading-relaxed text-ink-2" data-testid={testid}>
        {value}
      </pre>
    </div>
  );
}

/**
 * Embeds: a README image card (light and dark, via <picture>), and an
 * interactive iframe for web pages. Both read stored snapshots only.
 */
export function EmbedMenu({ snapshot, pinned }: { snapshot: RepoSnapshot; pinned: boolean }) {
  const [tab, setTab] = useState<"readme" | "iframe">("readme");
  const { owner, name } = snapshot.repo;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const path = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const shaQuery = pinned ? `?sha=${snapshot.revision.sha}` : "";
  const cityUrl = `${origin}/city/${path}${pinned ? `/${snapshot.revision.sha}` : ""}`;
  const card = (theme: "light" | "dark") => `${origin}/api/card/${path}${shaQuery ? `${shaQuery}&` : "?"}theme=${theme}`;
  const markdown = [
    `<a href="${cityUrl}">`,
    `  <picture>`,
    `    <source media="(prefers-color-scheme: dark)" srcset="${card("dark")}">`,
    `    <img alt="${owner}/${name} as a 3D city on GitCity" src="${card("light")}" width="600">`,
    `  </picture>`,
    `</a>`,
  ].join("\n");
  const iframe = `<iframe src="${origin}/embed/${path}${shaQuery}" title="${owner}/${name} on GitCity" width="100%" height="480" style="border:0" loading="lazy" allowfullscreen></iframe>`;
  return (
    <Popover label="Embed" icon={<Code2 />} testid="embed-menu">
      {() => (
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Embed this city</h2>
          <div className="mt-2 grid grid-cols-2 rounded-sm border border-line-strong p-0.5" role="tablist">
            {(
              [
                ["readme", "README image"],
                ["iframe", "Interactive (iframe)"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn("h-8 rounded-xs text-[12.5px]", tab === value ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/[0.05]")}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "readme" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card("light")} alt="" width={600} height={315} className="mt-3 w-full border border-line dark:hidden" loading="lazy" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card("dark")} alt="" width={600} height={315} className="mt-3 hidden w-full border border-line dark:block" loading="lazy" />
              <CopyField label="Markdown / HTML for a README (follows GitHub's light/dark theme)" value={markdown} testid="embed-markdown" />
              <p className="mt-2 text-[12px] leading-snug text-muted">
                {pinned
                  ? "Shows this saved snapshot; it never changes."
                  : "Shows the latest city built on GitCity; it updates when someone rebuilds this repository here."}
              </p>
            </>
          ) : (
            <>
              <CopyField label="HTML" value={iframe} testid="embed-iframe" />
              <p className="mt-2 text-[12px] leading-snug text-muted">An interactive 3D city with orbit and zoom, linking back to the full explorer.</p>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}
