import { describe, expect, it } from "vitest";
import { assessBranches, deriveSignal, type BranchInput } from "./hygiene.js";
import { branchEntrySchema, shipSignalSchema } from "./contracts/status.js";

const NOW = new Date("2026-09-27T12:00:00Z");
const FRESH = new Date("2026-09-27T11:00:00Z");
const OLD = new Date("2026-08-28T12:00:01Z"); // just under 30 days
const TOO_OLD = new Date("2026-08-28T11:59:59Z"); // just over 30 days

const branch = (overrides: Partial<BranchInput> = {}): BranchInput => ({
  name: "feat/x",
  ahead: 1,
  behind: 0,
  lastCommitAt: FRESH,
  ...overrides,
});

describe("assessBranches", () => {
  it("marks a healthy branch", () => {
    const [entry] = assessBranches([branch()], NOW);
    expect(entry!.stale).toBe(false);
    expect(branchEntrySchema.safeParse(entry).success).toBe(true);
  });

  it("marks stale when behind default", () => {
    const [entry] = assessBranches([branch({ behind: 3 })], NOW);
    expect(entry!.stale).toBe(true);
  });

  it("marks stale just over 30 days idle, not at just under", () => {
    const [old] = assessBranches([branch({ lastCommitAt: TOO_OLD })], NOW);
    const [fresh] = assessBranches([branch({ lastCommitAt: OLD })], NOW);
    expect(old!.stale).toBe(true);
    expect(fresh!.stale).toBe(false);
  });

  it("excludes nothing: every non-default branch is listed", () => {
    const entries = assessBranches([branch(), branch({ name: "b" })], NOW);
    expect(entries).toHaveLength(2);
  });
});

describe("deriveSignal", () => {
  const args = (over: Partial<Parameters<typeof deriveSignal>[0]>) =>
    deriveSignal({ verdicts: ["ship"], staleBranches: 0, anySectionFailed: false, ...over });

  it("is ship with all-ship verdicts and no stale branches", () => {
    expect(args({})).toBe("ship");
  });

  it("is wait when any PR waits", () => {
    expect(args({ verdicts: ["ship", "wait"] })).toBe("wait");
  });

  it("is wait when a branch is stale but all PRs ship", () => {
    expect(args({ staleBranches: 1 })).toBe("wait");
  });

  it("is fix when any PR is fix, outranking wait", () => {
    expect(args({ verdicts: ["wait", "fix"] })).toBe("fix");
  });

  it("is unknown when any section failed", () => {
    expect(args({ anySectionFailed: true, verdicts: ["ship"] })).toBe("unknown");
    expect(args({ anySectionFailed: true, verdicts: ["fix"] })).toBe("unknown");
  });

  it("never returns anything outside the contract enum", () => {
    for (const signal of [
      args({}),
      args({ verdicts: ["fix"] }),
      args({ anySectionFailed: true }),
    ]) {
      expect(shipSignalSchema.safeParse(signal).success).toBe(true);
    }
  });
});
