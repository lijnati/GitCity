# TASKS

## 1. Scaffold
- [x] Next.js 16 / React 19 / TS strict / Tailwind 4 / ESLint / Vitest / Playwright config
- [x] CLAUDE.md, TASKS.md, .env.example, LICENSE

## 2. Core libraries
- [x] Repo input parsing + tests
- [x] GitHub client (fixed hosts, timeouts, size caps, rate limits, redirect allowlist)
- [x] Exclusions, language detection, line counter, complexity estimate + tests
- [x] Streaming tar reader + tests

## 3. Analysis pipeline
- [x] analyzeRepository (repo → sha → tree → tarball lines → commit window)
- [x] Mocked integration tests (empty, 404/private, rate limit, 5xx, network, timeout, truncated, budget, large tree)
- [x] Live verification against real GitHub (lijnati/ShipIt full city; lijnati/GitCity empty state)

## 4. City engine
- [x] Scale functions, render budget aggregation, bottom-up packing layout
- [x] Determinism / non-overlap / containment / mapping / budget tests

## 5. Sample snapshot
- [x] scripts/build-sample.ts + bundled real snapshot (tauri-apps/tauri @ 7fcd8a7)

## 6. 3D scene
- [x] Instanced buildings (solid + striped), plinths, DOM label layer with collision, camera rig (fit/reset/zoom/focus), hover/select, disposal, dynamic near/far

## 7. Explorer UI
- [x] Top bar, sidebar (search/tree/filters/view), detail panel, legend/controls, list view, loading stages, errors, mobile drawer + bottom sheet, shortcuts

## 8. Landing + sharing
- [x] Landing page with live sample city, metadata, copy link, 404

## 9. Hardening
- [x] API route rate limit + cache + in-flight dedupe, snapshot schema validation, security headers

## 10. Verification
- [x] typecheck, lint, unit/integration/component tests, build
- [x] e2e desktop + mobile (touch)
- [x] screenshots reviewed (docs/screenshots)
- [x] README

## Time-lapse
- [x] History sampling (Link-header count, even spacing, head pinned), tree-only frames
- [x] Stable union layout + per-frame values, tweened in the scene
- [x] /api/timelapse (NDJSON progress, Blob cache, token required, rate limit)
- [x] Playback bar, keyboard, ?timelapse=1, bundled sample time-lapse

## Deferred / next
- [x] Persisted snapshots (Vercel Blob) for permanent share links `/city/owner/repo/<sha>`
- [x] Shared cache across instances (latest pointer, 1 h) + Vercel Firewall rate limit
- [x] Per-city link-preview images (isometric render of the real layout, snapshot-backed)
- [ ] Dark theme
- [ ] Web Worker layout for > 20k-file repositories
