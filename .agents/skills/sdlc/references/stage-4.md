# Stage 4 — Implement

Read this before any Stage 4 work. The verification rules this stage acts on are restated below
(`references/rules.md` stays canonical); the operating standard in `AGENTS.md`.

## Per task

1. `feature-start` isolates the workspace — direct feature branch by default; a git worktree only
   as the explicit manual escape hatch for parallel or disposable work (the operator supplies and
   verifies a private, new or empty path outside every checkout; use `feature-start`'s generic
   Git-only guidance; the kit does not enforce platform-specific path safety).
2. Load the relevant PRD, ADRs, and frozen contract slice.
3. Produce a **compact in-session plan** and disclose it, then implement. The plan is a gate only
   when the task touches a **sensitive area** (canonical list: `AGENTS.md` → Sensitive areas) or
   the plan **deviates from the approved decomposition** — in those cases stop for approval.
   Otherwise state the plan and proceed; the human can interrupt at any time.
4. One feature in flight per branch; one task at a time. Reference the tracker issue (its `#`/key)
   in commits/PRs when the task has one.

## Skills

- `feature-start` — workspace, context load, compact plan.
- `frontend-design` — UI work only.
- `ponytail` — backend/domain logic, parsers, transformations, state, tooling, and dependency
  choices. It cannot override contracts, security, accessibility, explicit requirements, or
  proportional verification; its one-check rule is a minimum, never a cap.

## Definition of Ready (before implementing a task)

Acceptance criteria written and testable; the applicable contract frozen or explicitly N/A for
fast-path work with no integration contract; the frozen contract matching its accepted ADR and the
`docs/architecture.md` update; no open questions. Full list: `AGENTS.md` → Definition of Ready.

## While implementing

- **Verification in force:** the smallest local check that proves the change — a bug fix starts
  from a failing automated test or observable reproducer; non-trivial executable behavior
  (validation, authorization or security denial, error, retry, timeout, partial-failure branches)
  gets focused automated coverage, RED → GREEN; shared paths, contracts, and sensitive areas
  broaden coverage to all impacted packages. A full-suite run is never the local default.
- Never let implementation drift from the frozen contract.
- Keep the relevant doc (`architecture.md` / ADR) updated as you go; task status lives in the
  tracker, never in doc prose.
- After the commit, verify its parent and tree, and rerun every metadata- or topology-dependent
  check against that commit before relying on it.

## Next

After this stage's gate approval or proceed-disclosure, announce Stage 5 and read
`references/stage-5.md` before acting on it — the skill alone is not the procedure.
