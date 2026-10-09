/**
 * Extension → language mapping and the city colour palette.
 * Colours are tuned for a warm, light "architectural model" ground and are
 * reserved for meaningful visualisation (never for UI chrome).
 */

export type ComplexityFamily = "c" | "hash" | "none";

export interface LanguageInfo {
  id: string;
  name: string;
  color: string;
  family: ComplexityFamily;
}

const L = (id: string, name: string, color: string, family: ComplexityFamily): LanguageInfo => ({ id, name, color, family });

export const LANGUAGES: Record<string, LanguageInfo> = {
  typescript: L("typescript", "TypeScript", "#2f6fb0", "c"),
  javascript: L("javascript", "JavaScript", "#d9a521", "c"),
  python: L("python", "Python", "#3d7f6d", "hash"),
  go: L("go", "Go", "#2aa3b8", "c"),
  rust: L("rust", "Rust", "#b5532c", "c"),
  java: L("java", "Java", "#a2492f", "c"),
  kotlin: L("kotlin", "Kotlin", "#7a5bc4", "c"),
  swift: L("swift", "Swift", "#e0663a", "c"),
  c: L("c", "C", "#5d6b78", "c"),
  cpp: L("cpp", "C++", "#c2416b", "c"),
  csharp: L("csharp", "C#", "#3f8f3a", "c"),
  ruby: L("ruby", "Ruby", "#a8282e", "hash"),
  php: L("php", "PHP", "#6c72a8", "c"),
  scala: L("scala", "Scala", "#c63a3a", "c"),
  dart: L("dart", "Dart", "#1b8ac7", "c"),
  shell: L("shell", "Shell", "#6a8f3a", "hash"),
  html: L("html", "HTML", "#d4593a", "none"),
  css: L("css", "CSS", "#7b4ea3", "none"),
  vue: L("vue", "Vue", "#3f9b6e", "c"),
  svelte: L("svelte", "Svelte", "#e2552b", "c"),
  markdown: L("markdown", "Markdown", "#8b8f94", "none"),
  json: L("json", "JSON", "#a9a07e", "none"),
  yaml: L("yaml", "YAML", "#b37f8f", "none"),
  toml: L("toml", "TOML", "#9a7c5c", "none"),
  sql: L("sql", "SQL", "#c78a2c", "none"),
  other: L("other", "Other", "#a7a39b", "none"),
};

const EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", pyi: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin", kts: "kotlin",
  swift: "swift",
  c: "c", h: "c",
  cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp",
  cs: "csharp",
  rb: "ruby", rake: "ruby",
  php: "php",
  scala: "scala", sc: "scala",
  dart: "dart",
  sh: "shell", bash: "shell", zsh: "shell", fish: "shell",
  html: "html", htm: "html",
  css: "css", scss: "css", sass: "css", less: "css",
  vue: "vue",
  svelte: "svelte",
  md: "markdown", mdx: "markdown", markdown: "markdown", rst: "markdown",
  json: "json", jsonc: "json", json5: "json",
  yml: "yaml", yaml: "yaml",
  toml: "toml",
  sql: "sql",
};

const FILENAMES: Record<string, string> = {
  Dockerfile: "shell",
  Makefile: "shell",
  Rakefile: "ruby",
  Gemfile: "ruby",
};

export function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

export function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function detectLanguage(path: string): string {
  const byName = FILENAMES[basename(path)];
  if (byName) return byName;
  return EXT[extensionOf(path)] ?? "other";
}

export function languageInfo(id: string): LanguageInfo {
  return LANGUAGES[id] ?? LANGUAGES.other!;
}
