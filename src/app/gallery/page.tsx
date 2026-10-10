import type { Metadata } from "next";
import Link from "next/link";
import { CityCard } from "@/components/city-card";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
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
          {cities.map((c) => (
            <CityCard key={`${c.owner}/${c.name}`} city={c} />
          ))}
        </ul>
      </main>
    </div>
  );
}
