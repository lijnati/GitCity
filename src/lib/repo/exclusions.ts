import { basename, extensionOf } from "./languages";

/**
 * Configurable rules for files that should not become buildings.
 * Excluded files are still counted (by reason) so the city never pretends
 * to be the whole repository.
 */
export interface ExclusionConfig {
  /** Any path segment equal to one of these excludes the file. */
  directories: string[];
  /** Exact file names. */
  filenames: string[];
  /** Lower-case extensions without dot. */
  extensions: string[];
  /** File-name suffixes (e.g. `.min.js`). */
  suffixes: string[];
}

export const DEFAULT_EXCLUSIONS: ExclusionConfig = {
  directories: [
    "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".turbo",
    "coverage", ".nyc_output", "vendor", "vendors", "third_party", "third-party", "bower_components",
    "__pycache__", ".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache", "target", ".gradle",
    ".idea", ".vscode", "Pods", ".cache", ".parcel-cache",
  ],
  filenames: [
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "npm-shrinkwrap.json",
    "Cargo.lock", "Gemfile.lock", "composer.lock", "poetry.lock", "Pipfile.lock", "go.sum", "uv.lock",
    "flake.lock", "mix.lock", "pubspec.lock", "Podfile.lock", "packages.lock.json", ".DS_Store",
  ],
  extensions: [
    // binary / media / archives — not source code
    "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "tiff", "psd",
    "mp3", "mp4", "mov", "webm", "wav", "ogg", "flac",
    "woff", "woff2", "ttf", "otf", "eot",
    "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "jar", "war",
    "pdf", "exe", "dll", "so", "dylib", "bin", "class", "o", "a", "wasm", "pyc",
    "map", "snap",
  ],
  suffixes: [".min.js", ".min.css", ".bundle.js", ".chunk.js", ".pb.go", "_pb2.py", ".g.dart", ".freezed.dart"],
};

export type ExclusionReason = "directory" | "lockfile" | "binary-or-asset" | "generated" | "minified";

export function exclusionReason(path: string, config: ExclusionConfig = DEFAULT_EXCLUSIONS): ExclusionReason | null {
  const segments = path.split("/");
  const dirs = segments.slice(0, -1);
  for (const d of dirs) if (config.directories.includes(d)) return "directory";
  const name = basename(path);
  if (config.filenames.includes(name)) return "lockfile";
  const lower = name.toLowerCase();
  for (const suffix of config.suffixes) {
    if (lower.endsWith(suffix)) return suffix.startsWith(".min") ? "minified" : "generated";
  }
  if (config.extensions.includes(extensionOf(path))) return "binary-or-asset";
  return null;
}

/** Cheap marker check on the first bytes of a file's contents. */
export function hasGeneratedMarker(head: string): boolean {
  return /@generated\b/.test(head) || /\bDO NOT EDIT\b/.test(head) || /\bauto-generated\b/i.test(head) && /\bdo not (?:edit|modify)\b/i.test(head);
}
