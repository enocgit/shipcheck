import type { PrReasonCode, PrVerdict } from "./contracts/status.js";

/**
 * Pure PR verdict logic (PRD-0001 FR2–FR4). No I/O, no clock reads: state and
 * "now" arrive as arguments so the rule matrix is directly testable.
 */

export interface PrState {
  /** null: GitHub has not computed mergeability yet (it is async after activity). */
  mergeable: boolean | null;
  checks: "passing" | "failing" | "pending" | "none";
  approved: boolean;
  changesRequested: boolean;
  isDraft: boolean;
  /** Head is behind the base branch by any commits. */
  behindBase: boolean;
  updatedAt: Date;
}

/** PRD FR4: idle more than 7 days is stale. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface PrAssessment {
  verdict: PrVerdict;
  reasons: PrReasonCode[];
}

export function assessPr(state: PrState, now: Date): PrAssessment {
  const reasons: PrReasonCode[] = [];

  // Merge state
  if (state.mergeable === null) reasons.push("mergeability-pending");
  else if (!state.mergeable) reasons.push("conflicting");
  else reasons.push("mergeable");

  // Checks
  const checkReason = {
    none: "no-checks",
    passing: "checks-passing",
    failing: "checks-failing",
    pending: "checks-pending",
  } as const satisfies Record<PrState["checks"], PrReasonCode>;
  reasons.push(checkReason[state.checks]);

  // Reviews
  if (state.changesRequested) reasons.push("changes-requested");
  else if (state.approved) reasons.push("approved");
  else reasons.push("missing-review");

  // State
  const idleMs = now.getTime() - state.updatedAt.getTime();
  const stale = state.behindBase || idleMs > STALE_AFTER_MS;
  if (state.isDraft) reasons.push("draft");
  if (state.behindBase) reasons.push("stale-behind-base");
  if (idleMs > STALE_AFTER_MS) reasons.push("stale-idle");
  if (!stale) reasons.push("fresh");

  const fix =
    state.mergeable === false ||
    state.checks === "failing" ||
    state.changesRequested;
  if (fix) return { verdict: "fix", reasons };

  const wait =
    state.mergeable === null ||
    state.checks === "pending" ||
    !state.approved ||
    state.isDraft ||
    stale;
  if (wait) return { verdict: "wait", reasons };

  return { verdict: "ship", reasons };
}
