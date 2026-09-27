import { describe, expect, it } from "vitest";
import { assessPr, type PrState } from "./verdicts.js";
import { prVerdictSchema, type PrReasonCode } from "./contracts/status.js";

const NOW = new Date("2026-09-27T12:00:00Z");
const FRESH = new Date("2026-09-27T11:00:00Z");
const OLD = new Date("2026-09-20T12:00:01Z"); // just under 7 days
const TOO_OLD = new Date("2026-09-20T11:59:59Z"); // just over 7 days

const base: PrState = {
  isDraft: false,
  mergeable: true,
  checks: "passing",
  approved: true,
  changesRequested: false,
  behindBase: false,
  updatedAt: FRESH,
};

const assess = (overrides: Partial<PrState>, now = NOW) =>
  assessPr({ ...base, ...overrides }, now);

describe("assessPr — ship", () => {
  it("ships a mergeable, green, approved, fresh PR", () => {
    const r = assess({});
    expect(r.verdict).toBe("ship");
    expect(r.reasons).toContain("mergeable");
    expect(r.reasons).toContain("approved");
  });

  it("treats a PR with no checks configured as checks-green", () => {
    const r = assess({ checks: "none" });
    expect(r.verdict).toBe("ship");
    expect(r.reasons).toContain("no-checks");
  });
});

describe("assessPr — fix", () => {
  it("fixes on failing checks", () => {
    const r = assess({ checks: "failing" });
    expect(r.verdict).toBe("fix");
    expect(r.reasons).toContain("checks-failing");
  });

  it("fixes on changes requested", () => {
    const r = assess({ changesRequested: true });
    expect(r.verdict).toBe("fix");
    expect(r.reasons).toContain("changes-requested");
  });

  it("fixes on conflicts", () => {
    const r = assess({ mergeable: false });
    expect(r.verdict).toBe("fix");
    expect(r.reasons).toContain("conflicting");
  });

  it("fix outranks wait when failing checks and missing review combine", () => {
    const r = assess({ checks: "failing", approved: false });
    expect(r.verdict).toBe("fix");
    expect(r.reasons).toContain("checks-failing");
    expect(r.reasons).toContain("missing-review");
  });
});

describe("assessPr — wait", () => {
  it("waits on missing review", () => {
    const r = assess({ approved: false });
    expect(r.verdict).toBe("wait");
    expect(r.reasons).toContain("missing-review");
  });

  it("never ships a draft", () => {
    const r = assess({ isDraft: true, approved: false });
    expect(r.verdict).toBe("wait");
    expect(r.reasons).toContain("draft");
  });

  it("waits on pending checks", () => {
    const r = assess({ checks: "pending" });
    expect(r.verdict).toBe("wait");
    expect(r.reasons).toContain("checks-pending");
  });

  it("waits when mergeability is not yet computed", () => {
    const r = assess({ mergeable: null });
    expect(r.verdict).toBe("wait");
    expect(r.reasons).toContain("mergeability-pending");
  });

  it("waits when head is behind base", () => {
    const r = assess({ behindBase: true });
    expect(r.verdict).toBe("wait");
    expect(r.reasons).toContain("stale-behind-base");
  });

  it("waits when idle just over 7 days", () => {
    const r = assess({ updatedAt: TOO_OLD });
    expect(r.verdict).toBe("wait");
    expect(r.reasons).toContain("stale-idle");
  });

  it("stays fresh at just under 7 days", () => {
    const r = assess({ updatedAt: OLD });
    expect(r.verdict).toBe("ship");
    expect(r.reasons).toContain("fresh");
  });
});

describe("assessPr — contract shape", () => {
  it("always returns at least one reason and a contract-valid verdict", () => {
    const cases: Array<[Partial<PrState>, Date?]> = [
      [{}, NOW],
      [{ checks: "failing" }, NOW],
      [{ isDraft: true, approved: false }, NOW],
      [{ behindBase: true, updatedAt: TOO_OLD }, NOW],
      [{ mergeable: null, checks: "pending", approved: false }, NOW],
    ];
    for (const [overrides, now] of cases) {
      const r = assess(overrides, now!);
      expect(r.reasons.length).toBeGreaterThan(0);
      expect(prVerdictSchema.safeParse(r.verdict).success).toBe(true);
      for (const reason of r.reasons) {
        // every reason must be one of the frozen enum codes
        expect([
          "mergeable",
          "conflicting",
          "mergeability-pending",
          "checks-passing",
          "checks-failing",
          "checks-pending",
          "no-checks",
          "approved",
          "changes-requested",
          "missing-review",
          "draft",
          "stale-behind-base",
          "stale-idle",
          "fresh",
        ]).toContain(reason satisfies PrReasonCode);
      }
    }
  });
});
