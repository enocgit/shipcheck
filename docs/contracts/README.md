# Contracts

> Follow the documentation writing standard in AGENTS.md. Keep contract docs precise and
> scan-first: authoritative paths, request/response shape, auth, validation, errors, compatibility,
> and freeze status before examples or extended notes.
>
> Contracts are the integration **source of truth** between frontend, backend, and services.
> They are _artifacts, not prose_: they live in the codebase and provide the types both sides
> consume, either by generating them or sharing them directly. This reduces structural drift from
> the code. This folder documents where they live and the rules around them.

## Where the contract artifacts live

- **HTTP API:** Zod schemas in `src/contracts/*.ts` — the single source for runtime validation and
  the TypeScript types consumed by both the `/api/` routes and the page script
  (future — not built yet; established by the first feature's Stage 2 contract freeze).
- **Database:** none — the GitHub REST API is the only store (ADR-0005); no schema artifacts exist
  or will exist.
- **Boundary documents:** none currently; add here only when an interface needs prose beyond the
  schemas.

## The contract-first rule

1. Define or extend the contract **before** implementation.
2. **Freeze** it before consumers implement against it.
3. Share contract-defined types directly (`src/contracts/` is imported by both sides); never
   hand-duplicate shapes.
4. Changing a **shipped** contract endpoint/field with a deployed consumer is a decision: write a
   new ADR covering versioning/deprecation and backward compatibility. No silent breaking changes.
   With no deployed consumer, compatibility versioning can be deferred: change the contract outright
   only under the ADR matrix, with applicable human approval and a re-freeze, and record the deferral
   in the production register in `docs/context.md`.

## Checklist when adding/changing a contract

- [ ] Request/response shapes + error cases specified
- [ ] Validation rules (required, formats, limits)
- [ ] Auth/permission requirements per endpoint
- [ ] Pagination/filtering conventions followed
- [ ] Backward compatibility considered (and ADR if breaking)
- [ ] Types shared directly from the contract; both sides compile
