import type { ComplexityFamily } from "./languages";

/**
 * Line count: number of newline-terminated lines plus a final unterminated line.
 * Equivalent to `wc -l` plus one when the file does not end in "\n". Empty file → 0.
 */
export function countLines(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 10) n++;
  if (bytes[bytes.length - 1] !== 10) n++;
  return n;
}

/** Treats a file as binary when its first 8 KiB contain a NUL byte (same heuristic as Git). */
export function isBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, 8192);
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true;
  return false;
}

/**
 * Estimated decision-point count (a McCabe-style approximation summed over the file):
 *   1 + number of branching keywords and short-circuit operators,
 * counted after removing comments and string literals with a lightweight lexer.
 * It is an *estimate*: no parsing, so macros, regex literals and unusual syntax can
 * skew it. Returns null for languages without a supported family.
 */
export function estimateComplexity(source: string, family: ComplexityFamily): number | null {
  if (family === "none") return null;
  const code = family === "c" ? stripCLike(source) : stripHash(source);
  const keywords =
    family === "c"
      ? /\b(?:if|for|while|case|catch|foreach|elif|except)\b/g
      : /\b(?:if|elif|elsif|for|while|until|unless|when|case|except|rescue|and|or)\b/g;
  let count = 1;
  count += (code.match(keywords) ?? []).length;
  count += (code.match(/&&|\|\|/g) ?? []).length;
  return count;
}

function stripCLike(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      i = skipString(src, i, c);
      out += " ";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function stripHash(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
    } else if ((c === '"' || c === "'") && src[i + 1] === c && src[i + 2] === c) {
      const end = src.indexOf(c.repeat(3), i + 3);
      i = end === -1 ? n : end + 3;
      out += " ";
    } else if (c === '"' || c === "'") {
      i = skipString(src, i, c);
      out += " ";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function skipString(src: string, start: number, quote: string): number {
  let i = start + 1;
  const multiline = quote === "`";
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    if (c === "\n" && !multiline) return i + 1;
    i++;
  }
  return i;
}
