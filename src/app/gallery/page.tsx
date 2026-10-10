import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { compact, formatDate, formatNumber, shortSha } from "@/lib/format";
import { languageInfo } from "@/lib/repo/languages";
import { getSnapshotStore, type CitySummary } from "@/lib/snapshot-store";

/** Rebuilt at most every five minutes; listing storage on every request isn't needed. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Gallery",
  description: "Public GitHub repositories recently built as 3D cities on GitCity.",
};

const LIMIT = 48;

export default async function GalleryPage() {
  let cities: CitySummary[] = [];
  let failed = false;
  try {
    cities = await getSnapshotStore().listRecent(LIMIT);
  } catch (err) {
    console.error("[gallery] listing failed", err);
    failed = true;
  }
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-5 md:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-[14px]" aria-label="Primary">
          <Link href="/" className="rounded-sm px-3 py-2 text-ink-2 hover:text-ink">
            Build a city
          </Link>
          <Link href="/sample" className="rounded-sm px-3 py-2 text-ink-2 hover:text-ink">
            Sample
          </Link>
          <ThemeToggle />
        </nav>
      </header>
      <main className="mx-auto max-w-[1320px] border-t border-line px-5 pb-20 pt-10 md:px-8">
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">Gallery</p>
        <h1 className="mt-3 text-[clamp(2rem,4.5vw,3.4rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-ink">Recently built cities</h1>
        <p className="mt-4 max-w-[40rem] text-[15px] leading-relaxed text-ink-2">
          Public repositories someone built on GitCity, newest first. Each card opens the saved snapshot it shows; “latest” rebuilds from the default branch.
        </p>

        {failed && <p className="mt-10 text-[14px] text-muted">The gallery is unavailable right now.</p>}
        {!failed && cities.length === 0 && (
          <p className="mt-10 text-[14px] text-muted">
            No cities yet. <Link href="/" className="text-ink underline decoration-accent decoration-2 underline-offset-4">Build the first one</Link>.
          </p>
        )}

        <ul className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3" data-testid="gallery">
          {cities.map((c) => {
            const path = `${encodeURIComponent(c.owner)}/${encodeURIComponent(c.name)}`;
            const total = c.languages.reduce((s, l) => s + l.files, 0) || 1;
            return (
              <li key={`${c.owner}/${c.name}`} className="group">
                <Link href={`/city/${path}/${c.sha}`} className="block border border-line bg-surface transition-colors hover:border-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/card/${path}?sha=${c.sha}`} alt={`${c.owner}/${c.name} as a city`} width={1200} height={630} loading="lazy" className="block aspect-[1200/630] w-full dark:hidden" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/card/${path}?sha=${c.sha}&theme=dark`} alt={`${c.owner}/${c.name} as a city`} width={1200} height={630} loading="lazy" className="hidden aspect-[1200/630] w-full dark:block" />
                </Link>
                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <Link href={`/city/${path}/${c.sha}`} className="min-w-0 truncate font-mono text-[14px] text-ink hover:underline">
                    <span className="text-muted">{c.owner}/</span>
                    <span className="font-semibold">{c.name}</span>
                  </Link>
                  <Link href={`/city/${path}`} className="shrink-0 text-[12.5px] text-muted hover:text-ink">
                    latest →
                  </Link>
                </div>
                {c.description && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-2">{c.description}</p>}
                <div className="mt-2 flex h-1.5 w-full overflow-hidden" aria-hidden>
                  {c.languages.map((l) => (
                    <span key={l.id} style={{ width: `${(l.files / total) * 100}%`, background: languageInfo(l.id).color }} />
                  ))}
                </div>
                <p className="mt-2 font-mono text-[11.5px] text-faint">
                  {formatNumber(c.files)} files · {compact(c.lines)} lines{c.stars !== null ? ` · ★ ${compact(c.stars)}` : ""} · {c.ref} @ {shortSha(c.sha)} · {formatDate(c.analyzedAt)}
                </p>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
