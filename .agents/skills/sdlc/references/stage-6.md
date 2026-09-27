# Stage 6 — Review

Read this before any Stage 6 work. This stage is **proceed-with-disclosure**: review, fix
findings, continue. The CI seam and security-coverage musts are restated below; the full review-
topology machinery stays in `references/rules.md` (canonical).

## Fresh context first

**Reviews must not share context with implementation.** The author of a change — the agent that
wrote it — reviews it with the same blind spots that produced it, and self-review in the same
session reliably under-detects. Where the runtime allows it, run these reviews in a context that
did not implement the change: a fresh subagent, a separate session, or an external reviewer. Where
the runtime has no such mechanism, name the substitute you used (a clean re-read of only the diff
and its contract, with implementation context flushed) and why — never silently self-review.

## Mandatory reviews, in order

Run on a **clean materialization of the complete target-to-tree delta**, with evidence bound to
its target, parent, and tree, in a fresh context (above):

1. `code-review` — correctness, readability, architecture, security, performance; severity-labeled
   findings and a verdict.
2. `code-simplification` — reduce unnecessary complexity in the candidate without changing
   behavior, preserving contracts, conventions, and verification requirements.
3. `definition-of-done-review` — local readiness against `AGENTS.md`'s Definition of Done, which
   this skill deliberately embeds no copy of. Its mechanical **stale-claim scan** is part of local
   readiness: check that no doc prose carries task or decision status that belongs to the tracker
   or ADRs, and that current-behavior claims match the change's evidence.

`security-review` is **mandatory** whenever a sensitive area is touched — before landing a
sensitive Stage 0/2 planning package and again on the implementation diff at this stage. Coverage
musts, restated (`references/rules.md` → Security-review coverage is canonical): establish the
intended file scope before invoking the tool (PRD, ADRs, contracts, threat model, implementation,
tests — including staged, unstaged, and untracked files); compare the tool's actual coverage with
that scope; read omitted files directly and review them by the structured manual procedure in
`references/rules.md`; exclusions cannot waive relevant sensitive changes; if required content is
inaccessible or coverage is unknown, report incomplete coverage and **block** rather than return a
clean verdict. Record coverage and limits in a dated record under `docs/security/records/` and
index it in `docs/security.md`. The canonical sensitive-area list is `AGENTS.md` → Sensitive areas.

**Re-review after substantive fixes.** Fixes from a review round that change behavior require
another fresh-context review scoped to the fixes (and whatever they touch) — the fix author's own
test pass does not retire findings. Stop when a round returns only advisory findings; do not loop
for stylistic residue.

## The CI seam (end of this stage)

After review passes, make **one combined ask** — the don't-commit-unless-asked guardrail stops
here, not at the end of Stage 4:

- PR workflow → "Approve commit, push, and opening the PR?"
- Remote, no PR workflow → "Approve commit and push?"
- No remote → "Approve commit and merge to the local default branch?" — one combined ask; the
  approval covers the commit and the Stage 7 merge (`references/rules.md` → The CI seam).

After approval: create the commit, verify its parent and tree, rerun every metadata- or
topology-dependent check against that commit, then push or open the PR and start CI when
available. No CI workflow → CI is N/A.

## After review

Fix findings, rerun the affected review after substantive edits, and confirm the clean diff, local
DoD evidence, and pending CI state. Only then make the CI-seam ask above and continue to Stage 7.

## Next

After this stage's gate approval or proceed-disclosure, announce Stage 7 and read
`references/stage-7.md` before acting on it — the skill alone is not the procedure.
