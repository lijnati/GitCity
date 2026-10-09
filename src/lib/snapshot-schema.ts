import { z } from "zod";
import type { RepoSnapshot } from "./types";

const iso = z.string().max(64);

export const RepoFileSchema = z.object({
  path: z.string().min(1).max(4096),
  size: z.number().int().nonnegative(),
  language: z.string().max(32),
  lines: z.number().int().nonnegative().nullable(),
  linesNote: z.enum(["binary", "too-large", "budget", "not-fetched"]).optional(),
  complexity: z.number().int().nonnegative().nullable(),
  commits: z.number().int().nonnegative().nullable(),
  lastModified: iso.nullable(),
});

export const SnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.enum(["live", "sample"]),
  repo: z.object({
    owner: z.string().max(64),
    name: z.string().max(128),
    description: z.string().max(2000).nullable(),
    defaultBranch: z.string().max(256),
    htmlUrl: z.string().url().max(512),
    stars: z.number().int().nonnegative().nullable(),
  }),
  revision: z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/), ref: z.string().max(256), committedAt: iso.nullable() }),
  analyzedAt: iso,
  files: z.array(RepoFileSchema).max(100_000),
  excluded: z.object({ count: z.number().int().nonnegative(), bytes: z.number().nonnegative(), byReason: z.record(z.string(), z.number()) }),
  tree: z.object({ truncated: z.boolean(), entries: z.number().int().nonnegative() }),
  lines: z.object({ counted: z.number().int().nonnegative(), total: z.number().int().nonnegative(), stoppedEarly: z.boolean() }),
  activity: z
    .object({ commits: z.number().int().nonnegative(), newest: iso.nullable(), oldest: iso.nullable(), partial: z.boolean() })
    .nullable(),
  notes: z.array(z.string().max(1000)).max(50),
});

export function parseSnapshot(data: unknown): RepoSnapshot {
  return SnapshotSchema.parse(data) as RepoSnapshot;
}
