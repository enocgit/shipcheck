# Security & threat model

> Lightweight, living security doc. Update it at Foundation or Architecture whenever a
> **sensitive area** listed in `AGENTS.md` or a trust boundary changes, then revisit it at review.
> This is a working threat model, not a formal security audit.
>
> **Layout:** this file holds current truth — per-feature threat models, baseline controls, and the
> records index. Dated review records live in `docs/security/records/` (one file per feature, or an
> append-only log). A record is never edited after it is written; a new record supersedes it, and
> this file's index always points at the current one.

## Writing rules

- A feature's threat model is design content, not status: record planned and enforced controls
  without marking implementation progress — the tracker and ADRs own that state.
- Reference the shared actors and trust boundaries from the foundation threat model; restate only
  what the feature changes or adds.
- Keep each feature section scannable — header `### Feature NNNN — {name} (PRD NNNN, ADR-NNNN)`,
  the actors/boundaries this feature adds, then the threat table.

## Foundation threat model

Actors and trust boundaries for the whole system; per-feature sections below restate only deltas.

**Actors:**

- **Operator** — runs the instance and owns the GitHub token; the intended sole viewer.
- **Unauthenticated viewer** — anyone who can reach the server's port. Not authenticated in v1
  (ADR-0004); treated as hostile if the instance is reachable beyond the operator's machine.
- **GitHub API** — trusted data source but a dependency: returns data the app renders verbatim
  (PR titles, branch names, author names are attacker-influenced content).
- **Repository writers** — anyone who can open PRs, comment, or name branches in the target repo;
  they control strings and metadata the page renders.

**Trust boundaries:**

1. Browser ↔ Shipcheck server: unauthenticated HTTP; every `/api/` response is public to whoever
   can reach the port.
2. Shipcheck server ↔ GitHub API: outbound-only, token-authenticated; GitHub-derived content must
   be treated as untrusted input at the `/api/` boundary.
3. Environment ↔ process: `GITHUB_TOKEN` and repo config enter via env and must never reach logs,
   error output, or the page.

**Sensitive data:** the GitHub token (secret); repo metadata the page renders (leaks to any viewer
if exposed).

| Asset / data | Threat | Mitigation | Owner |
| ------------ | ------ | ---------- | ----- |
| `GITHUB_TOKEN` | Leaked via logs, error messages, or the rendered page | Token read once from env at startup; never logged, never included in API responses or error output; no persistence means no on-disk secret | Operator + code review |
| Repo data shown on the page | Unauthenticated viewer reads private-repo data when the instance is exposed beyond the operator | No viewer auth in v1 by decision (ADR-0004): the instance binds localhost/private use only; the production register triggers viewer auth on any wider deployment | Operator (deployment) |
| Rendered page | XSS via GitHub-sourced strings (PR titles, branch names, review bodies) that repository writers control | All GitHub-derived content validated by the Zod contract at `/api/` and HTML-escaped before render; page script never uses raw HTML injection | Feature implementation, checked in security review |
| GitHub API availability/accuracy | GitHub returns errors, partial data, or unexpected shapes | Client validates every response against the contract; per-section degradation on the page; hostile/false data cannot crash the server | Feature implementation |
| GitHub rate limit | Excessive polling exhausts the token's limit | 60s in-memory cache bounds request rate (ADR-0005); sustained-polling trigger registered | Operator |

## Per-feature threat models

Each feature section added below this line records, as a delta on the foundation set: actors,
sensitive data, trust boundaries, hostile-input behavior, and behavior when GitHub returns false
information. Planned and enforced controls are recorded without marking implementation progress;
approval or schema tests alone do not establish runtime enforcement.

### Feature 0001 — verdict page (PRD 0001, ADR-0006)

No new actors or trust boundaries beyond the foundation set; this feature is the first inhabitant
of the browser ↔ server and server ↔ GitHub boundaries.

| Asset / data | Threat | Mitigation | Owner |
| ------------ | ------ | ---------- | ----- |
| Rendered page | XSS via attacker-controlled GitHub strings (PR titles, branch names, author logins) | Enforced: Zod validation at `/api/` (`src/contracts/status.ts`, tests `src/contracts/status.test.ts`), client-side URL constraint in `src/github.ts` (parsePr), HTTPS-GitHub href guard in `src/web/app.js`, textContent-only rendering (no raw HTML injection). Evidence: browser QA 11/11 checks incl. hostile-title render with no script execution; contract tests reject `javascript:` and non-GitHub URLs | Feature implementation |
| `/api/status` responses | Malformed or hostile GitHub payloads rendered as trusted | Enforced: every GitHub response validated in `src/github.ts` (parsePr, paged collections, per-run shape, combined-status shape); schema violations surface as the typed degraded state. Evidence: malformed-payload, missing-field, and URL fixtures in `src/github.test.ts`; section-degradation tests in `src/status.test.ts` | Feature implementation |
| Error output | Token or GitHub URL (which embeds the token) leaked through error strings shown on the page or logged | Enforced: error messages in the contract are server-authored strings only; the GitHub client scrubs credential material; server binds 127.0.0.1 (`src/index.ts`). Evidence: token-hygiene tests in `src/github.test.ts`; degraded-state browser QA asserts no token in rendered content | Feature implementation |
| Section failures | Verdicts derived from partial data mislead the operator | Enforced: per-section `ok` in the contract; `shipSignal: "unknown"` whenever any section failed (contract invariant, tested in `src/hygiene.test.ts` and `src/status.test.ts`); degraded snapshots retry after 10s (`src/cache.ts` degraded flag) | Feature implementation |

## Baseline controls (check on every sensitive change)

- [ ] **AuthN/AuthZ** — every endpoint checks identity _and_ permission; no broken object-level
      access (can user A read user B's data?)
- [ ] **Input validation** — all inputs validated against the contract schema; output encoded
- [ ] **Secrets** — never in code/logs; loaded from env/secret manager; rotation possible
- [ ] **PII/KYC** — minimized, encrypted at rest where required, access logged
- [ ] **Payments** — idempotent handlers, signed/verified webhooks, no trust of client amounts
- [ ] **Transport** — TLS everywhere; secure cookies; CORS locked down
- [ ] **Dependencies** — no known-vulnerable packages (CI advisory scan)
- [ ] **Rate limiting / abuse** — on auth, payment, and enumeration-prone endpoints
- [ ] **Logging** — security events logged; no secrets/PII in logs

## Review records

`security-review` is mandatory for authentication, authorization, payments, PII/KYC, file uploads,
and admin/privileged surfaces (canonical list in `AGENTS.md`). A sensitive change is reviewed twice:
on the planning package before it lands on `main`, and on the implementation change before merge.
Close its findings before merge, and record decisions that change the security posture in an ADR.

### Records index

| Date | Feature | Review | Findings | Residual risk | Record |
| ---- | ------- | ------ | -------- | ------------- | ------ |
| 2026-09-27 | Foundation (Stage 0b planning package) | planning | 1 × MEDIUM, accepted | No viewer auth in v1 is safe only under the localhost/private deployment constraint | `records/2026-09-27-foundation-planning.md` |
| 2026-09-27 | PRD-0001 verdict page (Stage 1–2 planning package) | planning | None | Planned controls (escaping, error scrubbing, signal invariant) unverified until implementation | `records/2026-09-27-prd-0001-planning.md` |
| 2026-09-27 | PRD-0001 verdict page (implementation) | implementation | 15 across 3 rounds, all resolved | Real-GitHub runtime behavior unverified until first operator run | `records/2026-09-27-prd-0001-implementation.md` |

Each record binds the target and base identities to a stable reviewed-subject identity. When
`docs/security.md` is in scope, exclude or normalize only review-record metadata when computing that
identity; keep the threat model and baseline controls in scope. Record-only updates do not
invalidate the review. A substantive threat-model, baseline-control, or scope change needs a fresh
identity and review.

Records are durable and tool-independent: they state scope, outcome, and verification evidence —
never which agent, sub-agent, or runtime performed or reviewed the work.

Every record uses the field order below, so any record scans the same way:

- **Scope / date:** {planning or implementation scope, intended file list} / YYYY-MM-DD
- **Reviewed identity:** {target and base identities plus the stable reviewed-subject identity;
  when this file is in scope, exclude or normalize only the review-record metadata described by
  `security-review`, never the threat model or baseline controls}
- **Coverage:** {each intended file: tool-reviewed, manually reviewed, or excluded with reason;
  link a complete inventory if large. Resolve tool omissions manually; unknown coverage or
  inaccessible required files means incomplete review, not no findings.}
- **Verification limits:** {design/schema checks versus runtime checks; unverified controls.
  Refresh affected review after substantive changes.}
- **Findings:** {finding summary, or None}
- **Resolutions:** {how findings were addressed}
- **Residual risks / owners:** {remaining risk, owner, and follow-up, or None}
- **Related ADRs:** {links, or None}
