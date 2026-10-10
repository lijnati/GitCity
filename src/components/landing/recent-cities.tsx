import Link from "next/link";
import { CityCard } from "@/components/city-card";
import { getSnapshotStore, type CitySummary } from "@/lib/snapshot-store";

const LIMIT = 6;

/**
 * "Recently built" strip for the landing page. Renders nothing when storage has no
 * cities or can't be read, so the landing page never depends on it.
 */
export async function RecentCities({ load = () => getSnapshotStore().listRecent(LIMIT) }: { load?: () => Promise<CitySummary[]> }) {
  let cities: CitySummary[];
  try {
    cities = (await load()).slice(0, LIMIT);
  } catch (err) {
    console.error("[landing] recent cities unavailable", err);
    return null;
  }
  if (cities.length === 0) return null;
  return (
    <section className="border-t border-line" aria-labelledby="recent-title" data-testid="recent-cities">
      <div className="mx-auto max-w-[1320px] px-5 py-16 md:px-8 md:py-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">Gallery</p>
            <h2 id="recent-title" className="mt-3 text-[34px] font-semibold leading-[1] tracking-[-0.035em] lg:text-[44px]">
              Recently built
            </h2>
          </div>
          <Link href="/gallery" className="shrink-0 py-2 text-[14px] font-medium text-ink underline decoration-accent decoration-2 underline-offset-[5px] hover:text-accent-ink">
            View all →
          </Link>
        </div>
        <ul className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((c) => (
            <CityCard key={`${c.owner}/${c.name}`} city={c} />
          ))}
        </ul>
      </div>
    </section>
  );
}
