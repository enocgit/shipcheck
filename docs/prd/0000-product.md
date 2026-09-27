# Product PRD — Shipcheck

- **Status:** Draft
- **Owner / date:** enoch / 2026-09-27

## Vision

Shipcheck answers one question per repository — **can I ship today?** — on a single glanceable
page. Instead of hopping between the PR list, checks tabs, and branch views, the maintainer opens
one page that names, per PR, the verdict and the reasons behind it.

## Target users

- **Solo maintainer** — reviews and merges their own repo's PRs; wants a 10-second read of what is
  safe to merge now and why.

## Problems we solve

- Merge readiness is scattered across PR mergeability, check runs, review states, and branch age —
  for the solo maintainer.

## Scope

**In (the product is):** one server per repo (configured from env) that reads open PRs, latest CI
runs, and branch freshness through the GitHub REST API with a read-only fine-grained token, caches
responses in memory for 60 seconds, and renders one page with per-PR verdicts (`ship` / `fix` /
`wait`, each with reasons), a branch-hygiene panel, and an overall ship signal.

**Out (the product is not):** multi-repo, viewer authentication, webhooks, write operations,
persistence.

## Success metrics (product-level)

- A maintainer can decide whether to merge each open PR within 10 seconds of opening the page.
- Every verdict lists its reasons, so a surprising verdict is diagnosable from the page itself.

## Foundational decisions

- Stack / framework → [ADR-0002](../adr/0002-stack.md)
- Repo layout → [ADR-0003](../adr/0003-repo-layout.md)
- Auth model → [ADR-0004](../adr/0004-auth-and-token-model.md)
- Primary datastore → [ADR-0005](../adr/0005-datastore.md)
- API style → [ADR-0006](../adr/0006-api-style.md)

## Key constraints

- Read-only: the token and the app never write to GitHub.
- One repo per instance, from env config; no viewer authentication in v1, so the instance must not
  be exposed beyond the operator.
- No database, no background jobs; GitHub API + in-memory 60s cache only.
