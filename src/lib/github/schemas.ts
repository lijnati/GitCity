import { z } from "zod";

/** Only the fields GitCity reads; everything else in GitHub responses is ignored. */

export const RepoResponse = z.object({
  name: z.string(),
  owner: z.object({ login: z.string() }),
  description: z.string().nullable().optional(),
  default_branch: z.string().min(1),
  html_url: z.string(),
  private: z.boolean().optional(),
  stargazers_count: z.number().optional(),
  size: z.number().optional(),
});

export const CommitResponse = z.object({
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  commit: z.object({
    committer: z.object({ date: z.string() }).nullable().optional(),
    author: z.object({ date: z.string() }).nullable().optional(),
  }),
});

export const CommitListResponse = z.array(CommitResponse);

export const CommitDetailResponse = CommitResponse.extend({
  files: z
    .array(z.object({ filename: z.string(), status: z.string().optional() }))
    .optional()
    .default([]),
});

export const TreeResponse = z.object({
  sha: z.string(),
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      mode: z.string().optional(),
      type: z.string(),
      size: z.number().optional(),
    }),
  ),
});

export type TreeEntry = z.infer<typeof TreeResponse>["tree"][number];

export function commitDate(c: z.infer<typeof CommitResponse>): string | null {
  return c.commit.committer?.date ?? c.commit.author?.date ?? null;
}
