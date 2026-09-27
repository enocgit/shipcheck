# ADR 0002: TypeScript + Hono on Node 20

- **Status:** Accepted
- **Date:** 2026-09-27
- **Relates to:** [PRD 0000](../prd/0000-product.md)

## Context

Shipcheck is one small server: proxy a handful of GitHub REST reads, render one page, keep a 60s
in-memory cache. No database, no background jobs, no multi-user surface. Deployment footprint and
ceremony should match that size.

## Decision

We will build the server in TypeScript with the Hono framework on Node 20. Package management is
pnpm (the CI workflow already assumes it). Testing uses Vitest. The frontend is one HTML page with
vanilla JS or a Preact island — no frontend framework or build pipeline beyond TypeScript.

## Consequences

- Hono's Node adapter serves both the HTML page and the JSON endpoints in one process.
- TypeScript everywhere means the contract schemas (ADR-0006) are shared types, not generated
  bindings across languages.
- No build/bundle step beyond `tsc`; the page stays plain assets the server serves.
- Node 20 is the floor; Hono's web-standard APIs keep the code portable if the runtime changes.

## Alternatives considered

- **Express / Fastify**: mature and fine, but heavier middleware surface than this service needs;
  Hono is lighter and types-first.
- **Next.js / a frontend framework**: rejected — one page with no routing, SSR, or state does not
  justify a meta-framework.
- **Go / other runtimes**: rejected — no ecosystem reason; TypeScript keeps contract types shared
  between server and page script.
