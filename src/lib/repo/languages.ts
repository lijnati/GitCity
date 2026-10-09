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
  rust: L("rust", "Rust", "#ad4a26", "c"),
  java: L("java", "Java", "#a2492f", "c"),
  kotlin: L("kotlin", "Kotlin", "#6a5fd0", "c"),
  swift: L("swift", "Swift", "#ef8a34", "c"),
  c: L("c", "C", "#5d6b78", "c"),
  cpp: L("cpp", "C++", "#c2416b", "c"),
  csharp: L("csharp", "C#", "#3f8f3a", "c"),
  ruby: L("ruby", "Ruby", "#a8282e", "hash"),
  php: L("php", "PHP", "#6c72a8", "c"),
  scala: L("scala", "Scala", "#c63a3a", "c"),
  dart: L("dart", "Dart", "#1b8ac7", "c"),
  shell: L("shell", "Shell", "#6a8f3a", "hash"),
  html: L("html", "HTML", "#d0678c", "none"),
  css: L("css", "CSS", "#9a4fae", "none"),
  vue: L("vue", "Vue", "#3f9b6e", "c"),
  svelte: L("svelte", "Svelte", "#e2552b", "c"),
  markdown: L("markdown", "Markdown", "#8d9399", "none"),
  json: L("json", "JSON", "#b3aa86", "none"),
  yaml: L("yaml", "YAML", "#b49ea4", "none"),
  toml: L("toml", "TOML", "#a38f76", "none"),
  sql: L("sql", "SQL", "#c78a2c", "none"),
  xml: L("xml", "XML", "#8a7a5e", "none"),
  config: L("config", "Config", "#b8b09e", "none"),
  text: L("text", "Plain text", "#c4bfb4", "none"),
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
  ps1: "shell", bat: "shell", cmd: "shell",
  xml: "xml", plist: "xml", xsd: "xml", storyboard: "xml", xib: "xml", wxs: "xml", wxl: "xml", csproj: "xml",
  ini: "config", cfg: "config", conf: "config", properties: "config", editorconfig: "config", env: "config",
  gitignore: "config", gitattributes: "config", npmignore: "config", dockerignore: "config", prettierignore: "config",
  eslintignore: "config", prettierrc: "config", npmrc: "config", nvmrc: "config", taurignore: "config",
  txt: "text",
};

const FILENAMES: Record<string, string> = {
  Dockerfile: "shell",
  Makefile: "shell",
  Rakefile: "ruby",
  Gemfile: "ruby",
  Podfile: "ruby",
  CODEOWNERS: "config",
  LICENSE: "text",
  NOTICE: "text",
  AUTHORS: "text",
};

export function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  // Dotfiles such as `.gitignore` use the part after the leading dot.
  if (dot === 0) return name.slice(1).toLowerCase();
  if (dot < 0 || dot === name.length - 1) return "";
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
  const name = basename(path);
  const byName = FILENAMES[name];
  if (byName) return byName;
  if (/^(?:LICEN[CS]E|COPYING)(?:[-.]|$)/i.test(name)) return "text";
  if (/^Dockerfile(?:\.|$)/.test(name)) return "shell";
  return EXT[extensionOf(path)] ?? "other";
}

export function languageInfo(id: string): LanguageInfo {
  return LANGUAGES[id] ?? LANGUAGES.other!;
}
