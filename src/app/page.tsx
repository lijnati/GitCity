import Link from "next/link";
import { GitHubMark } from "@/components/github-mark";
import { RecentCities } from "@/components/landing/recent-cities";
import { RepoForm } from "@/components/landing/repo-form";
import { LandingPreview } from "@/components/landing/preview";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { formatNumber } from "@/lib/format";
import { sampleSnapshot } from "@/lib/sample";
import { SITE } from "@/lib/site";

/** The "Recently built" strip reads storage; rebuild at most every five minutes, like the gallery. */
export const revalidate = 300;

const LEGEND = [
  { n: "01", term: "Building", def: "One source file. Files are never invented or duplicated; each building links to the exact file on GitHub." },
  { n: "02", term: "Height", def: "Lines of code, counted from the file’s real contents and scaled as log₂(1 + lines), so huge files stay readable." },
  { n: "03", term: "Footprint", def: "File size in bytes, exactly as Git stores it, scaled by square root and clamped to a sensible range." },
  { n: "04", term: "Colour", def: "Programming language, detected from the file name. Colour is reserved for data; the interface stays neutral." },
  { n: "05", term: "Neighborhood", def: "A directory. Sub-directories nest inside their parents as stepped plinths, separated by streets." },
  { n: "06", term: "Stripes", def: "A value GitCity could not measure, or small files merged to respect the rendering budget. Always disclosed." },
];

const MEASURES = [
  { metric: "File size", source: "Git tree API", kind: "Exact" },
  { metric: "Lines of code", source: "File contents (one streamed archive, ≤ 1 MB per file)", kind: "Exact or unavailable" },
  { metric: "Commits & last change", source: "The most recent commits on the default branch", kind: "Exact within that window" },
  { metric: "Complexity", source: "Keyword-based decision-point count", kind: "Estimate" },
];

export default function Home() {
  const examples = ["vercel/next.js", "facebook/react", "honojs/hono"];
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-5 md:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-[14px]" aria-label="Primary">
          <Link href="/sample" className="rounded-sm px-3 py-2 text-ink-2 hover:text-ink">
            Sample city
          </Link>
          <Link href="/gallery" className="rounded-sm px-3 py-2 text-ink-2 hover:text-ink">
            Gallery
          </Link>
          <a href="#how-to-read" className="hidden rounded-sm px-3 py-2 text-ink-2 hover:text-ink sm:block">
            How to read it
          </a>
          <a href={SITE.source} className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-ink-2 hover:text-ink" target="_blank" rel="noopener noreferrer">
            <GitHubMark /> <span className="hidden sm:inline">Source</span>
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1320px] gap-10 border-t border-line px-5 pb-16 pt-10 md:px-8 md:pt-16 lg:grid-cols-12 lg:gap-12 lg:pb-24">
          <div className="lg:col-span-5 lg:pt-6">
            <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">Repository cartography</p>
            <h1 className="mt-5 text-[clamp(2.9rem,7vw,5.6rem)] font-semibold leading-[0.92] tracking-[-0.045em] text-ink">
              Every codebase is a&nbsp;city.
            </h1>
            <p className="mt-6 max-w-[34rem] text-[17px] leading-[1.55] text-ink-2 md:text-[18px]">
              Turn any public GitHub repository into an interactive 3D world. Explore its structure, discover complexity, and see how code comes together.
            </p>
            <RepoForm className="mt-9 max-w-[34rem]" />
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
              <Link href="/sample" className="font-medium text-ink underline decoration-accent decoration-2 underline-offset-[5px] hover:text-accent-ink">
                Try the sample city
              </Link>
              <span className="text-faint" aria-hidden>
                /
              </span>
              {examples.map((e) => (
                <Link key={e} href={`/city/${e}`} className="font-mono text-[12.5px] text-muted hover:text-ink">
                  {e}
                </Link>
              ))}
            </div>
          </div>
          <div className="h-[420px] sm:h-[520px] lg:col-span-7 lg:h-[620px]">
            <LandingPreview snapshot={sampleSnapshot} />
          </div>
        </section>

        <RecentCities />

        <section id="how-to-read" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-[1320px] px-5 py-16 md:px-8 md:py-24">
            <div className="grid gap-8 lg:grid-cols-12">
              <h2 className="text-[34px] font-semibold leading-[1] tracking-[-0.035em] lg:col-span-4 lg:text-[44px]">How to read the city</h2>
              <p className="max-w-[40rem] text-[16px] leading-relaxed text-ink-2 lg:col-span-6 lg:col-start-6">
                Every visual property maps to one documented metric. The same repository snapshot always produces the same city, so a link to{" "}
                <span className="font-mono text-[14px]">/city/owner/repo</span> rebuilds a familiar skyline.
              </p>
            </div>
            <dl className="mt-12 grid border-t border-ink sm:grid-cols-2 lg:grid-cols-3">
              {LEGEND.map((l) => (
                <div key={l.n} className="border-b border-line py-6 sm:pr-8 lg:[&:nth-child(3n+2)]:px-8 lg:[&:nth-child(3n+3)]:pl-8 lg:[&:nth-child(3n+3)]:pr-0">
                  <dt className="flex items-baseline gap-3">
                    <span className="font-mono text-[12px] text-accent">{l.n}</span>
                    <span className="text-[20px] font-semibold tracking-[-0.015em]">{l.term}</span>
                  </dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-ink-2">{l.def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 className="text-[34px] font-semibold leading-[1] tracking-[-0.035em] lg:text-[44px]">What’s measured — and what isn’t</h2>
              <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
                GitCity never fills gaps with guesses. When a value can’t be measured within safe limits, the building is drawn flat and striped and the
                detail panel says why.
              </p>
            </div>
            <div className="overflow-x-auto lg:col-span-7 lg:col-start-6">
              <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
                <thead>
                  <tr className="border-b border-ink">
                    <th scope="col" className="py-3 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Metric</th>
                    <th scope="col" className="py-3 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Source</th>
                    <th scope="col" className="py-3 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {MEASURES.map((m) => (
                    <tr key={m.metric} className="border-b border-line">
                      <td className="py-4 pr-4 font-medium">{m.metric}</td>
                      <td className="py-4 pr-4 text-ink-2">{m.source}</td>
                      <td className="py-4 font-mono text-[13px]">{m.kind}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-5 text-[13px] leading-relaxed text-muted">
                Dependencies, build output, lockfiles, binaries and generated code are excluded and counted. Very large repositories are drawn with their
                smallest files merged into marked blocks — at most {formatNumber(5000)} buildings on desktop.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 px-5 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between md:px-8">
          <Logo />
          <p>
            Open source. Reads public data from the GitHub API; never runs repository code. Sample: {sampleSnapshot.repo.owner}/{sampleSnapshot.repo.name}.
          </p>
        </div>
      </footer>
    </div>
  );
}
