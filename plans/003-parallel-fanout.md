# Plan 003: Parallelize the per-item GitHub request fan-out

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c155cc5..HEAD -- src/status.ts src/github.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-page-test-harness.md (so the page-level QA covers
  the changed aggregation path)
- **Category**: perf
- **Planned at**: commit `c155cc5`, 2026-09-27

## Why this matters

A cold snapshot (cache miss) currently issues requests in sequential rounds:
one round of 3 parallel requests per PR, PRs one after another; then, per
branch, 2 requests one after another. For a repo with 20 open PRs and 20
branches that is ~40 sequential round-trips — multi-second first paint (the
page shows stale-or-nothing until then), repeated after every 60s cache
expiry. Parallelizing across items cuts cold-snapshot latency roughly to the
depth of the dependency tree (2 rounds) at the cost of a wider request burst,
which this plan bounds with a small concurrency limit.

## Current state

- `src/status.ts` — `buildPrs(at)` (around line 38):

  ```ts
  const records = await github.listOpenPrs();
  const entries: PrEntry[] = [];
  for (const record of records) {
    const [checks, behindBase, reviewState] = await Promise.all([
      github.getChecks(record.headSha),
      github.compareBehind(record.baseRefName, record.headSha),
      github.getReviewState(record.number),
    ]);
    // ... assessPr(...); entries.push({...});
  }
  return entries.sort(
    (a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || a.number - b.number,
  );
  ```

  The inner three requests already run in parallel; the outer loop over PRs
  is sequential. Any single PR's failure rejects `buildPrs` → the whole `prs`
  section fails (per-section degradation is the approved design — preserve it).
- `src/github.ts` — `listBranches(defaultBranch)` (around line 355):

  ```ts
  for (const { name, sha } of branches) {
    if (name === defaultBranch) continue;
    const comparison = await get(...compare/${defaultBranch}...${sha}...);
    const commit = await get(...commits/${sha}...);   // sequential after the compare
    result.push({ name, ahead: comparison.ahead, behind: comparison.behind, lastCommitAt: commit });
  }
  ```

  Two sequential requests per branch, branches sequential.
- The snapshot flow in `fetchSnapshot()` (`src/status.ts`): default branch
  read first (shared), then `Promise.allSettled([buildPrs, buildBranches])` —
  the two sections already run in parallel. Do not change this shape.
- Cache and failure semantics are approved design and tested
  (`src/cache.test.ts`, `src/status.test.ts`): 60s success TTL, 10s for
  failures/degraded, in-flight coalescing. Untouched by this plan.
- Test conventions: `src/github.test.ts` has a `stubFetch` helper (queue,
  repeats last entry) and `manyPrs(n)`; `src/status.test.ts` stubs fetch with
  URL-routed responses and an injected clock (`now`). Match them.

## Commands you will need

| Purpose   | Command                        | Expected on success |
|-----------|--------------------------------|---------------------|
| Typecheck | `pnpm typecheck`               | exit 0              |
| Tests     | `pnpm test --run`              | all pass            |
| Lint      | `pnpm lint`                    | exit 0              |

## Scope

**In scope** (the only files you should create or modify):
- `src/status.ts` (parallelize `buildPrs` across PRs)
- `src/github.ts` (parallelize `listBranches` across branches; parallelize
  the compare+commit pair per branch)
- `src/status.test.ts`, `src/github.test.ts` (new tests)

**Out of scope** (do NOT touch, even though they look related):
- `src/cache.ts` — TTLs and coalescing are settled design.
- The section-level failure model in `fetchSnapshot` — a failing item must
  still fail its whole section; per-PR error fields would be a contract
  change and are explicitly out of scope.
- Retry/backoff for rate limits — if a burst trips a secondary limit the
  typed `rate-limit` failure already surfaces correctly; no retry logic here.

## Git workflow

- Branch: `advisor/003-parallel-fanout`
- Conventional Commits, ≤72-char subject, e.g. `perf: fan out per-PR and per-branch requests concurrently`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a small concurrency-bounded map helper in `src/status.ts`

Add at module level (plain, dependency-free; `poolSize` bounds simultaneous
request bursts):

```ts
/** Maps items with at most `poolSize` async fns in flight, preserving input
 * order in the result. Rejects with the first error (fail-fast, like the
 * sequential loop it replaces). */
async function pooledMap<T, R>(
  items: readonly T[],
  poolSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(poolSize, items.length) }, worker),
  );
  return results;
}
```

Notes for the executor: `next++` inside a single-threaded event loop is safe
here because each worker reads/increments synchronously before its first
`await`; the `while` guard prevents double-processing. If you are unsure the
property holds for a change you make, prefer `results` order over cleverness
and STOP if a test shows out-of-order output.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Use it in `buildPrs`

Replace the sequential `for (const record of records) { ... }` body with a
single `pooledMap` call (pool size 8) whose per-PR function is the existing
per-PR block (the `Promise.all([getChecks, compareBehind, getReviewState])`
plus `assessPr` plus the entry construction). Keep the final `entries.sort(...)`
unchanged — output order must be identical to today (verdict order, then
PR number), which the sort already guarantees regardless of input order.

**Verify**: `pnpm test --run src/status.test.ts` → existing tests still pass.

### Step 3: Use it in `listBranches`

In `src/github.ts`, restructure `listBranches` so each branch's compare and
commit requests run in parallel (`Promise.all`) and branches run through the
same concurrency-bounded pattern (pool size 8). `src/status.ts` must not
import from `src/github.ts` internals — duplicate the tiny helper in
`src/github.ts` (or move it to a shared `src/pool.ts` and import from both;
either is acceptable, prefer the shared module if you create it, and update
the in-scope list note in your report).

The default-branch skip (`if (name === defaultBranch) continue;`) moves into
the filter before pooling:

```ts
const others = branches.filter((b) => b.name !== defaultBranch);
```

**Verify**: `pnpm test --run src/github.test.ts` → existing tests still pass.

### Step 4: Tests proving concurrency and preserved semantics

In `src/status.test.ts`:

1. **Concurrent fan-out**: a fetch stub that records the number of requests
   in flight (increment on entry, decrement in a following microtask/
   `Promise.resolve().then`) over `manyPrs(4)` — assert the max observed
   concurrency is > 1 (the old sequential code would be exactly 1 at any
   per-PR level beyond the inner three) and ≤ 8.
2. **Order preserved**: stub responses so PR number 2 resolves slower than
   PR number 1 (delay PR 1's responses by one macro-task); assert the
   resulting `prs` array is still sorted by verdict then number.
3. **Section failure semantics unchanged**: make one PR's `getChecks`
   respond malformed — the snapshot's `prs` section is `ok: false` and
   `shipSignal` is `"unknown"` exactly as the existing degradation tests
   require.

In `src/github.test.ts`:

4. **listBranches parallel**: with 3 non-default branches, assert the
   returned array matches branch input order, and reuse the in-flight
   counter pattern from case 1 to assert max observed concurrency > 1 across
   the branch requests.

**Verify**: `pnpm test --run` → all pass, including the 4 new tests.

### Step 5: Full regression + QA

**Verify**:

1. `pnpm lint && pnpm typecheck && pnpm test --run` → all green.
2. If the plan-001 QA harness is present (`scripts/qa-mock.mjs`): run
   `pnpm build && GITHUB_TOKEN=dummy SHIPCHECK_REPO=octocat/hello node scripts/qa-mock.mjs &`,
   then `python3 scripts/qa.py render 3211` → `render: 10/10`. This proves the
   page-level behavior did not change. If the harness is not present (plan 001
   not yet executed), note that in your report and rely on the unit suite alone.

## Test plan

- New cases 1–4 above; structural pattern: the URL-routed stub tests in
  `src/status.test.ts` (see "60s request cache" and "branches degradation"
  there for stub/clock idioms).
- Verification: `pnpm test --run` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test --run` exits 0 with the 4 new tests passing
- [ ] `grep -n "for (const record of records)" src/status.ts` returns no
      matches (the sequential loop is gone)
- [ ] Output ordering and section-failure semantics unchanged (cases 2–3)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The quoted loop shapes in "Current state" do not match (drift).
- A degradation or cache test fails for a reason you cannot trace to a
  concurrency-ordering bug in your own helper within two attempts.
- Preserving output order requires buffering responses differently per
  section — report what you found instead of inventing a new ordering rule.

## Maintenance notes

- The pool size (8) is a burst guard against GitHub secondary rate limits;
  if a real deployment ever logs `rate-limit` failures during cold snapshots,
  lower it or add retry-after awareness (recorded as explicitly out of scope).
- Reviewer scrutiny: the pooled-map helper's index advancement; per-PR failure
  still failing the whole `prs` section (case 3); unchanged sort behavior.
