# Stage 3 — Decompose

Read this before any Stage 3 work. The tracker rules this stage acts on are restated below
(`references/rules.md` stays canonical); whether this stage stops or proceeds is the router's gate
table.

## Output

Tracker tasks for the feature — one epic/parent per feature, one task per child:

- **GitHub (default):** create issues with `gh issue create`, shaped per
  `.github/ISSUE_TEMPLATE/{epic,task}.md`. `--body` bypasses the template, so follow its structure
  by hand: reference line → Scope/Tasks → DoD. Link children to the epic with the tracker's native
  hierarchy (GitHub sub-issues), so merging auto-closes the set.
- **Another external tracker:** its native create call and issue types.
- **Local-only:** add one feature/epic row and its child task rows to `docs/progress.md`; put the
  feature key in each task's `Parent` column. Number the task rows in their `#` column — that
  number is the task's identifier for the rest of the pipeline (Stage 4 branches
  `feat/{id}-{slug}` from it).

The tracker is the record — no in-repo mirror. `project-status` reports the breakdown after
decomposition.

**Tracker rules in force here:**

- `Closes #N` is GitHub-only syntax — it closes the issue at merge time and is never written into
  issues or commits now. On Linear/Jira without a configured Git integration, or local-only, no
  closing keyword exists anywhere.
- Against an external tracker, `project-status` is read-only — creating issues here is the
  pipeline's one external write, done explicitly at this stage; any later transition is a separate,
  outward-facing action shown to the human first.
- **Local-only:** `docs/progress.md` _is_ the tracker; the file is uncommitted until its rows land
  with the task work's normal commit approval at the CI seam.

### Audit plan backlogs

When the work arrives from an audit or improvement pass rather than a feature PRD, the breakdown is
a **plan backlog** instead of tracker issues:

- `docs/plans/README.md` — the execution table: one row per plan with plan number, title,
  priority, effort, dependencies, and status; execute in table order unless a row's dependencies
  say otherwise.
- `docs/plans/NNN-{slug}.md` — one file per plan: why it matters, current state with evidence,
  the steps to take, the verification commands with expected results, explicit **STOP conditions**
  (states that abort the plan), and a **drift check** — a command comparing the live code against
  the state the plan was written against; if an in-scope file changed since planning, compare and
  stop when the design premise no longer holds.
- A completed plan updates its row; the backlog is the record, exactly as the tracker would be.
  Plan work still flows through Stages 4–8 per plan; a plan touching a sensitive area or a
  contract routes through the full path from its stage.

## Skills

- `writing-plans` — use its decomposition method; write the result to the tracker. Do **not**
  create `docs/superpowers/plans/`; the tracker is the record.
- `project-status` — reports the breakdown.

## After the breakdown

Disclose: the epic, its child tasks in build order, and where the record lives. Local-only mode
writes `docs/progress.md`; disclose that the file is uncommitted — it lands with the task work's
normal commit approval at the CI seam (`references/rules.md`).

## Next

After this stage's gate approval or proceed-disclosure, announce Stage 4 and read
`references/stage-4.md` before acting on it — the skill alone is not the procedure.
