# Security review record — 2026-09-27 — Foundation planning package

- **Scope / date:** Stage 0b planning package (docs only): `AGENTS.md`, `docs/context.md`,
  `docs/prd/0000-product.md`, `docs/adr/0002…0006`, `docs/architecture.md`, `docs/security.md`,
  `docs/contracts/README.md`, `docs/test-strategy.md` / 2026-09-27
- **Reviewed identity:** target `main` tip `d5bc3f9` (base) → working tree (uncommitted
  foundation package); subject identity = content of the listed files at review time
- **Coverage:** all 12 intended files manually reviewed (docs-only change; no code, tests, or
  lockfile exists yet, so no tool diff scan applies). No exclusions. No gaps.
- **Verification limits:** design-only review — certifies the recorded posture, not runtime
  enforcement. Planned controls (token handling, Zod validation at `/api/`, HTML escaping) have no
  implementation evidence yet; they must be re-reviewed at Stage 6 on the implementation diff.
- **Findings:** one MEDIUM-confidence observation: ADR-0004's no-viewer-auth decision leaves
  `/api/` responses public to anyone who can reach the server port; the safeguard is a deployment
  constraint (localhost/private use) recorded in `docs/security.md` and the production register.
- **Resolutions:** accepted with rationale — v1 is an operator tool per product scope; wider
  exposure triggers viewer authentication in the production register; constraint restated in
  ADR-0004, `docs/security.md`, and the PRD.
- **Residual risks / owners:** public GitHub repo must never contain the token (owner: enoch,
  ongoing); planned controls unverified until implementation (owner: Stage 6 review).
- **Related ADRs:** [ADR-0004](../../adr/0004-auth-and-token-model.md),
  [ADR-0005](../../adr/0005-datastore.md), [ADR-0006](../../adr/0006-api-style.md)
