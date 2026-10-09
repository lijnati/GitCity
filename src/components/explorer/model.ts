import { dirname, languageInfo } from "@/lib/repo/languages";
import type { CityLayout } from "@/lib/city/layout";
import type { RepoFile, RepoSnapshot } from "@/lib/types";

export interface Filters {
  query: string;
  /** Enabled languages; empty = all. */
  languages: ReadonlySet<string>;
  /** Directory focus (path prefix), or null. */
  dir: string | null;
}

export function hasFilters(f: Filters): boolean {
  return f.query.trim() !== "" || f.languages.size > 0 || f.dir !== null;
}

export function fileMatches(file: RepoFile, f: Filters, q = f.query.trim().toLowerCase()): boolean {
  if (f.languages.size > 0 && !f.languages.has(file.language)) return false;
  if (f.dir !== null && !(file.path.startsWith(f.dir + "/"))) return false;
  if (q && !file.path.toLowerCase().includes(q)) return false;
  return true;
}

/** Per-file match mask. */
export function matchFiles(files: readonly RepoFile[], f: Filters): Uint8Array {
  const q = f.query.trim().toLowerCase();
  const out = new Uint8Array(files.length);
  files.forEach((file, i) => {
    out[i] = fileMatches(file, f, q) ? 1 : 0;
  });
  return out;
}

/** Per-building active mask: an aggregate is active when any of its files match. */
export function activeBuildings(layout: CityLayout, fileMask: Uint8Array): Uint8Array {
  const out = new Uint8Array(layout.buildings.length);
  for (const b of layout.buildings) {
    if (b.kind === "file") out[b.id] = fileMask[b.fileIndex]!;
    else out[b.id] = b.aggregate!.files.some((i) => fileMask[i]) ? 1 : 0;
  }
  return out;
}

export interface LanguageStat {
  id: string;
  name: string;
  color: string;
  files: number;
  lines: number;
}

export function languageStats(files: readonly RepoFile[]): LanguageStat[] {
  const map = new Map<string, LanguageStat>();
  for (const f of files) {
    const info = languageInfo(f.language);
    const s = map.get(info.id) ?? { id: info.id, name: info.name, color: info.color, files: 0, lines: 0 };
    s.files++;
    s.lines += f.lines ?? 0;
    map.set(info.id, s);
  }
  return [...map.values()].sort((a, b) => b.files - a.files || (a.name < b.name ? -1 : 1));
}

export interface DirNode {
  path: string;
  name: string;
  files: number;
  children: DirNode[];
}

export function directoryTree(files: readonly RepoFile[]): DirNode {
  const root: DirNode = { path: "", name: "", files: 0, children: [] };
  const index = new Map<string, DirNode>([["", root]]);
  for (const f of files) {
    root.files++;
    const dir = dirname(f.path);
    if (!dir) continue;
    let parent = root;
    let acc = "";
    for (const part of dir.split("/")) {
      acc = acc ? `${acc}/${part}` : part;
      let node = index.get(acc);
      if (!node) {
        node = { path: acc, name: part, files: 0, children: [] };
        index.set(acc, node);
        parent.children.push(node);
      }
      node.files++;
      parent = node;
    }
  }
  const sort = (n: DirNode) => {
    n.children.sort((a, b) => (a.name < b.name ? -1 : 1));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export function githubFileUrl(snapshot: RepoSnapshot, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(snapshot.repo.owner)}/${encodeURIComponent(snapshot.repo.name)}/blob/${snapshot.revision.sha}/${encoded}`;
}

export function githubTreeUrl(snapshot: RepoSnapshot, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(snapshot.repo.owner)}/${encodeURIComponent(snapshot.repo.name)}/tree/${snapshot.revision.sha}/${encoded}`;
}
