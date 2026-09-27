import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("accepts a valid token and owner/name repo", () => {
    expect(loadConfig({ GITHUB_TOKEN: "t", SHIPCHECK_REPO: "octocat/hello" })).toEqual({
      token: "t",
      owner: "octocat",
      name: "hello",
    });
  });

  it("fails when GITHUB_TOKEN is missing", () => {
    expect(() => loadConfig({ SHIPCHECK_REPO: "o/r" })).toThrow(/GITHUB_TOKEN/);
  });

  it.each(["", "octocat", "/name", "owner/", "owner/name/extra", "owner/na me"])(
    "rejects malformed SHIPCHECK_REPO %j",
    (repo) => {
      expect(() => loadConfig({ GITHUB_TOKEN: "t", SHIPCHECK_REPO: repo })).toThrow(
        /SHIPCHECK_REPO/,
      );
    },
  );

  it("never echoes the token value in an error", () => {
    try {
      loadConfig({ GITHUB_TOKEN: "ghp_super_secret_value", SHIPCHECK_REPO: "nope" });
      expect.unreachable("expected loadConfig to throw");
    } catch (error) {
      expect(String(error)).not.toContain("ghp_super_secret_value");
    }
  });
});
