# TASKS

## 1. Scaffold
- [x] Next.js 16 / React 19 / TS strict / Tailwind 4 / ESLint / Vitest / Playwright config
- [x] CLAUDE.md, TASKS.md, .env.example

## 2. Core libraries
- [x] Repo input parsing + tests
- [x] GitHub client (fixed hosts, timeouts, size caps, rate limits, redirect allowlist)
- [x] Exclusions, language detection, line counter, complexity estimate + tests
- [x] Streaming tar reader + tests

## 3. Analysis pipeline
- [x] analyzeRepository (repo → sha → tree → tarball lines → commit window)
- [x] Mocked integration tests (empty, 404/private, rate limit, 5xx, network, timeout, truncated, budget, large tree)

## 4. City engine
- [x] Scale functions, render budget aggregation, bottom-up packing layout
- [x] Determinism / non-overlap / containment / mapping / budget tests

## 5. Sample snapshot
- [ ] scripts/build-sample.ts + bundled real snapshot

## 6. 3D scene
- [ ] Instanced buildings, plinths, labels, camera rig, hover/select, disposal

## 7. Explorer UI
- [ ] Top bar, sidebar (search/tree/filters), detail panel, legend/controls, list view, loading stages, errors, mobile model

## 8. Landing + sharing
- [ ] Landing page with live sample city, metadata/OG, copy link

## 9. Hardening
- [ ] API route rate limit + cache, snapshot schema validation

## 10. Verification
- [ ] typecheck, lint, test, build, e2e desktop+mobile, live repo, screenshots, README
