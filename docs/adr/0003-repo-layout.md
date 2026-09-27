# ADR 0003: Single-package repo layout

- **Status:** Accepted
- **Date:** 2026-09-27
- **Relates to:** [ADR-0002](0002-stack.md)

## Context

One server, one page, one deployable. No shared packages, no separate services are on the roadmap.

## Decision

We will keep a single npm package at the repository root: `src/` for server code (routes, GitHub
client, verdict logic), contract schemas under `src/contracts/` (ADR-0006), and static page assets
served by the server. No monorepo tooling.

## Consequences

- One `package.json`, one CI pipeline, one deploy target.
- If a second surface (e.g. a CLI) ever appears, the split happens then — not before.
- Contract schemas stay importable by both server routes and page script without package
  boundaries.

## Alternatives considered

- **Monorepo (pnpm workspaces)**: rejected — no second package exists or is planned for v1.
- **Separate frontend repo**: rejected — the page ships with the server that serves it.
