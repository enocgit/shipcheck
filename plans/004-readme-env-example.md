# Plan 004: Add a README and .env.example so setup is discoverable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c155cc5..HEAD -- package.json src/config.ts docs/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `c155cc5`, 2026-09-27

## Why this matters

The repo has no root README: the two required environment variables
(`GITHUB_TOKEN`, `SHIPCHECK_REPO`), the run command, and the test commands
exist only inside `docs/` planning artifacts, which a newcomer (human or
agent) will not read first. Setup friction is the cost; a wrong first run
(forgotten env var → startup error naming only `GITHUB_TOKEN`) is the
failure mode.

## Current state

- `package.json` scripts (lines 9–15):

  ```json
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "test": "vitest"
  ```

  (plus `start` if present — check the live file and document what exists).
- `src/config.ts` — startup env contract: `GITHUB_TOKEN` (required, a
  read-only fine-grained token) and `SHIPCHECK_REPO` (required,
  `owner/name`, pattern `/^[^/\s]+\/[^/\s]+$/`). Missing values throw at
  startup with messages naming the variable but not the value.
- `src/index.ts` — binds `127.0.0.1` on `PORT` (default 3000) and prints
  `shipcheck: serving <owner>/<name> on http://127.0.0.1:<port>`. The
  loopback bind is deliberate (no viewer auth in v1) — the README must state
  it as intended behavior, not a bug.
- `docs/context.md` — product framing (one repo per instance, read-only
  token, no persistence). `docs/architecture.md` — system shape. The README
  should link these rather than duplicate them (repo convention: docs lead
  with links; AGENTS.md's writing standard applies).
- Node 22+ is the floor (ADR-0002, amended; CI runs Node 24). pnpm is the
  package manager (lockfile `pnpm-lock.yaml`, `packageManager` field in
  `package.json`).

## Commands you will need

| Purpose | Command           | Expected on success |
|---------|-------------------|---------------------|
| Lint    | `pnpm lint`       | exit 0 (docs are linted) |

## Scope

**In scope** (the only files you should create or modify):
- `README.md` (create, repo root)
- `.env.example` (create, repo root)
- `package.json` (only if a `"start"` script is missing and worth adding —
  see Step 2; otherwise untouched)

**Out of scope** (do NOT touch):
- Everything under `docs/` — the planning docs are already accurate; link,
  don't copy.
- Any source file.

## Git workflow

- Branch: `advisor/004-readme-env-example`
- Conventional Commits, ≤72-char subject, e.g. `docs: add README and .env.example`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write `.env.example`

Create `.env.example` with exactly this content:

```sh
# A fine-grained GitHub token with read-only access to the target repo
# (Contents, Pull requests, Checks, Metadata read permissions).
GITHUB_TOKEN=

# The repo to report on, as owner/name.
SHIPCHECK_REPO=octocat/hello-world

# Optional: port the server listens on (default 3000, bound to 127.0.0.1).
# PORT=3000
```

### Step 2: Write the README

Keep it short and factual (one point per line, per the repo's writing
standard). Required sections and content:

1. **What it is** — two sentences: Shipcheck answers "can I ship today?" for
   one GitHub repository: per-PR verdicts (ship/fix/wait with reasons), a
   branch-hygiene panel, and an overall ship signal, refreshed from the
   GitHub REST API every 60 seconds. Link `docs/context.md` for the product
   framing and `docs/architecture.md` for the system shape.
2. **Requirements** — Node 22+ and pnpm (see `packageManager` in
   `package.json`); a GitHub fine-grained personal access token with
   read-only access to the target repo (Contents, Pull requests, Checks,
   Metadata read).
3. **Setup** — `pnpm install`; `cp .env.example .env` (or export the
   variables); name both variables and what they mean; point at
   `.env.example`.
4. **Run** — `pnpm dev` for development, `pnpm build && node dist/index.js`
   for production-shaped runs; the server binds `127.0.0.1:3000` by default
   and is reachable only from the local machine by design; `PORT` overrides
   the port. Open `http://127.0.0.1:3000`.
5. **Verify** — `pnpm lint`, `pnpm typecheck`, `pnpm test --run`,
   `pnpm build` (CI runs exactly these).
6. **Layout** — one short pointer list: `src/contracts/status.ts` (the API
   contract), `docs/prd/`, `docs/adr/`, `docs/security.md`. One line each.

If `package.json` has no `"start": "node dist/index.js"` script, add it and
document `pnpm start` in section 4; if it exists, just document it.

**Verify**: `pnpm lint` → exit 0.

### Step 3: Sanity-check the instructions against reality

Run the documented setup path in a scratch shell (do not modify anything):

```bash
node --version        # confirm the floor claim is not contradicted by your runtime
pnpm install          # already-installed repo: exits 0
GITHUB_TOKEN=dummy SHIPCHECK_REPO=octocat/hello-world pnpm build && GITHUB_TOKEN=dummy SHIPCHECK_REPO=octocat/hello-world node dist/index.js &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000   # expect 200
kill %1
```

**Verify**: the curl prints `200`. If the README's claims diverge from
observed behavior (port, bind, script names), fix the README, not the code —
and if the code itself is wrong (e.g. the server does not come up), STOP and
report.

## Test plan

- Documentation-only change; the verification is the Step 2/3 command run and
  the lint gate. No new automated tests.

## Done criteria

- [ ] `README.md` exists at the repo root with all six sections
- [ ] `.env.example` exists and names both required variables
- [ ] `pnpm lint` exits 0
- [ ] The Step 3 curl prints `200`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The server does not start with the documented env variables, or the curl
  does not return 200 after one retry.
- You discover a required env variable beyond the three documented here
  (report it — the config surface changed somewhere this plan didn't look).

## Maintenance notes

- If the env contract ever changes (new variable, new permission on the
  token), update `.env.example` and README section 2/3 in the same change.
- Reviewer scrutiny: claims must match observed behavior — no aspirational
  commands (every command in the README must have been run in Step 3).
