/**
 * Minimal streaming reader for (ustar/pax/GNU) tar archives, enough for GitHub
 * tarballs. It never writes to disk and only buffers the bodies of entries the
 * caller asks for, so memory is bounded by the largest collected file.
 */

export interface TarEntry {
  path: string;
  size: number;
  type: "file" | "directory" | "other";
}

export interface TarHandlers {
  /** Return true to receive the full body of this entry via `onFile`. */
  wants(entry: TarEntry): boolean;
  onFile(entry: TarEntry, body: Uint8Array): void;
}

const BLOCK = 512;
const decoder = new TextDecoder();

export async function readTar(chunks: AsyncIterable<Uint8Array>, handlers: TarHandlers): Promise<void> {
  const parser = new TarParser(handlers);
  for await (const chunk of chunks) {
    parser.push(chunk);
    if (parser.done) break;
  }
}

class TarParser {
  done = false;
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private state: "header" | "body" = "header";
  private current: { entry: TarEntry; kind: "data" | "pax" | "longname"; collect: boolean; remaining: number; padded: number; parts: Uint8Array[] } | null = null;
  private paxPath: string | null = null;
  private longName: string | null = null;

  constructor(private readonly handlers: TarHandlers) {}

  push(chunk: Uint8Array) {
    this.pending.push(chunk);
    this.pendingBytes += chunk.length;
    this.drain();
  }

  private take(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let offset = 0;
    while (offset < n) {
      const head = this.pending[0]!;
      const need = n - offset;
      if (head.length <= need) {
        out.set(head, offset);
        offset += head.length;
        this.pending.shift();
      } else {
        out.set(head.subarray(0, need), offset);
        this.pending[0] = head.subarray(need);
        offset += need;
      }
    }
    this.pendingBytes -= n;
    return out;
  }

  private drain() {
    while (!this.done) {
      if (this.state === "header") {
        if (this.pendingBytes < BLOCK) return;
        this.readHeader(this.take(BLOCK));
      } else {
        const cur = this.current!;
        if (cur.remaining > 0) {
          if (this.pendingBytes === 0) return;
          const n = Math.min(cur.remaining, this.pendingBytes);
          const piece = this.take(n);
          if (cur.collect) cur.parts.push(piece);
          cur.remaining -= n;
          if (cur.remaining > 0) return;
        }
        if (cur.padded > 0) {
          if (this.pendingBytes < cur.padded) return;
          this.take(cur.padded);
          cur.padded = 0;
        }
        this.finishEntry(cur);
        this.current = null;
        this.state = "header";
      }
    }
  }

  private readHeader(h: Uint8Array) {
    if (h.every((b) => b === 0)) {
      // End-of-archive marker (two zero blocks); one is enough to stop.
      this.done = true;
      return;
    }
    const name = cString(h, 0, 100);
    const size = parseOctal(h, 124, 12);
    const typeflag = String.fromCharCode(h[156]!);
    const magic = cString(h, 257, 6);
    const prefix = magic.startsWith("ustar") ? cString(h, 345, 155) : "";
    let path = prefix ? `${prefix}/${name}` : name;

    let kind: "data" | "pax" | "longname" = "data";
    let type: TarEntry["type"] = "other";
    if (typeflag === "x") kind = "pax";
    else if (typeflag === "L") kind = "longname";
    else if (typeflag === "g") kind = "data"; // global pax header – skipped
    else if (typeflag === "0" || typeflag === "\0" || typeflag === "7") type = "file";
    else if (typeflag === "5") type = "directory";

    if (kind === "data" && typeflag !== "g") {
      if (this.longName) path = this.longName;
      if (this.paxPath) path = this.paxPath;
      this.longName = null;
      this.paxPath = null;
    }

    const entry: TarEntry = { path, size, type: typeflag === "g" ? "other" : type };
    const collect = kind !== "data" || (entry.type === "file" && this.handlers.wants(entry));
    this.current = { entry, kind, collect, remaining: size, padded: (BLOCK - (size % BLOCK)) % BLOCK, parts: [] };
    this.state = "body";
  }

  private finishEntry(cur: NonNullable<TarParser["current"]>) {
    if (!cur.collect) return;
    const body = concat(cur.parts, cur.entry.size);
    if (cur.kind === "pax") {
      this.paxPath = parsePaxPath(decoder.decode(body)) ?? this.paxPath;
    } else if (cur.kind === "longname") {
      this.longName = cString(body, 0, body.length);
    } else {
      this.handlers.onFile(cur.entry, body);
    }
  }
}

function concat(parts: Uint8Array[], size: number): Uint8Array {
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function cString(buf: Uint8Array, start: number, len: number): string {
  let end = start;
  const max = Math.min(buf.length, start + len);
  while (end < max && buf[end] !== 0) end++;
  return decoder.decode(buf.subarray(start, end));
}

function parseOctal(buf: Uint8Array, start: number, len: number): number {
  // GNU base-256 encoding for very large sizes.
  if ((buf[start]! & 0x80) !== 0) {
    let value = 0;
    for (let i = start + 1; i < start + len; i++) value = value * 256 + buf[i]!;
    return value;
  }
  const s = cString(buf, start, len).trim();
  const n = s ? parseInt(s, 8) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Pax records look like "%d path=value\n". */
function parsePaxPath(text: string): string | null {
  let i = 0;
  let found: string | null = null;
  while (i < text.length) {
    const space = text.indexOf(" ", i);
    if (space === -1) break;
    const len = parseInt(text.slice(i, space), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = text.slice(space + 1, i + len - 1);
    const eq = record.indexOf("=");
    if (eq !== -1 && record.slice(0, eq) === "path") found = record.slice(eq + 1);
    i += len;
  }
  return found;
}

/** Test helper: build an uncompressed ustar archive. */
export function buildTar(files: { path: string; content: string | Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const blocks: Uint8Array[] = [];
  for (const f of files) {
    const body = typeof f.content === "string" ? enc.encode(f.content) : f.content;
    if (enc.encode(f.path).length > 100) {
      const record = paxRecord("path", f.path);
      blocks.push(header("PaxHeader", record.length, "x"), pad(record));
    }
    blocks.push(header(f.path.slice(0, 100), body.length, "0"), pad(body));
  }
  blocks.push(new Uint8Array(BLOCK * 2));
  return concat(blocks, blocks.reduce((s, b) => s + b.length, 0));

  function paxRecord(key: string, value: string): Uint8Array {
    const body = ` ${key}=${value}\n`;
    let len = body.length + 1;
    while (`${len}${body}`.length !== len) len = `${len}${body}`.length;
    return enc.encode(`${len}${body}`);
  }
  function pad(b: Uint8Array): Uint8Array {
    const out = new Uint8Array(Math.ceil(b.length / BLOCK) * BLOCK);
    out.set(b);
    return out;
  }
  function header(name: string, size: number, type: string): Uint8Array {
    const h = new Uint8Array(BLOCK);
    h.set(enc.encode(name).subarray(0, 100), 0);
    h.set(enc.encode("0000644\0"), 100);
    h.set(enc.encode(size.toString(8).padStart(11, "0") + "\0"), 124);
    h[156] = type.charCodeAt(0);
    h.set(enc.encode("ustar\0" + "00"), 257);
    h.fill(32, 148, 156);
    let sum = 0;
    for (const b of h) sum += b;
    h.set(enc.encode(sum.toString(8).padStart(6, "0") + "\0 "), 148);
    return h;
  }
}
