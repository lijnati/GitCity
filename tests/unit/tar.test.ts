import { describe, expect, it } from "vitest";
import { buildTar, readTar, type TarEntry } from "@/lib/repo/tar";

async function* chunked(buf: Uint8Array, size: number) {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

describe("readTar", () => {
  const longPath = "root/" + "deep/".repeat(30) + "file.ts";
  const archive = buildTar([
    { path: "root/a.txt", content: "one\ntwo\n" },
    { path: "root/skip.bin", content: "x".repeat(2000) },
    { path: longPath, content: "long" },
    { path: "root/empty.txt", content: "" },
  ]);

  it.each([1, 7, 511, 512, 4096, 1 << 20])("parses with chunk size %d", async (size) => {
    const seen: TarEntry[] = [];
    const bodies = new Map<string, string>();
    await readTar(chunked(archive, size), {
      wants: (e) => {
        seen.push(e);
        return !e.path.endsWith(".bin");
      },
      onFile: (e, body) => bodies.set(e.path, new TextDecoder().decode(body)),
    });
    expect(seen.map((e) => e.path)).toEqual(["root/a.txt", "root/skip.bin", longPath, "root/empty.txt"]);
    expect(bodies.get("root/a.txt")).toBe("one\ntwo\n");
    expect(bodies.get(longPath)).toBe("long");
    expect(bodies.get("root/empty.txt")).toBe("");
    expect(bodies.has("root/skip.bin")).toBe(false);
  });
});
