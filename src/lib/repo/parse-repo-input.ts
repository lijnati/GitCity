/**
 * Normalises user input into a validated `{ owner, repo }` pair.
 * Accepted: `owner/repo`, `github.com/owner/repo`, `https://github.com/owner/repo(.git)(/tree/...)`.
 * The result is the only thing ever used to build GitHub API URLs; the raw input
 * is never fetched.
 */

export interface RepoId {
  owner: string;
  repo: string;
}

export type ParseResult = { ok: true; value: RepoId } | { ok: false; error: string };

// GitHub usernames: alphanumerics and single hyphens, no leading/trailing hyphen, ≤ 39 chars.
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
// Repository names: letters, digits, '.', '-', '_' (≤ 100 chars).
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/** First path segments on github.com that are product pages, not users. */
const RESERVED_OWNERS = new Set([
  "about", "apps", "collections", "contact", "customer-stories", "enterprise", "explore",
  "features", "issues", "login", "marketplace", "new", "notifications", "orgs", "organizations",
  "pricing", "pulls", "search", "settings", "site", "sponsors", "topics", "trending",
]);

export const MAX_INPUT_LENGTH = 256;

export function parseRepoInput(raw: string): ParseResult {
  if (typeof raw !== "string") return fail("Enter a repository like owner/name.");
  let input = raw.trim();
  if (input.length === 0) return fail("Enter a repository like owner/name.");
  if (input.length > MAX_INPUT_LENGTH) return fail("That input is too long to be a GitHub repository URL.");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(input)) return fail("Repository URLs cannot contain spaces or control characters.");

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(input);
  if (schemeMatch) {
    const scheme = schemeMatch[1]!.toLowerCase();
    if (scheme !== "https" && scheme !== "http") return fail("Only github.com URLs are supported.");
    input = input.slice(schemeMatch[0].length);
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^github\.com/i.test(input)) {
    // e.g. `git@github.com:owner/repo`, `javascript:...`, `file:...`
    return fail("Use an https://github.com URL or owner/name.");
  }

  // Drop query string and fragment.
  input = input.replace(/[?#].*$/, "");

  const segments = input.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return fail("Enter a repository like owner/name.");

  const first = segments[0]!;
  const looksLikeHost = first.includes(".") || first.includes(":") || first.includes("@");
  if (looksLikeHost) {
    const host = first.toLowerCase();
    if (!GITHUB_HOSTS.has(host)) return fail("Only public repositories on github.com are supported.");
    segments.shift();
  }

  if (segments.length < 2) return fail("Include both the owner and the repository name, like owner/name.");

  const owner = segments[0]!;
  let repo = segments[1]!;
  if (repo.toLowerCase().endsWith(".git")) repo = repo.slice(0, -4);

  if (!OWNER_RE.test(owner)) return fail(`“${truncate(owner)}” is not a valid GitHub owner.`);
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return fail("That is a GitHub page, not a repository.");
  if (!REPO_RE.test(repo) || repo === "." || repo === "..") {
    return fail(`“${truncate(repo)}” is not a valid repository name.`);
  }

  return { ok: true, value: { owner, repo } };
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

function truncate(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

export function isValidRepoId(owner: string, repo: string): boolean {
  return OWNER_RE.test(owner) && REPO_RE.test(repo) && repo !== "." && repo !== ".." && !RESERVED_OWNERS.has(owner.toLowerCase());
}
