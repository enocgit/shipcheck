# Test strategy

> Follow the documentation writing standard in AGENTS.md. Keep this doc focused on test-specific
> policy and links to real tools; do not duplicate the canonical Definition of Done from AGENTS.md.
> Delete placeholder runners once the stack is set.
>
> STATUS: configured 2026-09-27 — tools match the real stack (Vitest; pnpm + Node 20 CI in
> `.github/workflows/ci.yml`).

## Policy

Apply the verification standard in `AGENTS.md` — proportional evidence, RED → GREEN for non-trivial
executable behavior, the smallest check that proves the change, no full local suite by default.
This document adds only the test-specific layering below. The Lifecycle block in `docs/context.md`
sets the reach of the bar; record deferred cases in the production register instead of writing the
test.

## Test layers (the pyramid)

| Layer | Tool | What it covers | When required |
| ------- | ------ | ---------------- | --------------- |
| Unit | Vitest | Pure logic, edge cases | All non-trivial logic |
| Integration | Vitest + mocked GitHub HTTP (no test DB exists) | Module behavior, `/api/` handlers against the contract | Any data/contract change |
| Contract | Zod schemas in `src/contracts/` shared directly | Server routes and page script agree on the frozen interface | Any contract change |
| Failure path | Vitest | Validation, authorization or security denial, error, retry, timeout, and partial-failure behavior | Whenever the executable branch can be exercised; defer only cases whose required deployed consumer, real data, deployment, traffic, load, compatibility, or multi-version condition is unavailable; see Lifecycle |
| Load / perf | N/A | Throughput, latency, saturation | When staging or production traffic exists |
| E2E | Manual QA checklist (Playwright if a browser flow earns it) | Critical user flows end-to-end | Per epic's key flow |

**Rule of thumb:** test logic at the lowest layer that gives confidence; reserve E2E for the few
flows that matter most. Non-trivial executable behavior must be _covered_, not merely _touched_;
`AGENTS.md` owns what else may serve as evidence.

## Verification bar

The project's operating manual defines the broader completion policy. This document adds only the
test-specific bar: automated coverage for non-trivial executable behavior at the **right layer**,
and configured CI fully green before merge when a CI workflow exists.

## Conventions

- Deterministic tests (no real network/time/randomness without control).
- Test names describe behavior, not implementation.
- A regression test earns its place by reproducing a failure that actually occurred. For an
  unobserved condition that cannot be exercised before deployment, name the behavior it would protect
  and put it in the production register instead of writing the test now. This exception does not
  cover executable validation, authorization, security denial, error, retry, timeout, or partial-failure
  branches.
- Name the invariant, not the history: no "previously failed" or incident narration in test names
  or comments.
