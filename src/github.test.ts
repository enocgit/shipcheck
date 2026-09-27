import { afterEach, describe, expect, it, vi } from "vitest";
import { createGithubClient } from "./github.js";

const TOKEN = "ghp_test_token_value";
const REPO = { owner: "octocat", name: "hello" };
const CONFIG = { ...REPO, token: TOKEN };

const PR = {
  number: 1,
  title: "Add feature",
  state: "open",
  draft: false,
  html_url: "https://github.com/octocat/hello/pull/1",
  user: { login: "octocat" },
  head: { ref: "feat/x", sha: "abc123" },
  base: { ref: "main" },
  updated_at: "2026-09-27T11:00:00Z",
  mergeable: true,
};

function prFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return { ...PR, ...overrides };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Queue of responses (or throwables) in call order; repeats the last body when exhausted. */
function stubFetch(responses: Array<Response | Error | (() => Response)>) {
  const queue = [...responses];
  const mock = vi.fn(
    async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]): Promise<Response> => {
      const next = queue.length > 1 ? (queue.shift() as Response | Error) : queue[0]!;
      if (next instanceof Error) throw next;
      if (typeof next === "function") return next();
      return next;
    },
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** n distinct PR fixtures, so pagination tests can count them. */
function manyPrs(n: number, first = 1) {
  return Array.from({ length: n }, (_, i) =>
    prFixture({ number: first + i, head: { ref: `b${first + i}`, sha: `sha${first + i}` } }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listOpenPrs", () => {
  it("maps a PR page to state inputs", async () => {
    stubFetch([jsonResponse([prFixture()])]);
    const client = createGithubClient(CONFIG);
    const prs = await client.listOpenPrs();
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      number: 1,
      title: "Add feature",
      author: "octocat",
      isDraft: false,
      mergeable: true,
      headRefName: "feat/x",
      baseRefName: "main",
    });
    expect(prs[0]!.headSha).toBe("abc123");
    expect(prs[0]!.updatedAt).toEqual(new Date("2026-09-27T11:00:00Z"));
  });

  it("follows pagination until a short page", async () => {
    const full = manyPrs(100);
    const client = createGithubClient(CONFIG);
    const mock = stubFetch([jsonResponse(full), jsonResponse([prFixture({ number: 101 })])]);
    const prs = await client.listOpenPrs();
    expect(prs).toHaveLength(101);
    expect(String(mock.mock.calls[1]![0])).toContain("page=2");
  });

  it("passes hostile strings through as untouched data", async () => {
    const hostile = '<script>alert("x")</script>';
    stubFetch([jsonResponse([prFixture({ title: hostile, head: { ref: hostile, sha: "s" } })])]);
    const client = createGithubClient(CONFIG);
    const prs = await client.listOpenPrs();
    expect(prs[0]!.title).toBe(hostile);
    expect(prs[0]!.headRefName).toBe(hostile);
  });

  it("fails typed on 401 without leaking the token", async () => {
    stubFetch([jsonResponse({ message: "Bad credentials" }, 401)]);
    const client = createGithubClient(CONFIG);
    const error = await client.listOpenPrs().catch((e: Error) => e);
    expect((error as { kind?: string }).kind).toBe("auth");
    expect(String(error)).not.toContain(TOKEN);
  });

  it("distinguishes rate limiting from permission denial on 403", async () => {
    stubFetch([
      jsonResponse({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0" }),
      jsonResponse({ message: "Resource not accessible" }, 403, { "x-ratelimit-remaining": "4999" }),
    ]);
    const client = createGithubClient(CONFIG);
    const limited = await client.listOpenPrs().catch((e: Error) => e);
    expect((limited as { kind?: string }).kind).toBe("rate-limit");
    const forbidden = await client.listOpenPrs().catch((e: Error) => e);
    expect((forbidden as { kind?: string }).kind).toBe("forbidden");
    expect(String(forbidden)).toMatch(/permission/i);
  });

  it("fails typed on network errors", async () => {
    stubFetch([new Error("connect ECONNREFUSED")]);
    const client = createGithubClient(CONFIG);
    const error = await client.listOpenPrs().catch((e: Error) => e);
    expect((error as { kind?: string }).kind).toBe("network");
  });

  it("fails typed on malformed payloads", async () => {
    stubFetch([jsonResponse([{ number: "not-a-number" }])]);
    const client = createGithubClient(CONFIG);
    const error = await client.listOpenPrs().catch((e: Error) => e);
    expect((error as { kind?: string }).kind).toBe("malformed");
  });

  it("rejects a PR missing mergeability as malformed", async () => {
    const { mergeable: _omitted, ...withoutMergeable } = prFixture();
    stubFetch([jsonResponse([withoutMergeable])]);
    const client = createGithubClient(CONFIG);
    const error = await client.listOpenPrs().catch((e: Error) => e);
    expect((error as { kind?: string }).kind).toBe("malformed");
  });

  it("accepts null mergeability (pending computation)", async () => {
    stubFetch([jsonResponse([prFixture({ mergeable: null })])]);
    const client = createGithubClient(CONFIG);
    const prs = await client.listOpenPrs();
    expect(prs[0]!.mergeable).toBeNull();
  });

  it("rejects a PR missing the draft flag as malformed", async () => {
    const { draft: _omitted, ...withoutDraft } = prFixture();
    stubFetch([jsonResponse([withoutDraft])]);
    const client = createGithubClient(CONFIG);
    const error = await client.listOpenPrs().catch((e: Error) => e);
    expect((error as { kind?: string }).kind).toBe("malformed");
  });

  it("rejects a PR with a non-GitHub URL at the boundary", async () => {
    stubFetch([jsonResponse([prFixture({ html_url: "javascript:alert(1)" })])]);
    const client = createGithubClient(CONFIG);
    const error = await client.listOpenPrs().catch((e: Error) => e);
    expect((error as { kind?: string }).kind).toBe("malformed");
  });
});

describe("getChecks", () => {
  const run = (conclusion: string | null, status = "completed") => ({
    id: 1,
    status,
    conclusion,
  });

  /** getChecks calls check-runs (paginated) then combined status, in that order. */
  const twoResponses = (runs: unknown[], statusState: string, statusTotal = runs.length) => [
    jsonResponse({ total_count: runs.length, check_runs: runs }),
    jsonResponse({ state: statusState, total_count: statusTotal }),
  ];

  it("aggregates passing check runs and statuses", async () => {
    stubFetch(twoResponses([run("success"), run("success")], "success"));
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("passing");
  });

  it("treats any failing run as failing", async () => {
    stubFetch(twoResponses([run("success"), run("failure")], "success"));
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("failing");
  });

  it("treats a failing run as failing even when another run is pending", async () => {
    stubFetch(twoResponses([run("failure"), run(null, "in_progress")], "success"));
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("failing");
  });

  it("treats in-progress runs as pending", async () => {
    stubFetch(twoResponses([run(null, "in_progress")], "success"));
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("pending");
  });

  it("treats a failing commit status as failing even with no check runs", async () => {
    stubFetch(twoResponses([], "failure", 2));
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("failing");
  });

  it("treats a pending commit status as pending", async () => {
    stubFetch(twoResponses([], "pending", 1));
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("pending");
  });

  it("treats no runs and no statuses as none", async () => {
    stubFetch(twoResponses([], "none", 0));
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("none");
  });

  it("treats neutral and skipped conclusions as not failing", async () => {
    stubFetch(twoResponses([run("neutral"), run("skipped")], "success"));
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("passing");
  });

  it("ignores a pending combined status with zero contexts", async () => {
    stubFetch(twoResponses([], "pending", 0));
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("none");
  });

  it("pages check runs to completion", async () => {
    const page1 = Array.from({ length: 100 }, () => run("success"));
    const mock = vi.fn(
      async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
        const url = String(input);
        if (url.includes("/check-runs")) {
          return /[?&]page=1&/.test(url)
            ? jsonResponse({ total_count: 101, check_runs: page1 })
            : jsonResponse({ total_count: 101, check_runs: [run("failure")] });
        }
        return jsonResponse({ state: "success", total_count: 0 });
      },
    );
    vi.stubGlobal("fetch", mock);
    const client = createGithubClient(CONFIG);
    expect(await client.getChecks("abc123")).toBe("failing");
    expect(String(mock.mock.calls[1]![0])).toContain("page=2");
  });

  it("classifies a secondary rate limit (retry-after) as rate-limit", async () => {
    stubFetch([
      jsonResponse({ message: "You have exceeded a secondary rate limit" }, 403, { "retry-after": "30" }),
    ]);
    const client = createGithubClient(CONFIG);
    const error = await client.listOpenPrs().catch((e: Error) => e);
    expect((error as { kind?: string }).kind).toBe("rate-limit");
  });
});

describe("getReviewState", () => {
  const review = (login: string, state: string) => ({ user: { login }, state });

  it("aggregates the latest review per user", async () => {
    stubFetch([jsonResponse([review("alice", "CHANGES_REQUESTED"), review("bob", "APPROVED"), review("alice", "APPROVED")])]);
    const client = createGithubClient(CONFIG);
    expect(await client.getReviewState(1)).toEqual({ approved: true, changesRequested: false });
  });

  it("keeps changes-requested when it is a user's latest state", async () => {
    stubFetch([jsonResponse([review("alice", "APPROVED"), review("alice", "CHANGES_REQUESTED"), review("bob", "APPROVED")])]);
    const client = createGithubClient(CONFIG);
    expect(await client.getReviewState(1)).toEqual({ approved: true, changesRequested: true });
  });

  it("a later COMMENTED review does not erase a change request", async () => {
    stubFetch([jsonResponse([review("alice", "CHANGES_REQUESTED"), review("alice", "COMMENTED")])]);
    const client = createGithubClient(CONFIG);
    expect(await client.getReviewState(1)).toEqual({ approved: false, changesRequested: true });
  });

  it("a DISMISSED review clears the user's state", async () => {
    stubFetch([jsonResponse([review("alice", "CHANGES_REQUESTED"), review("alice", "DISMISSED")])]);
    const client = createGithubClient(CONFIG);
    expect(await client.getReviewState(1)).toEqual({ approved: false, changesRequested: false });
  });

  it("returns all-false with no reviews", async () => {
    stubFetch([jsonResponse([])]);
    const client = createGithubClient(CONFIG);
    expect(await client.getReviewState(1)).toEqual({ approved: false, changesRequested: false });
  });

  it("follows pagination for reviews", async () => {
    const page1 = manyPrs(100).map((_, i) => review(`u${i}`, "COMMENTED"));
    stubFetch([jsonResponse(page1), jsonResponse([review("bob", "APPROVED")])]);
    const client = createGithubClient(CONFIG);
    expect(await client.getReviewState(1)).toEqual({ approved: true, changesRequested: false });
  });
});

describe("listBranches", () => {
  it("maps branch and comparison data with the real commit shape", async () => {
    stubFetch([
      jsonResponse([
        { name: "feat/x", commit: { sha: "abc" } },
        { name: "feat/y", commit: { sha: "def" } },
      ]),
      jsonResponse({ ahead_by: 1, behind_by: 2 }),
      jsonResponse({ commit: { committer: { date: "2026-09-27T10:00:00Z" } } }),
      jsonResponse({ ahead_by: 0, behind_by: 0 }),
      jsonResponse({ commit: { committer: { date: "2026-09-01T10:00:00Z" } } }),
    ]);
    const client = createGithubClient(CONFIG);
    const branches = await client.listBranches("main");
    expect(branches).toEqual([
      { name: "feat/x", ahead: 1, behind: 2, lastCommitAt: new Date("2026-09-27T10:00:00Z") },
      { name: "feat/y", ahead: 0, behind: 0, lastCommitAt: new Date("2026-09-01T10:00:00Z") },
    ]);
  });

  it("follows pagination for branches", async () => {
    const hundred = manyPrs(100).map((p) => ({ name: `b${p.number}`, commit: { sha: p.head!.sha } }));
    const mock = vi.fn(
      async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
        const url = String(input);
        if (url.includes("/branches?")) {
          return /[?&]page=1&/.test(url)
            ? jsonResponse(hundred)
            : jsonResponse([{ name: "extra", commit: { sha: "xyz" } }]);
        }
        if (url.includes("/compare/")) return jsonResponse({ ahead_by: 0, behind_by: 1 });
        return jsonResponse({ commit: { committer: { date: "2026-09-01T10:00:00Z" } } });
      },
    );
    vi.stubGlobal("fetch", mock);
    const client = createGithubClient(CONFIG);
    const branches = await client.listBranches("main");
    expect(branches).toHaveLength(101);
    expect(String(mock.mock.calls[1]![0])).toContain("page=2");
  });

  it("skips the default branch entirely", async () => {
    stubFetch([
      jsonResponse([{ name: "main", commit: { sha: "fff" } }, { name: "feat/x", commit: { sha: "abc" } }]),
      jsonResponse({ ahead_by: 0, behind_by: 0 }),
      jsonResponse({ commit: { committer: { date: "2026-09-01T10:00:00Z" } } }),
    ]);
    const client = createGithubClient(CONFIG);
    const branches = await client.listBranches("main");
    expect(branches.map((b) => b.name)).toEqual(["feat/x"]);
  });
});

describe("getDefaultBranch", () => {
  it("returns the repo's default branch name", async () => {
    stubFetch([jsonResponse({ default_branch: "main" })]);
    const client = createGithubClient(CONFIG);
    expect(await client.getDefaultBranch()).toBe("main");
  });
});

describe("token hygiene", () => {
  it("sends the token as a bearer header, never in the URL", async () => {
    const mock = stubFetch([jsonResponse([])]);
    const client = createGithubClient(CONFIG);
    await client.listOpenPrs();
    const [url, init] = mock.mock.calls[0]!;
    expect(String(url)).not.toContain(TOKEN);
    expect(init).toMatchObject({
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
  });

  it("error messages never contain the token even when failures embed URLs", async () => {
    stubFetch([new TypeError("fetch failed https://api.github.com/repos?token=leak-attempt")]);
    const client = createGithubClient(CONFIG);
    const error = await client.listOpenPrs().catch((e: Error) => e);
    expect(String(error)).not.toContain(TOKEN);
    expect((error as { kind?: string }).kind).toBe("network");
  });
});
