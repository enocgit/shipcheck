# ADR 0005: Datastore — GitHub API is the only store

- **Status:** Accepted
- **Date:** 2026-09-27
- **Relates to:** [PRD 0000](../prd/0000-product.md), [ADR-0004](0004-auth-and-token-model.md)

## Context

All data Shipcheck shows (PRs, checks, branch state) already lives in GitHub and changes there.
Persisting it locally would add a database, migrations, and staleness handling to a tool whose
whole job is to reflect GitHub's current state.

## Decision

We will treat the GitHub REST API as the only datastore. Responses are cached in memory for 60
seconds (single-process, invalidated by TTL); nothing is written to disk and no background jobs
refresh data. When the cache is cold or expired, the next request pays the GitHub round-trip.

## Consequences

- One process holds all state; restarting loses the cache and re-fetches — acceptable by design.
- A restart or a GitHub outage renders the page empty/error states, not stale data: the cache TTL
  bounds how old anything on the page can be.
- Rate limits are the throughput ceiling; the 60s cache is the primary backpressure. Sustained
  polling beyond one token's limit is a registered trigger, not a v1 feature.
- Testing stubs the GitHub HTTP boundary, not a database.

## Alternatives considered

- **SQLite / any database**: rejected — no data outlives its usefulness beyond 60s by design.
- **Webhook-driven updates**: rejected for v1 (product non-goal); registered as a future trigger
  if cache staleness causes missed ship signals that matter.
- **Longer/shorter cache**: 60s balances rate-limit headroom against verdict freshness; revisit
  only with evidence.
