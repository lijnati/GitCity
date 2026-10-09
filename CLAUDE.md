# GitCity — project conventions

Every codebase is a city. Next.js App Router + React Three Fiber app that turns a public GitHub repo into a deterministic 3D city.

## Architecture
- `src/lib/github/` — the only code that talks to GitHub. Fixed hosts (`api.github.com`, redirect to `codeload.github.com` only), paths built with `repoPath()` from validated ids, size caps + timeouts. Token is server-only (`GITHUB_TOKEN`).
- `src/lib/repo/` — input parsing, exclusions, language detection, streaming tar reader, metrics, `analyzeRepository()` pipeline.
- `src/lib/city/` — pure, React-free city engine: `applyBudget` → `generateCity` (bottom-up shelf packing) → scale functions. Must stay deterministic (byte-wise path ordering, no randomness, no Date/Math.random).
- `src/components/scene/` — R3F rendering (instanced meshes). `src/components/explorer/` — UI shell. `src/app/` — routes + `/api/analyze` NDJSON stream.
- Shared contracts in `src/lib/types.ts`, validated by `src/lib/snapshot-schema.ts`.
- `src/lib/snapshot-store.ts` — private Vercel Blob storage (memory fallback without `BLOB_READ_WRITE_TOKEN`). Snapshots per SHA are write-once: permanent links must never change.

## Truthfulness rules (non-negotiable)
- Never invent metrics. Unknown values are `null` and rendered as explicit "unavailable" states.
- Never substitute bytes for lines. Unknown-lines buildings are flat + striped.
- Aggregation/truncation/budget stops must be disclosed in the UI (`snapshot.notes`, budget banner).
- The bundled sample is labelled as a captured snapshot, never as a live analysis.
- Private repos are refused even if the server token could read them.

## Commands
- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm typecheck` · `pnpm lint` · `pnpm test` (Vitest, mocked GitHub, no network) · `pnpm e2e` (Playwright, uses bundled sample + mocked API)
- `pnpm verify` runs typecheck, lint, test, build.
- `pnpm sample` regenerates `src/data/sample-city.json` from a local clone (see script header).

## Design constraints
Neo-Swiss editorial minimalism: neutral surfaces, hairline borders, 2–4px radii, strong type hierarchy, mono for code metadata. No gradients/glass/blobs/glow, no pill buttons. Language colours only for data. The city is the centerpiece.

## Boundaries
- No auth, DB, payments, AI integrations.
- Never fetch user-supplied URLs; never execute analysed repo code.
- shadcn/ui registry is unreachable from the dev sandbox; UI primitives in `src/components/ui/` are hand-written in the shadcn pattern (cva + tailwind-merge).
