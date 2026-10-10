import Link from "next/link";
import { compact, formatDate, formatNumber, shortSha } from "@/lib/format";
import { languageInfo } from "@/lib/repo/languages";
import type { CitySummary } from "@/lib/snapshot-store";

/**
 * One built city: its card image (light and dark, from stored snapshots only),
 * name, description, language mix and stats. Used by the gallery and the landing page.
 */
export function CityCard({ city: c }: { city: CitySummary }) {
  const path = `${encodeURIComponent(c.owner)}/${encodeURIComponent(c.name)}`;
  const total = c.languages.reduce((s, l) => s + l.files, 0) || 1;
  return (
    <li className="group" data-testid="city-card">
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
}
