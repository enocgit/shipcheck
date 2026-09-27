# ADR 0004: Auth and token model — read-only fine-grained token, no viewer auth

- **Status:** Accepted
- **Date:** 2026-09-27
- **Scope:** v1
- **Relates to:** [PRD 0000](../prd/0000-product.md), [ADR-0005](0005-datastore.md)

## Context

The app reads one repo's PRs, checks, and branch state from the GitHub REST API. There is no
persistence and no viewer authentication in v1, which means the page exposes whatever the token can
read to whoever can reach the server. The instance is an operator tool, not a multi-tenant service.

## Decision

We will authenticate to GitHub with a fine-grained PAT scoped to exactly one repository and
read-only permissions (`metadata`, `pull_requests`, `contents` — read only), supplied via the
`GITHUB_TOKEN` environment variable. The application performs no write operations, and no code
path accepts or forwards a write-capable action. Viewer authentication is out of scope for v1;
deploying the instance anywhere a non-operator can reach it is a configuration error documented in
`docs/security.md`.

## Consequences

- No OAuth flow, no session handling, no user model.
- The token's blast radius is bounded by its fine-grained, read-only, single-repo scope.
- The server must never log the token or echo it in error output (see the threat model).
- Exposing the instance beyond localhost/private networks leaks repo data to unauthenticated
  viewers; the production register records what forces a change (viewer authentication trigger).

## Alternatives considered

- **GitHub App installation tokens**: rejected for v1 — richer but requires app registration and
  webhook/token-refresh machinery the product explicitly excludes.
- **Viewer authentication (any form)**: rejected for v1 per product scope; deferred with a trigger
  in the production register.
