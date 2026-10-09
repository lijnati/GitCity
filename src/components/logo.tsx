import Link from "next/link";

/** Wordmark: a 2×2 block plan with one tower, set beside the name. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2 rounded-xs text-ink" aria-label="GitCity home">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="1" y="9" width="8" height="10" fill="currentColor" />
        <rect x="11" y="1" width="8" height="18" fill="var(--color-accent)" />
        <rect x="1" y="1" width="8" height="6" fill="currentColor" opacity="0.35" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">GitCity</span>
    </Link>
  );
}
