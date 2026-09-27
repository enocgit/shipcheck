import { z } from "zod";

/**
 * Frozen contract for `GET /api/status` (PRD-0001, ADR-0006).
 *
 * Frozen at Stage 2, 2026-09-27. This file is the single source for runtime validation and the
 * TypeScript types consumed by both the server routes and the page script. Changing a field after
 * consumers implement against it requires the amendment matrix in docs/contracts/README.md.
 *
 * Invariant not expressible in the schema itself, enforced by the verdict engine and tested:
 * `shipSignal` is `"unknown"` if and only if at least one section reports `ok: false`.
 *
 * Every GitHub-derived string here is attacker-influenced content (PR titles, branch names,
 * author logins — see docs/security.md). The page must HTML-escape all of it; server-side Zod
 * validation is the first containment line, escaping is the second.
 */

/** Stable reason codes; the page owns the human wording. */
export const prReasonCodeSchema = z.enum([
  // merge state
  "mergeable",
  "conflicting",
  "mergeability-pending",
  // checks
  "checks-passing",
  "checks-failing",
  "checks-pending",
  "no-checks",
  // reviews
  "approved",
  "changes-requested",
  "missing-review",
  // state
  "draft",
  "stale-behind-base",
  "stale-idle",
  "fresh",
]);
export type PrReasonCode = z.infer<typeof prReasonCodeSchema>;

export const prVerdictSchema = z.enum(["ship", "fix", "wait"]);
export type PrVerdict = z.infer<typeof prVerdictSchema>;

const isoDatetime = z.string().datetime({ offset: true });

export const prEntrySchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  author: z.string(),
  url: z.string().url(),
  headRefName: z.string(),
  baseRefName: z.string(),
  isDraft: z.boolean(),
  verdict: prVerdictSchema,
  /** At least one reason always; every verdict is explainable from the page alone. */
  reasons: z.array(prReasonCodeSchema).min(1),
  updatedAt: isoDatetime,
});
export type PrEntry = z.infer<typeof prEntrySchema>;

export const branchReasonCodeSchema = z.enum(["healthy", "stale-behind-default", "stale-idle"]);
export type BranchReasonCode = z.infer<typeof branchReasonCodeSchema>;

export const branchEntrySchema = z.object({
  name: z.string(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  lastCommitAt: isoDatetime,
  stale: z.boolean(),
});
export type BranchEntry = z.infer<typeof branchEntrySchema>;

/**
 * A section either succeeded with its data or failed as a whole. `error` is our own message about
 * the failure (auth, rate limit, network, malformed payload) — never GitHub-derived content and
 * never containing the token.
 */
const prsSectionSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.array(prEntrySchema) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
const branchesSectionSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.array(branchEntrySchema) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const shipSignalSchema = z.enum(["ship", "fix", "wait", "unknown"]);
export type ShipSignal = z.infer<typeof shipSignalSchema>;

export const statusResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    /** `owner/name` of the configured repo; the page titles itself from this. */
    repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    generatedAt: isoDatetime,
    shipSignal: shipSignalSchema,
    prs: prsSectionSchema,
    branches: branchesSectionSchema,
  }),
  /** Whole-request failure: the operator-facing error state. Same rules for `error` as above. */
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type StatusResponse = z.infer<typeof statusResponseSchema>;
