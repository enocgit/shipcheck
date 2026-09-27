# ADR 0002: TypeScript + Hono on Node 22+

- **Status:** Accepted
- **Date:** 2026-09-27
- **Relates to:** [PRD 0000](../prd/0000-product.md)

## Context

Shipcheck is one small server: proxy a handful of GitHub REST reads, render one page, keep a 60s
in-memory cache. No database, no background jobs, no multi-user surface. Deployment footprint and
ceremony should match that size.

## Decision

We will build the server in TypeScript with the Hono framework on Node 22 or later. Package
management is pnpm (major 11, pinned in `package.json`), which requires Node 22+ to run. Testing
uses Vitest. The frontend is one HTML page with vanilla JS or a Preact island — no frontend
framework or build pipeline beyond TypeScript.

## Consequences

- Hono's Node adapter serves both the HTML page and the JSON endpoints in one process.
- TypeScript everywhere means the contract schemas (ADR-0006) are shared types, not generated
  bindings across languages.
- No build/bundle step beyond `tsc`; the page stays plain assets the server serves.
- **Amended 2026-09-27 during PRD-0001 implementation:** the floor moved from Node 20 to Node 22.
  The recorded assumption that CI's Node version and the runtime floor could stay at 20 was false:
  the pinned pnpm 11 toolchain requires Node 22+, and Node 20 is near end-of-life anyway. The
  adapter layer (Hono web-standard APIs) keeps the code portable if the runtime changes.

## Alternatives considered

- **Express / Fastify**: mature and fine, but heavier middleware surface than this service needs;
  Hono is lighter and types-first.
- **Next.js / a frontend framework**: rejected — one page with no routing, SSR, or state does not
  justify a meta-framework.
- **Go / other runtimes**: rejected — no ecosystem reason; TypeScript keeps contract types shared
  between server and page script.
