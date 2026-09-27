# Project context

> Follow the documentation writing standard in AGENTS.md. This file is loaded every session, so keep
> only durable domain facts and agent-critical gotchas. Link detail elsewhere.

## Product

Shipcheck answers one question per repository: **can I ship today?** A small server reads a
repository's open pull requests, latest CI runs, and branch freshness through the GitHub REST API,
using a read-only fine-grained token, and renders one page. Each PR gets a verdict —
**ship** (mergeable, checks green, approved, fresh), **fix** (failing checks or review changes
requested), or **wait** (missing review, behind base, or stale) — plus a branch-hygiene panel and an
overall ship signal.

The GitHub API is the only store. Responses are cached in memory for 60 seconds. No database, no
background jobs, no persistence.

## Lifecycle

- **Stage:** prototype
- **Deployed consumers:** none
- **Real data:** none — the instance reads one repo configured via env, using the operator's token
- **Production traffic:** none

## Production register

| Deferred | Trigger that forces it | Owner |
| --- | --- | --- |
| Viewer authentication | Any deployment a non-operator can reach | enoch |
| Multi-repo support | A second repo is requested for the same instance | enoch |
| Rate-limit backpressure (beyond the 60s cache) | Sustained polling against one token's GitHub rate limit | enoch |
| Webhook-driven freshness | 60s cache staleness causes missed ship signals that matter | enoch |

## Personas

- **Solo maintainer**: reviews their own repo's open PRs before merging; wants one glanceable page that says which PR is safe to merge right now and why.

## Glossary

| Term | Meaning |
| ------ | --------- |
| Verdict | Per-PR decision: `ship`, `fix`, or `wait`, always with reasons |
| Ship signal | Overall one-word answer for the repo, derived from all PR verdicts and branch hygiene |
| Fresh | PR head is not behind `base` and was updated recently enough to be current |
| Stale | PR head is behind `base` or untouched long enough to warrant a rebase/review |
| Branch hygiene | Panel covering stale branches and branches that are ahead/behind `main` |
| Fine-grained token | GitHub PAT scoped read-only to one repository (contents, PRs, checks, metadata) |

## Hard constraints

- Read-only: the token and the app must never perform write operations against GitHub.
- One repo per instance, set from env config; no multi-repo features in v1.
- No persistence: GitHub API + in-memory 60s cache only; no database, no background jobs.
- No viewer authentication in v1; the instance must not be exposed beyond the operator.

## Out of scope (for now)

- Webhooks (v1)
- Multi-repo
- Viewer authentication
- Any write operations
- Persistence of any kind

## Learnings

- **2026-09-27**: Zod v4's `discriminatedUnion` rejects boolean literal discriminators (`ok: true/false`) — use `z.union` and keep the wire shape.
- **2026-09-27**: pnpm 11 reads build-script approvals from `pnpm-workspace.yaml` (`allowBuilds:`), not `package.json#pnpm`; a fresh install fails with `ERR_PNPM_IGNORED_BUILDS` otherwise.
- **2026-09-27**: in paginated-mock tests, `url.includes("page=1")` also matches `per_page=100` — infinite pagination and an OOM; match `/[?&]page=1&/` instead.
