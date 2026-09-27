# ADR 0006: API style — one HTML page plus JSON GET endpoints

- **Status:** Accepted
- **Date:** 2026-09-27
- **Relates to:** [ADR-0002](0002-stack.md), [ADR-0003](0003-repo-layout.md)

## Context

The product is one page. The server already has TypeScript on both sides of the HTTP seam (server
routes and the page script), so the contract can be shared types rather than a generated schema
file.

## Decision

We will serve one server-rendered HTML page and expose read-only JSON GET endpoints under `/api/`
for its data. The contract is the set of Zod schemas in `src/contracts/` — the single source for
runtime validation and the TypeScript types consumed by both the routes and the page script. Each
endpoint's shape freezes at Stage 2 of its feature before implementation.

## Consequences

- No OpenAPI generation step; the Zod schemas are the artifact (recorded in `docs/contracts/README.md`).
- All GitHub-derived strings are validated at the `/api/` boundary before the page renders them,
  which is also the XSS containment line (see `docs/security.md`).
- Pagination/filtering conventions stay minimal until a second consumer appears.

## Alternatives considered

- **OpenAPI codegen**: rejected for v1 — one page and one consumer; schema-first Zod is less
  machinery for the same drift protection. Revisit if a second consumer appears.
- **tRPC**: rejected — the client is plain JS/a Preact island, not a typed React tree; vanilla
  `fetch` against a Zod-validated endpoint is simpler.
- **Server-rendered everything (no JSON API)**: rejected — auto-refresh and the ship signal want a
  cheap data fetch, not a full page reload.
