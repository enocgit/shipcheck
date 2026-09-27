import type { BranchEntry, ShipSignal } from "./contracts/status.js";

/**
 * Branch hygiene and the overall ship signal (PRD-0001 FR5–FR6). Pure logic:
 * state and "now" arrive as arguments.
 */

export interface BranchInput {
  name: string;
  ahead: number;
  behind: number;
  lastCommitAt: Date;
}

/** PRD FR5: idle more than 30 days is stale. */
const STALE_BRANCH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function assessBranches(branches: BranchInput[], now: Date): BranchEntry[] {
  return branches.map((b) => ({
    name: b.name,
    ahead: b.ahead,
    behind: b.behind,
    lastCommitAt: b.lastCommitAt.toISOString(),
    stale: b.behind > 0 || now.getTime() - b.lastCommitAt.getTime() > STALE_BRANCH_AFTER_MS,
  }));
}

export interface SignalInput {
  verdicts: Array<"ship" | "fix" | "wait">;
  /** Count of stale branches from assessBranches. */
  staleBranches: number;
  /** True when the prs or branches section failed: no honest signal from partial data. */
  anySectionFailed: boolean;
}

/** PRD FR6: ship only with all-ship verdicts and no stale branch; any fix wins; unknown on failure. */
export function deriveSignal(input: SignalInput): ShipSignal {
  if (input.anySectionFailed) return "unknown";
  if (input.verdicts.includes("fix")) return "fix";
  if (input.verdicts.length === 0 || input.verdicts.every((v) => v === "ship")) {
    return input.staleBranches === 0 ? "ship" : "wait";
  }
  return "wait";
}
