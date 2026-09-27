# Plan 002: URL-encode refs in GitHub API paths and tighten the repo config charset

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c155cc5..HEAD -- src/github.ts src/config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c155cc5`, 2026-09-27

## Why this matters

Branch and tag names may legally contain spaces, `?`, `#`, `+`, or `%`. The
GitHub client interpolates refs directly into API path segments, so such a
name produces a broken or misrouted URL (a `?` truncates the path into a
query string; a `#` is not sent at all) and the compare request fails — which
fails the whole PR or branches section and degrades the page to "unknown".
Similarly, `SHIPCHECK_REPO` validation allows `?`, `#`, and `&` in owner or
name, injecting query syntax into every API path. Both are one-line-class
fixes with clear tests.

## Current state

- `src/github.ts` — the only module that talks to the GitHub REST API.
  Two spots interpolate raw ref strings into path segments:

  In `compareBehind` (around line 346):

  ```ts
  const comparison = await get(
    `/repos/${config.owner}/${config.name}/compare/${baseRef}...${headSha}`,
    parseComparison,
  );
  ```

  In `listBranches` (around line 362):

  ```ts
  const comparison = await get(
    `/repos/${config.owner}/${config.name}/compare/${defaultBranch}...${sha}`,
    parseComparison,
  );
  ```

  `headSha`/`sha` are 40-hex commit SHAs (safe); `baseRef`, `defaultBranch`,
  and branch `name` are attacker/repo-controlled strings (branch names come
  from `parseBranch`, PR base names from `parsePr`).
- `src/config.ts` — repo validation, line 13:

  ```ts
  const repoPattern = /^[^/\s]+\/[^/\s]+$/;
  ```

  `[^/\s]+` admits any character except `/` and whitespace — including
  `?`, `#`, `&`, and `..`.
- `config.owner` and `config.name` are interpolated into every path in
  `src/github.ts` (`/repos/${config.owner}/${config.name}/...`).
- Test conventions: `src/github.test.ts` stubs `globalThis.fetch` via a
  `stubFetch` helper (a queue that repeats its last entry) and asserts on
  request URLs; `src/config.test.ts` tests `loadConfig(env)` with literal env
  records. Match those patterns.
- Constraint to honor (from the module header comment): errors are typed and
  server-authored; validation failures must surface as `GithubError("malformed", ...)`,
  never raw URLs. Note `config.ts` validates at startup (throws `Error`
  before the server starts) — keep that behavior; only tighten the pattern.

## Commands you will need

| Purpose   | Command                     | Expected on success                     |
|-----------|-----------------------------|-----------------------------------------|
| Typecheck | `pnpm typecheck`            | exit 0                                  |
| Tests     | `pnpm test --run`           | all pass (8 files / 92 tests at c155cc5)|
| Lint      | `pnpm lint`                 | exit 0                                  |

## Scope

**In scope** (the only files you should modify):
- `src/github.ts` (encode refs in the two compare calls; add a small helper)
- `src/config.ts` (tighten `repoPattern`)
- `src/github.test.ts` (new tests)
- `src/config.test.ts` (new tests)

**Out of scope** (do NOT touch, even though they look related):
- `src/status.ts`, `src/verdicts.ts`, `src/hygiene.ts` — no behavioral change
  is intended beyond encoding.
- `src/contracts/status.ts` — the frozen contract; `headRefName`/`baseRefName`
  in responses stay raw display strings (they render as text on the page).
- Any other API path in `src/github.ts` — PR numbers and SHAs are already
  numeric/hex; do not add encoding where input is already constrained.

## Git workflow

- Branch: `advisor/002-encode-api-refs`
- Conventional Commits, ≤72-char subject, e.g. `fix: URL-encode refs in compare paths and tighten repo config`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add and use a ref-encoding helper in `src/github.ts`

Near the other module-level helpers (after `assert`), add:

```ts
/** Ref names appear in path segments; encode everything (including `/` in
 * `feature/x`), which the GitHub compare API accepts. */
function encodeRef(ref: string): string {
  return encodeURIComponent(ref);
}
```

Then wrap the three raw ref interpolations:

- `compareBehind`: `` `/repos/${config.owner}/${config.name}/compare/${encodeRef(baseRef)}...${headSha}` ``
- `listBranches` comparison: `` `.../compare/${encodeRef(defaultBranch)}...${sha}` ``

`config.owner`/`config.name` are handled by Step 2 (validation), not here.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Tighten `src/config.ts` repo charset

Replace line 13 with a pattern that admits only characters GitHub itself
allows in owner and repo names (letters, digits, `-`, `_`, `.`), anchored at
both ends:

```ts
const repoPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/;
```

(Owners must start with a letter or digit; repo names may start with `.` —
e.g. `.github` — so only the owner half gets the leading-character rule.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Tests

In `src/github.test.ts`, add cases to the appropriate `describe` blocks
(following the existing `stubFetch` usage):

1. `compareBehind("feature/one", "abc123")` — assert the fetched URL contains
   `/compare/feature%2Fone...abc123` and returns `true` for a behind_by of 1.
2. `compareBehind("feat space", ...)` — URL contains `feat%20space`.
3. `compareBehind("bad?name", ...)` — URL contains `bad%3Fname` (a `?` can no
   longer truncate the path).
4. `listBranches` with branches named `feat/one` and `hot fix` — both
   comparison URLs contain the encoded forms.

In `src/config.test.ts`:

5. `loadConfig({ GITHUB_TOKEN: "t", SHIPCHECK_REPO: "o?x/name" })` throws.
6. `SHIPCHECK_REPO: "owner/name#frag"` throws.
7. `SHIPCHECK_REPO: "owner.name/sub_dir-1"` succeeds (regression guard for
   legitimate characters).
8. `SHIPCHECK_REPO: ".github-ci/labels"` succeeds (repo may start with a dot).

**Verify**: `pnpm test --run` → all pass, including 8 new tests.

### Step 4: Full regression

**Verify**: `pnpm lint && pnpm typecheck && pnpm test --run` → all green.

## Test plan

- New cases 1–4 in `src/github.test.ts` (URL assertion pattern already used
  by the pagination tests there — copy how they capture `input` from
  `stubFetch`).
- New cases 1–4 in `src/config.test.ts`.
- Verification: `pnpm test --run` → all pass, 8 new tests.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test --run` exits 0 with the 8 new tests present and passing
- [ ] `grep -n "compare/\${" src/github.ts` returns no unencoded-ref matches
      (the two compare paths now use `encodeRef(...)`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The code at the quoted locations does not match the excerpts (drift).
- You find refs interpolated into API paths in a file other than
  `src/github.ts` — report instead of expanding scope.
- Encoding a ref causes an existing test to fail in a way that is not a URL
  assertion mismatch (e.g. a fixture relied on a raw `/` in a ref) — report;
  the fixture may encode a product assumption worth surfacing.

## Maintenance notes

- If another GitHub endpoint that takes a ref is added (e.g. listing a
  branch's commits), it must use `encodeRef` too — the helper only covers the
  two current call sites.
- Reviewer scrutiny: confirm `encodeURIComponent` is applied to refs but not
  to SHAs (SHAs are hex; encoding them would be harmless but noisy), and that
  the new config pattern still accepts this repo's own `SHIPCHECK_REPO`
  value.
