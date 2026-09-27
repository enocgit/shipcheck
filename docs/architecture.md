# Architecture

> Follow the documentation writing standard in AGENTS.md. This is the current system shape:
> compact summaries, linked to ADRs/contracts for detail. Decision _history_ lives in `docs/adr/`;
> update this document when the shape changes and link the ADR that caused it.

## System context

A single Shipcheck server talks to two things: the **GitHub REST API** (read-only, fine-grained
token, one repo — ADR-0004) and the **operator's browser**, which loads one HTML page and polls the
JSON endpoints. No other systems, no database, no queues (ADR-0005).

## Containers / services

| Container | Responsibility | Tech | Talks to |
| --------- | -------------- | ---- | -------- |
| Shipcheck server | Serves the page, reads GitHub, computes verdicts, caches 60s | Hono + TypeScript on Node 20 | GitHub REST API, browser |
| Shipcheck page | Renders PR verdicts, branch-hygiene panel, ship signal | Static HTML + vanilla JS (or a Preact island) | Shipcheck server (`/api/`) |

## Key components

- **GitHub client** — the only code that calls GitHub; owns token handling and rate-limit awareness.
- **Cache** — in-memory, single-process, 60s TTL per response (ADR-0005).
- **Verdict engine** — pure logic mapping PR state (mergeability, checks, reviews, freshness) to
  `ship` / `fix` / `wait` plus reasons; no I/O, fully unit-testable.
- **Branch-hygiene module** — computes stale/ahead/behind state for branches.
- **`/api/` routes** — Zod-validated read-only JSON endpoints; the contract (`src/contracts/`,
  ADR-0006) is the seam to the page.

## Data model

No local persistence. Ephemeral shapes only: a snapshot of each open PR (head/base SHAs,
mergeability, check runs, review state, timestamps) and derived verdicts, all matching the Zod
schemas in `src/contracts/`. Source of truth is GitHub.

## Key flows

1. **Page load** — browser requests the page, then `GET /api/status`. Server reads cache; on
   miss/expiry it fetches open PRs, checks, and branch state from GitHub, computes verdicts,
   caches, and returns the snapshot.
2. **Verdict computation** — for each PR: mergeable + checks green + approved + fresh → `ship`;
   failing checks or changes requested → `fix`; missing review, behind base, or stale → `wait`.
   Reasons list alongside every verdict; the overall ship signal derives from all verdicts plus
   branch hygiene.

## Planned changes

- **PRD-0001 (approved, not implemented):** the v1 core — composite `/api/status` snapshot, one-page
  UI with 60s auto-poll, verdict engine, branch-hygiene panel, ship signal, in-memory cache.
  Contract frozen at `src/contracts/status.ts`. No code exists yet; the sections above describe the
  approved shape this feature builds.

## Cross-cutting concerns

- **Auth:** outbound only — env-provided read-only fine-grained GitHub token; no viewer auth in v1
  (ADR-0004).
- **Errors:** GitHub API failures degrade per-section on the page (verdicts, hygiene, signal show
  what succeeded) with a clear error state; token errors surface as config problems, never echoing
  the token.
- **Observability:** structured stdout logs (request line, GitHub call outcomes, cache hits);
  no secrets or token material in logs.
- **Config/secrets:** env only — `GITHUB_TOKEN` and the target repo; no config files.

## Decisions affecting this architecture

- [ADR-0001](./adr/0001-record-architecture-decisions.md) — record architecture decisions
- [ADR-0002](./adr/0002-stack.md) — TypeScript + Hono on Node 20
- [ADR-0003](./adr/0003-repo-layout.md) — single-package layout
- [ADR-0004](./adr/0004-auth-and-token-model.md) — read-only fine-grained token, no viewer auth
- [ADR-0005](./adr/0005-datastore.md) — GitHub API as the only store, 60s in-memory cache
- [ADR-0006](./adr/0006-api-style.md) — one HTML page plus Zod-defined JSON GET endpoints
