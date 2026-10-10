import type { ImportFamily, ImportGraph, RepoFile } from "@/lib/types";
import { basename, dirname } from "./languages";

/**
 * Dependency layer: import statements → file-to-file edges.
 *
 * Supported: JavaScript/TypeScript (incl. Vue/Svelte files), Python, Rust and Go.
 * Extraction is lexical (comments stripped, then statement patterns matched), not
 * a full parse. Resolution mirrors the common rules:
 *   JS/TS   relative paths with extension/index probing (and `.js` → `.ts` for ESM
 *           TypeScript), the nearest tsconfig/jsconfig `baseUrl` + `paths`, and
 *           packages of the same repository (workspaces) by package.json name.
 *   Python  relative imports from the file's package, and absolute modules from the
 *           repository root, `src/`, or the directory above the file's top package.
 *   Rust    `mod x;` declarations (x.rs or x/mod.rs), and `use` paths through the
 *           module tree: `crate::`, `super::`, `self::`, modules declared in the same
 *           file, and crates of the same repository by Cargo.toml `[package] name`.
 *           A path points at the deepest module file that exists along it; the rest
 *           names an item (or inline module) declared in that file.
 *   Go      import paths under a go.mod `module` prefix resolve to that package
 *           directory, with one edge to every non-test .go file in it: a Go import
 *           depends on the whole package, so no single file is picked.
 * Anything else is counted as external (third-party or standard library) or
 * unresolved; nothing is guessed. Code is only read as text, never executed.
 */

export type { ImportFamily };

/** Every family this version reads, in display order. */
export const IMPORT_FAMILIES: readonly ImportFamily[] = ["js", "python", "rust", "go"];
const FAMILY_LABELS: Record<ImportFamily, string> = { js: "JS/TS", python: "Python", rust: "Rust", go: "Go" };

export function importFamily(language: string): ImportFamily | null {
  if (language === "typescript" || language === "javascript" || language === "vue" || language === "svelte") return "js";
  if (language === "python") return "python";
  if (language === "rust") return "rust";
  if (language === "go") return "go";
  return null;
}

/** Families a stored graph actually scanned; graphs made before Rust and Go support scanned JS/TS and Python only. */
export function scannedFamilies(graph: Pick<ImportGraph, "languages">): ImportFamily[] {
  return graph.languages ?? ["js", "python"];
}

/** "JS/TS, Python, Rust and Go" (or "… or Go" with `joiner: "or"`). */
export function familiesLabel(families: readonly ImportFamily[], joiner: "and" | "or" = "and"): string {
  const names = families.map((f) => FAMILY_LABELS[f]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${joiner} ${names.at(-1)}`;
}

const MAX_SPECIFIERS_PER_FILE = 400;
const MAX_EDGES = 60_000;
const MAX_CONFIG_BYTES = 128 * 1024;

// ---------------------------------------------------------------- extraction

/** Removes // and /* *\/ comments while leaving string and template literals intact. */
export function stripJsComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out += " ";
    } else if (c === '"' || c === "'" || c === "`") {
      const start = i;
      i++;
      while (i < n) {
        const d = src[i];
        if (d === "\\") {
          i += 2;
          continue;
        }
        i++;
        if (d === c || (d === "\n" && c !== "`")) break;
      }
      out += src.slice(start, i);
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const JS_PATTERNS = [
  // import x from "a"; import { a, b } from "a"; import type X from "a"; import * as x from "a"; import "a"
  /\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"'\n]+)["']/g,
  // export * from "a"; export { a } from "a"; export type { A } from "a"
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s+["']([^"'\n]+)["']/g,
  // require("a"), import("a"), and `import x = require("a")`
  /\b(?:require|import)\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
];

function stripPythonComments(src: string): string {
  // Drop comments and string literals, but keep line structure for statement matching.
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
    } else if ((c === '"' || c === "'") && src[i + 1] === c && src[i + 2] === c) {
      const end = src.indexOf(c.repeat(3), i + 3);
      const stop = end === -1 ? n : end + 3;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i++;
      out += '""';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * Removes Rust comments (block comments nest) and blanks string and char literals,
 * keeping lifetimes (`'a`) intact. Only statement structure matters here.
 */
export function stripRustComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (src[i] === "/" && src[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (src[i] === "*" && src[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      out += " ";
    } else if ((c === "r" || c === "b") && !/[\w$]/.test(src[i - 1] ?? "") && RAW_STRING.test(src.slice(i, i + 260))) {
      // Raw string: r"…", r#"…"#, br##"…"## (no escapes inside).
      const head = RAW_STRING.exec(src.slice(i, i + 260))!;
      const close = '"' + head[1];
      const end = src.indexOf(close, i + head[0].length);
      i = end === -1 ? n : end + close.length;
      out += '""';
    } else if (c === '"') {
      i++;
      while (i < n && src[i] !== '"') i += src[i] === "\\" ? 2 : 1;
      i++;
      out += '""';
    } else if (c === "'") {
      // A char literal ('x', '\n', '\u{1F600}') or a lifetime ('a, 'static).
      const lit = CHAR_LITERAL.exec(src.slice(i, i + 16));
      if (lit) {
        i += lit[0].length;
        out += "' '";
      } else {
        out += c;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const RAW_STRING = /^b?r(#*)"/;
const CHAR_LITERAL = /^'(?:\\(?:u\{[0-9a-fA-F]{1,6}\}|x[0-9a-fA-F]{2}|.)|[^\\'\n])'/u;

/**
 * Expands a Rust `use` tree (`a::{b::C, d::{self, E as F}, *}`) into its leaf paths.
 * `self` leaves and globs stand for their parent path; `as` renames are dropped.
 * A leading `::` is kept as an empty first segment.
 */
export function expandUseTree(tree: string): string[][] {
  const src = tree.replace(/\s+as\s+(?:r#)?[A-Za-z_]\w*/g, "").replace(/\s+/g, "");
  const out: string[][] = [];
  let i = 0;
  const parse = (prefix: string[]): void => {
    const segs = [...prefix];
    if (segs.length === 0 && src.startsWith("::", i)) {
      segs.push("");
      i += 2;
    }
    for (;;) {
      if (src[i] === "{") {
        i++;
        while (i < src.length && src[i] !== "}") {
          const before = i;
          parse(segs);
          if (src[i] === ",") i++;
          else if (src[i] !== "}" || i === before) return;
        }
        i++;
        return;
      }
      const m = /^(?:r#)?([A-Za-z_$][\w$]*|\*)/.exec(src.slice(i));
      if (!m) return;
      i += m[0].length;
      const seg = m[1]!;
      // `a::{self}` and `a::*` stand for `a`; a bare `self`/`super`/`crate` starts a path.
      if (seg !== "*" && !(seg === "self" && segs.length > 0)) segs.push(seg);
      if (src.startsWith("::", i)) {
        i += 2;
        continue;
      }
      if (segs.length > 0 && !(segs.length === 1 && segs[0] === "")) out.push(segs);
      return;
    }
  };
  while (i < src.length) {
    const before = i;
    parse([]);
    if (src[i] === ",") i++;
    if (i === before) break;
  }
  return out;
}

const RUST_MOD = /(?<![\w:.$])mod\s+(?:r#)?([A-Za-z_]\w*)\s*;/g;
const RUST_INLINE_MOD = /(?<![\w:.$])mod\s+(?:r#)?[A-Za-z_]\w*\s*\{/g;
const RUST_USE =/(?<![\w:.$])use\s+([^;]+);/g;
const RUST_EXTERN = /(?<![\w:.$])extern\s+crate\s+(?:r#)?([A-Za-z_]\w*)/g;

const GO_IMPORT_BLOCK = /(?<![\w.])import\s*\(([^)]*)\)/g;
const GO_IMPORT_LINE = /(?<![\w.])import\s+(?:[\w.]+\s+)?(?:"([^"\n]+)"|`([^`]+)`)/g;
const GO_PATH = /"([^"\n]+)"|`([^`]+)`/g;

/**
 * Raw import specifiers in source order, deduplicated.
 * Python specifiers are encoded as `module` (import a.b) or `from:module:name1,name2`.
 * Rust specifiers are `mod:name` (a `mod name;` declaration) or `use:a::b::c` (one
 * leaf of a `use` tree, or an `extern crate`). Go specifiers are the import path.
 */
export function extractSpecifiers(text: string, family: ImportFamily): string[] {
  const out = new Set<string>();
  if (family === "js") {
    const code = stripJsComments(text);
    for (const re of JS_PATTERNS) {
      re.lastIndex = 0;
      for (const m of code.matchAll(re)) {
        if (out.size >= MAX_SPECIFIERS_PER_FILE) break;
        out.add(m[1]!.trim());
      }
    }
    return [...out];
  }
  if (family === "rust") {
    const code = stripRustComments(text);
    const add = (s: string) => {
      if (out.size < MAX_SPECIFIERS_PER_FILE) out.add(s);
    };
    for (const m of code.matchAll(RUST_MOD)) add(`mod:${m[1]}`);
    for (const m of code.matchAll(RUST_EXTERN)) if (m[1] !== "self") add(`use:${m[1]}`);
    // Brace ranges of inline modules (`mod tests { … }`): `self`/`super` inside them
    // are relative to the inline module, not to the file.
    const inline: [number, number][] = [];
    for (const m of code.matchAll(RUST_INLINE_MOD)) {
      let depth = 0;
      let j = m.index + m[0].length - 1;
      for (; j < code.length; j++) {
        if (code[j] === "{") depth++;
        else if (code[j] === "}" && --depth === 0) break;
      }
      inline.push([m.index, j]);
    }
    for (const m of code.matchAll(RUST_USE)) {
      const nesting = inline.filter(([s, e]) => m.index > s && m.index < e).length;
      for (const raw of expandUseTree(m[1]!)) {
        // Macro-internal paths (`$crate::…`) are not imports of this file.
        if (raw.some((x) => x.includes("$"))) continue;
        let segs = raw;
        if (nesting > 0 && (segs[0] === "self" || segs[0] === "super")) {
          let k = segs[0] === "self" ? 1 : 0;
          let level = nesting;
          while (segs[k] === "super" && level > 0) {
            k++;
            level--;
          }
          // Still inside an inline module of this file: the target is this file.
          segs = level > 0 ? ["self"] : segs[k] === "super" ? segs.slice(k) : ["self", ...segs.slice(k)];
        }
        add(`use:${segs.join("::")}`);
      }
    }
    return [...out];
  }
  if (family === "go") {
    const code = stripJsComments(text);
    for (const m of code.matchAll(GO_IMPORT_BLOCK)) {
      for (const p of m[1]!.matchAll(GO_PATH)) if (out.size < MAX_SPECIFIERS_PER_FILE) out.add((p[1] ?? p[2])!.trim());
    }
    for (const m of code.matchAll(GO_IMPORT_LINE)) if (out.size < MAX_SPECIFIERS_PER_FILE) out.add((m[1] ?? m[2])!.trim());
    return [...out];
  }
  // Join backslash and parenthesised continuations so multi-line imports read as one.
  const code = stripPythonComments(text)
    .replace(/\\\r?\n/g, " ")
    .replace(/\(([^()]*)\)/g, (_, inner: string) => `(${inner.replace(/\r?\n/g, " ")})`);
  for (const line of code.split("\n")) {
    if (out.size >= MAX_SPECIFIERS_PER_FILE) break;
    const from = /^\s*from\s+(\.*[\w.]*)\s+import\s+\(?([^)]*)\)?/.exec(line);
    if (from) {
      const names = from[2]!
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/)[0]!.trim())
        .filter((s) => /^[\w]+$/.test(s));
      out.add(`from:${from[1]}:${names.join(",")}`);
      continue;
    }
    const imp = /^\s*import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)\s*$/.exec(line);
    if (imp) {
      for (const part of imp[1]!.split(",")) {
        const mod = part.trim().split(/\s+as\s+/)[0]!.trim();
        if (mod) out.add(mod);
      }
    }
  }
  return [...out];
}

// ---------------------------------------------------------------- resolution

/** Collapses `.` and `..` segments; null when the path escapes the repository. */
export function normalizePath(path: string): string | null {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}

const join = (a: string, b: string) => (a ? `${a}/${b}` : b);

const JS_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".d.ts"];
const JS_TO_TS: Record<string, string[]> = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };

interface TsConfig {
  dir: string;
  baseUrl: string | null;
  paths: [string, string[]][];
}

/** JSON with comments and trailing commas (tsconfig style). Returns null when unparsable. */
export function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(stripJsComments(text).replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return null;
  }
}

/** `[package] name` from a Cargo.toml, read line by line; null when absent. */
export function parseCargoPackageName(text: string): string | null {
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const header = /^\[([^\]]*)\]/.exec(line);
    if (header) {
      section = header[1]!.trim();
      continue;
    }
    if (section !== "package") continue;
    const m = /^name\s*=\s*(?:"([^"]+)"|'([^']+)')$/.exec(line);
    if (m) return (m[1] ?? m[2])!;
  }
  return null;
}

/** The `module` path from a go.mod; null when absent. */
export function parseGoModule(text: string): string | null {
  const m = /^\s*module\s+(?:"([^"\s]+)"|(\S+))/m.exec(stripJsComments(text));
  return m ? (m[1] ?? m[2])! : null;
}

const RUST_EXTERNAL_ROOTS = new Set(["std", "core", "alloc", "proc_macro", "test"]);
const RUST_ITEM = /(?<![\w:.$])(?:mod|enum|struct|trait|type|union)\s+(?:r#)?([A-Za-z_]\w*)/g;

export class ImportCollector {
  private readonly specs = new Map<string, { family: ImportFamily; list: string[] }>();
  private readonly tsconfigs = new Map<string, TsConfig>();
  private readonly packages = new Map<string, { dir: string; entries: string[] }>();
  /** Directory of every Cargo.toml, and crate name (`-` → `_`) → directory. */
  private readonly cargoDirs = new Set<string>();
  private readonly crates = new Map<string, string>();
  /** go.mod directory → module path. */
  private readonly goModules = new Map<string, string>();
  /** Rust file → names declared in it (`mod`, `enum`, `struct`, …). */
  private readonly rustScope = new Map<string, Set<string>>();

  /** Feed every included text file whose contents were read. */
  consider(path: string, language: string, text: string): void {
    const name = basename(path);
    if ((name === "tsconfig.json" || name === "jsconfig.json") && text.length <= MAX_CONFIG_BYTES) this.addTsConfig(path, text);
    else if (name === "package.json" && text.length <= MAX_CONFIG_BYTES) this.addPackage(path, text);
    else if (name === "Cargo.toml" && text.length <= MAX_CONFIG_BYTES) this.addCargo(path, text);
    else if (name === "go.mod" && text.length <= MAX_CONFIG_BYTES) {
      const mod = parseGoModule(text);
      if (mod) this.goModules.set(dirname(path), mod);
    }
    const family = importFamily(language);
    if (!family) return;
    this.specs.set(path, { family, list: extractSpecifiers(text, family) });
    if (family === "rust") {
      // Names a `use` path may start from in this file: its modules and type-like items.
      const scope = new Set<string>();
      for (const m of stripRustComments(text).matchAll(RUST_ITEM)) scope.add(m[1]!);
      this.rustScope.set(path, scope);
    }
  }

  private addTsConfig(path: string, text: string) {
    const json = parseJsonc(text) as { compilerOptions?: { baseUrl?: unknown; paths?: unknown } } | null;
    const dir = dirname(path);
    const opts = json?.compilerOptions;
    const baseUrl = typeof opts?.baseUrl === "string" ? normalizePath(join(dir, opts.baseUrl)) : null;
    const paths: [string, string[]][] = [];
    if (opts?.paths && typeof opts.paths === "object") {
      for (const [k, v] of Object.entries(opts.paths as Record<string, unknown>)) {
        if (Array.isArray(v)) paths.push([k, v.filter((x): x is string => typeof x === "string")]);
      }
    }
    // A tsconfig.json takes precedence over a jsconfig.json in the same directory.
    if (basename(path) === "jsconfig.json" && this.tsconfigs.has(dir)) return;
    this.tsconfigs.set(dir, { dir, baseUrl, paths });
  }

  private addPackage(path: string, text: string) {
    const json = parseJsonc(text) as Record<string, unknown> | null;
    if (!json || typeof json.name !== "string" || !json.name) return;
    const entries: string[] = [];
    for (const key of ["source", "module", "main", "types", "typings"]) if (typeof json[key] === "string") entries.push(json[key] as string);
    const exp = json.exports;
    if (typeof exp === "string") entries.push(exp);
    else if (exp && typeof exp === "object") {
      const dot = (exp as Record<string, unknown>)["."];
      if (typeof dot === "string") entries.push(dot);
      else if (dot && typeof dot === "object") for (const v of Object.values(dot as Record<string, unknown>)) if (typeof v === "string") entries.push(v);
    }
    // First package with a name wins; deterministic because files arrive in a fixed order.
    if (!this.packages.has(json.name)) this.packages.set(json.name, { dir: dirname(path), entries });
  }

  private addCargo(path: string, text: string) {
    const dir = dirname(path);
    this.cargoDirs.add(dir);
    const name = parseCargoPackageName(text);
    // First crate with a name wins; deterministic because files arrive in a fixed order.
    if (name && !this.crates.has(name.replace(/-/g, "_"))) this.crates.set(name.replace(/-/g, "_"), dir);
  }

  /** Resolves collected specifiers against `files` (sorted by path) into an edge list. */
  finish(files: readonly RepoFile[]): ImportGraph {
    const index = new Map<string, number>();
    files.forEach((f, i) => index.set(f.path, i));
    const isFile = (p: string | null): boolean => p !== null && index.has(p);

    const probeJs = (base: string | null): string | null => {
      if (base === null) return null;
      if (isFile(base)) return base;
      for (const ext of JS_EXTS) if (isFile(base + ext)) return base + ext;
      for (const ext of JS_EXTS) if (isFile(join(base, "index" + ext))) return join(base, "index" + ext);
      const dot = base.lastIndexOf(".");
      const ext = dot > base.lastIndexOf("/") ? base.slice(dot) : "";
      for (const alt of JS_TO_TS[ext] ?? []) if (isFile(base.slice(0, dot) + alt)) return base.slice(0, dot) + alt;
      return null;
    };

    const nearestTsConfig = (dir: string): TsConfig | null => {
      for (let d: string | null = dir; d !== null; d = d === "" ? null : dirname(d)) {
        const c = this.tsconfigs.get(d);
        if (c) return c;
      }
      return null;
    };

    const resolveJs = (from: string, spec: string): string | "external" | null => {
      const clean = spec.split(/[?#]/)[0]!;
      if (!clean) return null;
      if (clean.startsWith(".")) return probeJs(normalizePath(join(dirname(from), clean)));
      if (clean.startsWith("/")) return probeJs(normalizePath(clean));
      const cfg = nearestTsConfig(dirname(from));
      if (cfg) {
        const base = cfg.baseUrl ?? cfg.dir;
        for (const [pattern, targets] of cfg.paths) {
          const star = pattern.indexOf("*");
          let rest: string | null = null;
          if (star === -1) rest = pattern === clean ? "" : null;
          else if (clean.startsWith(pattern.slice(0, star)) && clean.endsWith(pattern.slice(star + 1)) && clean.length >= pattern.length - 1)
            rest = clean.slice(star, clean.length - (pattern.length - star - 1));
          if (rest === null) continue;
          for (const t of targets) {
            const hit = probeJs(normalizePath(join(base, star === -1 ? t : t.replace("*", rest))));
            if (hit) return hit;
          }
        }
        if (cfg.baseUrl !== null) {
          const hit = probeJs(normalizePath(join(cfg.baseUrl, clean)));
          if (hit) return hit;
        }
      }
      // Workspace package of this repository?
      const parts = clean.split("/");
      const nameLen = clean.startsWith("@") ? 2 : 1;
      const pkg = this.packages.get(parts.slice(0, nameLen).join("/"));
      if (pkg) {
        const sub = parts.slice(nameLen).join("/");
        if (sub) return probeJs(normalizePath(join(pkg.dir, sub))) ?? probeJs(normalizePath(join(pkg.dir, join("src", sub)))) ?? null;
        for (const e of pkg.entries) {
          const hit = probeJs(normalizePath(join(pkg.dir, e)));
          if (hit) return hit;
        }
        return probeJs(normalizePath(join(pkg.dir, "src/index"))) ?? probeJs(normalizePath(join(pkg.dir, "index")));
      }
      return "external";
    };

    const probePy = (modulePath: string | null): string | null => {
      if (modulePath === null) return null;
      if (isFile(modulePath + ".py")) return modulePath + ".py";
      if (isFile(join(modulePath, "__init__.py"))) return join(modulePath, "__init__.py");
      return null;
    };
    const pyRoots = (from: string): string[] => {
      const roots = new Set<string>(["", "src"]);
      // The directory above the file's outermost package is an import root.
      let dir = dirname(from);
      let top: string | null = null;
      while (dir && isFile(join(dir, "__init__.py"))) {
        top = dir;
        dir = dirname(dir);
      }
      if (top !== null) roots.add(dirname(top));
      roots.add(dirname(from));
      return [...roots];
    };
    const resolvePyAbsolute = (from: string, dotted: string): string | null => {
      const rel = dotted.replace(/\./g, "/");
      for (const root of pyRoots(from)) {
        const hit = probePy(normalizePath(join(root, rel)));
        if (hit) return hit;
      }
      return null;
    };

    const resolvePy = (from: string, spec: string): (string | "external" | null)[] => {
      if (!spec.startsWith("from:")) return [resolvePyAbsolute(from, spec) ?? "external"];
      const [, mod, namesRaw] = spec.split(":") as [string, string, string];
      const names = namesRaw ? namesRaw.split(",") : [];
      const dots = /^\.*/.exec(mod)![0].length;
      const rest = mod.slice(dots);
      let modulePath: string | null;
      if (dots > 0) {
        let base: string | null = dirname(from);
        for (let k = 1; k < dots && base !== null; k++) base = base === "" ? null : dirname(base);
        modulePath = base === null ? null : normalizePath(join(base, rest.replace(/\./g, "/")));
      } else {
        modulePath = null;
        const relPath = rest.replace(/\./g, "/");
        for (const root of pyRoots(from)) {
          const p = normalizePath(join(root, relPath));
          if (p !== null && (probePy(p) || names.some((n) => probePy(join(p, n))))) {
            modulePath = p;
            break;
          }
        }
        if (modulePath === null) return ["external"];
      }
      if (modulePath === null) return [null];
      const hits: (string | null)[] = [];
      let needModule = names.length === 0;
      for (const n of names) {
        const sub = probePy(join(modulePath, n));
        if (sub) hits.push(sub);
        else needModule = true;
      }
      if (needModule) hits.push(probePy(modulePath));
      return hits;
    };

    // Rust: a module is identified by the directory that holds its child modules.
    // Crate roots and mod.rs keep children beside them; Cargo also makes every file
    // directly in tests/, examples/, benches/ and src/bin/ (and build.rs) a crate root.
    const isCargoTargetRoot = (file: string): boolean => {
      const dir = dirname(file);
      if (basename(file) === "build.rs") return this.cargoDirs.has(dir);
      const parent = dirname(dir);
      const leaf = basename(dir);
      if (leaf === "tests" || leaf === "examples" || leaf === "benches") return this.cargoDirs.has(parent);
      return leaf === "bin" && basename(parent) === "src" && this.cargoDirs.has(dirname(parent));
    };
    const childDir = (file: string): string => {
      const name = basename(file);
      return name === "lib.rs" || name === "main.rs" || name === "mod.rs" || isCargoTargetRoot(file)
        ? dirname(file)
        : join(dirname(file), name.slice(0, -".rs".length));
    };
    const moduleFile = (dir: string): string | null => {
      if (isFile(dir + ".rs")) return dir + ".rs";
      if (isFile(join(dir, "mod.rs"))) return join(dir, "mod.rs");
      return null;
    };
    const crateRootIn = (dir: string): string | null => {
      for (const f of ["lib.rs", "main.rs"]) if (isFile(join(dir, f))) return join(dir, f);
      return null;
    };
    const nearestCargo = (dir: string): string | null => {
      for (let d: string | null = dir; d !== null; d = d === "" ? null : dirname(d)) if (this.cargoDirs.has(d)) return d;
      return null;
    };
    /** Follows `segs` down from a module; the deepest module file that exists. */
    const walk = (dir: string, file: string, segs: readonly string[]): string => {
      for (const s of segs) {
        const next = join(dir, s);
        const f = moduleFile(next);
        if (f === null) break;
        dir = next;
        file = f;
      }
      return file;
    };
    const inCrate = (crateDir: string, segs: readonly string[]): string | null => {
      const root = crateRootIn(join(crateDir, "src"));
      return root === null ? null : walk(dirname(root), root, segs);
    };
    const resolveRust = (from: string, spec: string): string | "external" | null => {
      if (spec.startsWith("mod:")) return moduleFile(join(childDir(from), spec.slice(4)));
      const segs = spec.slice(4).split("::");
      const head = segs[0]!;
      if (head === "crate") {
        const cargo = nearestCargo(dirname(from));
        return cargo === null ? null : inCrate(cargo, segs.slice(1));
      }
      if (head === "self" || head === "super") {
        let dir = childDir(from);
        let file = from;
        let k = head === "self" ? 1 : 0;
        for (; segs[k] === "super"; k++) {
          if (dir === "") return null;
          dir = dirname(dir);
          const parent = moduleFile(dir) ?? crateRootIn(dir);
          if (parent === null) return null;
          file = parent;
        }
        return walk(dir, file, segs.slice(k));
      }
      if (head === "") {
        // `::name::…` always names an external or workspace crate.
        const crateDir = this.crates.get(segs[1] ?? "");
        return crateDir === undefined ? "external" : inCrate(crateDir, segs.slice(2));
      }
      if (this.rustScope.get(from)?.has(head)) return walk(childDir(from), from, segs);
      if (RUST_EXTERNAL_ROOTS.has(head)) return "external";
      const crateDir = this.crates.get(head);
      return crateDir === undefined ? "external" : inCrate(crateDir, segs.slice(1));
    };

    // Go: an import path names a package directory under a go.mod module.
    const goPackages = new Map<string, string[]>();
    for (const f of files) {
      if (!f.path.endsWith(".go") || f.path.endsWith("_test.go")) continue;
      const dir = dirname(f.path);
      const list = goPackages.get(dir);
      if (list) list.push(f.path);
      else goPackages.set(dir, [f.path]);
    }
    for (const list of goPackages.values()) list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const goModules = [...this.goModules.entries()].sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    const resolveGo = (spec: string): string[] | "external" | null => {
      for (const [dir, mod] of goModules) {
        if (spec !== mod && !spec.startsWith(mod + "/")) continue;
        const pkg = normalizePath(join(dir, spec.slice(mod.length + 1)));
        const list = pkg === null ? undefined : goPackages.get(pkg);
        return list ?? null;
      }
      return "external";
    };

    const edges = new Set<number>();
    const pairs: [number, number][] = [];
    let resolved = 0;
    let external = 0;
    let unresolved = 0;
    let truncated = false;
    const width = files.length + 1;
    for (const [from, { family, list }] of [...this.specs.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      const a = index.get(from);
      if (a === undefined) continue;
      for (const spec of list) {
        const results: (string | string[] | "external" | null)[] =
          family === "js" ? [resolveJs(from, spec)] : family === "python" ? resolvePy(from, spec) : family === "rust" ? [resolveRust(from, spec)] : [resolveGo(spec)];
        for (const r of results) {
          if (r === "external") external++;
          else if (r === null) unresolved++;
          else {
            // One import; a Go package import links to each of its files.
            resolved++;
            for (const target of typeof r === "string" ? [r] : r) {
              const b = index.get(target)!;
              if (b === a) continue;
              const key = a * width + b;
              if (edges.has(key)) continue;
              if (pairs.length >= MAX_EDGES) {
                truncated = true;
                continue;
              }
              edges.add(key);
              pairs.push([a, b]);
            }
          }
        }
      }
    }
    pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return { languages: [...IMPORT_FAMILIES], edges: pairs, scanned: this.specs.size, resolved, external, unresolved, truncated };
  }
}
