import Link from "next/link";
import type { PublicError } from "@/lib/types";

const TITLES: Record<string, string> = {
  invalid_input: "That doesn’t look like a GitHub repository",
  not_found: "Repository not found",
  empty: "This repository is empty",
  rate_limited: "GitHub rate limit reached",
  too_many_requests: "Slow down a little",
  too_large: "This repository is too large",
  timeout: "GitHub took too long",
  network: "Couldn’t reach GitHub",
  upstream: "GitHub returned an error",
  unavailable_for_legal_reasons: "Repository unavailable",
  snapshot_not_found: "No saved snapshot at this commit",
};

export function ErrorState({ error, repo, onRetry }: { error: PublicError; repo: string; onRetry?: () => void }) {
  const retryable = ["rate_limited", "too_many_requests", "timeout", "network", "upstream"].includes(error.code);
  return (
    <div className="mx-auto w-full max-w-[520px]" role="alert" data-testid="error-state">
      <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-accent">{error.code.replace(/_/g, " ")}</p>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{TITLES[error.code] ?? "Something went wrong"}</h1>
      <p className="mt-3 break-all font-mono text-[13px] text-muted">{repo}</p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{error.message}</p>
      {error.retryAt && (
        <p className="mt-2 text-[14px] text-ink-2">
          Try again after <time dateTime={new Date(error.retryAt).toISOString()}>{new Date(error.retryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>.
        </p>
      )}
      <div className="mt-8 flex flex-wrap gap-2">
        {retryable && onRetry && (
          <button type="button" onClick={onRetry} className="h-10 rounded-sm bg-ink px-4 text-[14px] font-medium text-paper hover:bg-ink-2">
            Try again
          </button>
        )}
        {error.code === "snapshot_not_found" && (
          <Link
            href={`/city/${repo.split("/").map(encodeURIComponent).join("/")}`}
            className="inline-flex h-10 items-center rounded-sm bg-ink px-4 text-[14px] font-medium text-paper hover:bg-ink-2"
          >
            Build the current city
          </Link>
        )}
        <Link href="/sample" className="inline-flex h-10 items-center rounded-sm border border-line-strong px-4 text-[14px] font-medium hover:border-ink">
          Explore the sample city
        </Link>
        <Link href="/" className="inline-flex h-10 items-center rounded-sm px-3 text-[14px] text-muted hover:text-ink">
          Try another repository
        </Link>
      </div>
    </div>
  );
}
