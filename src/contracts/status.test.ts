import { describe, expect, it } from "vitest";
import { prEntrySchema, statusResponseSchema } from "./status.js";

describe("prEntrySchema url constraint", () => {
  const basePr = {
    number: 1,
    title: "t",
    author: "a",
    url: "https://github.com/octocat/hello/pull/1",
    headRefName: "f",
    baseRefName: "main",
    isDraft: false,
    verdict: "ship",
    reasons: ["mergeable"],
    updatedAt: "2026-09-27T11:00:00Z",
  };

  it("accepts an HTTPS GitHub PR URL", () => {
    expect(prEntrySchema.safeParse(basePr).success).toBe(true);
  });

  it("rejects a javascript: URL", () => {
    expect(prEntrySchema.safeParse({ ...basePr, url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("rejects a non-GitHub HTTPS URL", () => {
    expect(prEntrySchema.safeParse({ ...basePr, url: "https://evil.example/pull/1" }).success).toBe(false);
  });

  it("rejects an HTTP URL", () => {
    expect(
      prEntrySchema.safeParse({ ...basePr, url: "http://github.com/octocat/hello/pull/1" }).success,
    ).toBe(false);
  });
});

describe("statusResponseSchema", () => {
  it("rejects an unknown ship signal", () => {
    const bad = {
      ok: true,
      repo: "o/h",
      generatedAt: "2026-09-27T11:00:00Z",
      shipSignal: "definitely",
      prs: { ok: true, data: [] },
      branches: { ok: true, data: [] },
    };
    expect(statusResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("requires a non-empty reason list on PR entries", () => {
    const bad = {
      ...{},
      number: 1,
      title: "t",
      author: "a",
      url: "https://github.com/o/h/pull/1",
      headRefName: "f",
      baseRefName: "m",
      isDraft: false,
      verdict: "ship",
      reasons: [],
      updatedAt: "2026-09-27T11:00:00Z",
    };
    expect(
      statusResponseSchema.safeParse({
        ok: true,
        repo: "o/h",
        generatedAt: "2026-09-27T11:00:00Z",
        shipSignal: "ship",
        prs: { ok: true, data: [bad] },
        branches: { ok: true, data: [] },
      }).success,
    ).toBe(false);
  });
});
