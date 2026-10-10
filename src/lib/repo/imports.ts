import type { ImportGraph, RepoFile } from "@/lib/types";
import { basename, dirname } from "./languages";

/**
 * Dependency layer: import statements → file-to-file edges.
 *
 * Supported: JavaScript/TypeScript (incl. Vue/Svelte files) and Python.
 * Extraction is lexical (comments stripped, then statement patterns matched), not
 * a full parse. Resolution mirrors the common rules:
 *   JS/TS   relative paths with extension/index probing (and `.js` → `.ts` for ESM
 *           TypeScript), the nearest tsconfig/jsconfig `baseUrl` + `paths`, and
 *           packages of the same repository (workspaces) by package.json name.
 *   Python  relative imports from the file's package, and absolute modules from the
 *           repository root, `src/`, or the directory above the file's top package.
 * Anything else is counted as external (third-party or standard library) or
 * unresolved; nothing is guessed. Code is only read as text, never executed.
 */

export type ImportFamily = "js" | "python";

export function importFamily(language: string): ImportFamily | null {
  if (language === "typescript" || language === "javascript" || language === "vue" || language === "svelte") return "js";
  if (language === "python") return "python";
  return null;
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
 * Raw import specifiers in source order, deduplicated.
 * Python specifiers are encoded as `module` (import a.b) or `from:module:name1,name2`.
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

export class ImportCollector {
  private readonly specs = new Map<string, { family: ImportFamily; list: string[] }>();
  private readonly tsconfigs = new Map<string, TsConfig>();
  private readonly packages = new Map<string, { dir: string; entries: string[] }>();

  /** Feed every included text file whose contents were read. */
  consider(path: string, language: string, text: string): void {
    const name = basename(path);
    if ((name === "tsconfig.json" || name === "jsconfig.json") && text.length <= MAX_CONFIG_BYTES) this.addTsConfig(path, text);
    else if (name === "package.json" && text.length <= MAX_CONFIG_BYTES) this.addPackage(path, text);
    const family = importFamily(language);
    if (!family) return;
    this.specs.set(path, { family, list: extractSpecifiers(text, family) });
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
        const results = family === "js" ? [resolveJs(from, spec)] : resolvePy(from, spec);
        for (const r of results) {
          if (r === "external") external++;
          else if (r === null) unresolved++;
          else {
            resolved++;
            const b = index.get(r)!;
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
    pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return { edges: pairs, scanned: this.specs.size, resolved, external, unresolved, truncated };
  }
}
