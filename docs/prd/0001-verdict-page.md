# PRD 0001: Shipcheck v1 — verdict page

> Follow the documentation writing standard in AGENTS.md. Scan-first: approval, scope, decisions,
> constraints, links, and open questions before detail.

## Summary

- **Approval:** Approved
- **Delivery:** Shipped 2026-09-27 via PR [#9](https://github.com/enocgit/shipcheck/pull/9) (merged as `5b1ed77`). All 8 acceptance criteria verified: 86 automated tests (`pnpm test --run`), lint/typecheck/build green, 11/11 browser QA checks. Residual: no run against the real GitHub API yet (no token configured) — recorded in `docs/security/records/2026-09-27-prd-0001-implementation.md`.
- **Outcome:** The operator opens one page and sees, for every open PR in the configured repo, a
  verdict with reasons, a branch-hygiene panel, and an overall ship signal.
- **Scope:** In — one composite `/api/status` snapshot endpoint, one-page UI with 60s auto-poll,
  verdict engine (`ship`/`fix`/`wait` with reasons), branch-hygiene panel, ship signal, in-memory
  60s cache, read-only GitHub client. Out — webhooks, multi-repo, viewer authentication, write
  operations, persistence.
- **Key decisions:** composite snapshot endpoint (ADR-0006); GitHub API as only store with 60s
  cache (ADR-0005); read-only fine-grained token, no viewer auth (ADR-0004); Hono + TypeScript on
  Node 22+ (ADR-0002, amended from Node 20 during implementation).
- **Constraints:** read-only token only; instance must not be exposed beyond the operator
  (ADR-0004); no database or background jobs (ADR-0005).
- **Links:** [Product PRD](0000-product.md) · [ADR-0002](../adr/0002-stack.md) ·
  [ADR-0004](../adr/0004-auth-and-token-model.md) · [ADR-0005](../adr/0005-datastore.md) ·
  [ADR-0006](../adr/0006-api-style.md) · [Architecture](../architecture.md)
- **Open questions:** None
- **Owner / date:** enoch / 2026-09-27

## Problem

Merge readiness for a repo is scattered across the PR list, checks tabs, review threads, and branch
views. The solo maintainer has to hop between them to answer "can I ship today?"

## Users & goals

- **Solo maintainer** wants one glanceable page naming each PR's verdict and reasons so that they
  can decide what to merge within 10 seconds.

## Success metrics

- Every open PR shows a verdict with at least one reason; a surprising verdict is diagnosable from
  the page alone.
- Page data is at most 60s old without any user interaction.

## Requirements

### Functional

- FR1: The page shows one card per open PR in the configured repo, each with a verdict — `ship`,
  `fix`, or `wait` — and a list of reasons.
- FR2: `ship` requires all of: mergeable, no failing or pending checks, at least one `APPROVED`
  review with no outstanding `CHANGES_REQUESTED`, and not stale. A PR with no checks configured
  counts as checks-green.
- FR3: `fix` applies when checks are failing or a review requests changes; conflicts count as fix.
- FR4: `wait` applies when review is missing, the PR is a draft, the head is behind base, the PR
  is stale (behind base by any commits, or idle more than 7 days), checks are pending, or GitHub
  has not yet computed mergeability. `fix` outranks `wait`.
- FR5: A branch-hygiene panel lists every branch except the default with ahead/behind vs default
  and last-commit age, flagging stale branches (behind default, or idle more than 30 days).
- FR6: The overall ship signal: `ship` only when every PR verdict is `ship` and no branch is
  stale; `fix` if any PR verdict is `fix`; otherwise `wait`.
- FR7: The page auto-polls the status endpoint every 60 seconds and re-renders. PR cards sort
  `fix` first, then `wait`, then `ship`; no cap on card count in v1.
- FR8: The server caches the aggregated snapshot in memory for 60 seconds; cache miss triggers
  parallel GitHub fetches. A failed fetch is cached for only 10 seconds so recovery is quick
  without hammering the API.
- FR9: The repo is configured via environment variables (`GITHUB_TOKEN`, target repo); no config
  files.

### Non-functional

- NFR1: The token is never logged, echoed in errors, or included in API responses.
- NFR2: All GitHub-derived content is validated against the Zod contract at the `/api/` boundary
  and HTML-escaped before render (XSS containment; see `docs/security.md`).
- NFR3: GitHub API failure degrades gracefully: a typed error state renders per section; hostile
  or unexpected payloads never crash the server.

## UX notes

One page: ship signal header, PR verdict cards (verdict badge + reasons), branch-hygiene panel
below. No navigation, no settings UI. Visual design follows `frontend-design` guidance at
implementation.

## Data & contract impact

- New contract: `src/contracts/status.ts` — Zod schema for the `/api/status` snapshot (per-PR
  verdict + reasons, branch hygiene entries, ship signal, typed error states). Freezes at Stage 2.
- No persisted entities; no events; GitHub is the source of truth.

## Acceptance criteria

- [ ] Each PR card's verdict matches the rule matrix in FR2–FR4 for a mocked GitHub fixture set,
      including the no-checks, draft, conflict, behind-base, and stale cases.
- [ ] Every verdict displays at least one reason string.
- [ ] A PR with zero reviews shows `wait` with a missing-review reason; a draft never shows `ship`.
- [ ] Pending checks and uncomputed mergeability each produce `wait` with the matching reason;
      neither can produce `ship`.
- [ ] Branch hygiene lists all non-default branches with ahead/behind and age, flagging stale ones
      per FR5.
- [ ] The ship signal reflects a failing PR verdict and a stale branch in its derivation.
- [ ] The page renders cards in `fix`, `wait`, `ship` order.
- [ ] The ship signal is `ship` only with all-`ship` verdicts and no stale branch; any `fix`
      verdict makes it `fix`; otherwise `wait`.
- [ ] Two rapid page polls within 60s produce exactly one GitHub fetch round (cache behavior); a
      failed fetch is retried after ~10s, not held for the full 60s.
- [ ] With GitHub unreachable, the page shows a typed degraded state and the server returns a
      clean error shape — never the token.
- [ ] A GitHub payload missing required fields is rejected by the contract and surfaces as the
      degraded state.

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ------ | ----------- | ------ | ------------ |
| Verdict rule matrix misreads GitHub semantics (mergeable states, check-run conclusions) | M | H | Unit-test the engine against documented GitHub states; integration tests with realistic fixtures |
| GitHub API rate limit exhausted by polling | L | M | 60s cache bounds request rate; trigger registered for sustained polling |
| Page exposes data when instance is publicly reachable | L | H | Deployment constraint documented; viewer-auth trigger registered (ADR-0004) |
