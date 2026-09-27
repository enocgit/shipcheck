# Security review record — 2026-09-27 — PRD-0001 implementation

- **Scope / date:** PRD-0001 implementation diff: all files under `src/` (config, contracts,
  verdicts, hygiene, cache, github client, status service, routes, web page), all test files,
  `package.json`/`pnpm-workspace.yaml`/`tsconfig.json`/`eslint.config.js`/`.gitignore`,
  `.github/workflows/ci.yml`, plus reconciliation edits to `docs/adr/0002`, `docs/adr/0004`,
  `docs/architecture.md`, `docs/prd/0001-verdict-page.md`, `docs/test-strategy.md`,
  `docs/security.md` / 2026-09-27
- **Reviewed identity:** base `0c5b4cc` (main) → working tree on `feat/2-scaffold-config`
  (uncommitted implementation); subject identity = content of the listed files after the final fix
  round (86 tests green, lint/typecheck/build clean)
- **Coverage:** fresh-context structured review in three rounds (independent read-only reviewers +
  supervisor synthesis). Round 1: full delta, 10 findings. Round 2: fix verification, 5 findings
  (2 already-fixed items verified, 3 gaps). Round 3: focused verification of the newest fixes —
  all 7 items verified after final fixture/label corrections; no open findings. Files not accessible:
  none. Exclusions: none.
- **Verification limits:** static review + automated tests + browser QA (11/11 checks: hostile-title
  render, no inline script injection, degraded states, 60s re-poll, no token in rendered content).
  Runtime behavior against the real GitHub API and a deployed instance is unverified — no token or
  traffic exists yet (prototype; see production register).
- **Findings:** round 1 (10): wildcard listener; unvalidated `mergeable`/`draft`; wrong commit-date
  path; pending-masks-failing; no pagination (PRs/reviews/branches/check-runs); `javascript:` URL
  through `z.url()`; wrong compare base; degraded snapshots cached 60s; in-flight fetch stampede;
  COMMENTED review erasing CHANGES_REQUESTED; missing commit-status aggregation. Round 2 (5):
  check-run pagination gap; client-side URL rejection absent; unused param; unvalidated combined
  status; neutral/skipped treated failing; secondary rate limits; doc drift.
- **Resolutions:** all fixed and tested: loopback bind (`src/index.ts`); payload validation
  (`parsePr`, per-run shape, combined-status shape); failure-first aggregation with a failing-
  conclusion allowlist and zero-context guard; full pagination (`paged()`); HTTPS-GitHub URL
  constraint at contract, client, and page layers; per-PR base comparison; failure-TTL for
  degraded snapshots plus in-flight coalescing (`src/cache.ts`); review-state semantics (COMMENTED
  ignored, DISMISSED clears); 403 rate-limit vs forbidden vs secondary limits; ADR-0002 amended
  (Node 22+ floor) and ADR-0004 amended (Checks read permission); contract re-frozen with the URL
  constraint noted. No unresolved Critical or HIGH findings.
- **Residual risks / owners:** real-GitHub runtime behavior unverified until an operator runs the
  instance with a real token (owner: enoch, first QA run); viewer-exposure constraint (localhost
  bind) remains a deployment discipline until viewer auth triggers (owner: enoch).
- **Related ADRs:** [ADR-0002](../../adr/0002-stack.md), [ADR-0004](../../adr/0004-auth-and-token-model.md),
  [ADR-0005](../../adr/0005-datastore.md), [ADR-0006](../../adr/0006-api-style.md)
