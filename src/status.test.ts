import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { statusResponseSchema, type StatusResponse } from "./contracts/status.js";

const CONFIG = { token: "ghp_test_token_value", owner: "octocat", name: "hello" };
const NOW = new Date("2026-09-27T12:00:00Z");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

const REPO = { default_branch: "main" };
const CHECKS_OK = {
  total_count: 1,
  check_runs: [{ status: "completed", conclusion: "success" }],
};
const COMPARE_OK = { ahead_by: 1, behind_by: 0 };
const REVIEW_OK = [{ user: { login: "bob" }, state: "APPROVED" }];
const BRANCHES = [
  { name: "main", commit: { sha: "fff" } },
  { name: "feat/x", commit: { sha: "abc123" } },
];
const BRANCH_COMMIT = { commit: { committer: { date: "2026-09-27T10:00:00Z" } } };

type Responder = Response | ((url: string) => Response);
type Route = [RegExp, Responder];

/** Mock fetch that answers by URL pattern, so interleaved section calls don't depend on order. */
function stubRoutes(routes: Route[]) {
  const mock = vi.fn(
    async (input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]): Promise<Response> => {
      const url = String(input);
      const hit = routes.find(([re]) => re.test(url));
      if (!hit) return jsonResponse({ message: `unmatched ${url}` }, 500);
      const responder = hit[1];
      const response = typeof responder === "function" ? responder(url) : responder.clone();
      return response;
    },
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function getApp(now: () => number = () => NOW.getTime()) {
  return createApp(CONFIG, { now });
}

async function getStatus(app: ReturnType<typeof createApp>): Promise<StatusResponse> {
  const response = await app.request("/api/status");
  expect(response.status).toBe(200);
  const body = await response.json();
  const parsed = statusResponseSchema.safeParse(body);
  expect(parsed.success).toBe(true);
  return body as StatusResponse;
}

const happyRoutes = (): Route[] => [
  [/repos\/octocat\/hello$/, jsonResponse(REPO)],
  [/pulls\?/, jsonResponse([PR])],
  [/check-runs/, jsonResponse(CHECKS_OK)],
  [/\/status$/, jsonResponse({ state: "success", total_count: 1 })],
  [/compare\//, jsonResponse(COMPARE_OK)],
  [/reviews\?/, jsonResponse(REVIEW_OK)],
  [/branches\?/, jsonResponse(BRANCHES)],
  [/commits\//, jsonResponse(BRANCH_COMMIT)],
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/status", () => {
  it("returns a fully valid snapshot on the happy path", async () => {
    stubRoutes(happyRoutes());
    const body = await getStatus(getApp());
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.repo).toBe("octocat/hello");
    expect(body.shipSignal).toBe("ship");
    expect(body.prs.ok).toBe(true);
    if (body.prs.ok) {
      expect(body.prs.data).toHaveLength(1);
      expect(body.prs.data[0]!.verdict).toBe("ship");
    }
    expect(body.branches.ok).toBe(true);
  });

  it("sorts PR cards fix, then wait, then ship", async () => {
    const fixPr = { ...PR, number: 3, mergeable: false, head: { ...PR.head, sha: "sha3" } };
    const waitPr = { ...PR, number: 2, draft: true, head: { ...PR.head, sha: "sha2" } };
    stubRoutes([
      [/repos\/octocat\/hello$/, jsonResponse(REPO)],
      [/pulls\?/, jsonResponse([waitPr, { ...PR, number: 4 }, fixPr])],
      [/check-runs/, jsonResponse(CHECKS_OK)],
      [/\/status$/, jsonResponse({ state: "success", total_count: 1 })],
      [/compare\//, jsonResponse({ ahead_by: 0, behind_by: 0 })],
      [/reviews\?/, jsonResponse(REVIEW_OK)],
      [/branches\?/, jsonResponse([{ name: "main", commit: { sha: "fff" } }])],
    ]);
    const body = await getStatus(getApp());
    if (!body.ok || !body.prs.ok) return expect.unreachable("expected success snapshot");
    expect(body.prs.data.map((p) => p.verdict)).toEqual(["fix", "wait", "ship"]);
  });

  it("degrades the prs section alone when its fetch fails", async () => {
    stubRoutes([
      [/repos\/octocat\/hello$/, jsonResponse(REPO)],
      [/pulls\?/, jsonResponse({ message: "nope" }, 500)],
      [/branches\?/, jsonResponse(BRANCHES)],
      [/compare\//, jsonResponse({ ahead_by: 0, behind_by: 0 })],
      [/commits\//, jsonResponse(BRANCH_COMMIT)],
    ]);
    const body = await getStatus(getApp());
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.prs.ok).toBe(false);
    expect(body.branches.ok).toBe(true);
    expect(body.shipSignal).toBe("unknown");
  });

  it("degrades the branches section alone when its fetch fails", async () => {
    stubRoutes([
      ...happyRoutes().filter(([re]) => !re.test("https://api.github.com/repos/octocat/hello/branches?")),
      [/branches\?/, jsonResponse({ message: "nope" }, 500)],
    ]);
    const body = await getStatus(getApp());
    if (!body.ok) return expect.unreachable();
    expect(body.prs.ok).toBe(true);
    expect(body.branches.ok).toBe(false);
    expect(body.shipSignal).toBe("unknown");
  });

  it("returns the top-level error state when auth is rejected, without leaking the token", async () => {
    stubRoutes([
      [/repos\/octocat\/hello$/, jsonResponse({ message: "Bad credentials" }, 401)],
    ]);
    const body = await getStatus(getApp());
    expect(body.ok).toBe(false);
    if (body.ok) return expect.unreachable();
    expect(body.error).toMatch(/token/i);
    expect(JSON.stringify(body)).not.toContain(CONFIG.token);
  });

  it("serves two rapid requests from one fetch round (60s cache)", async () => {
    const mock = stubRoutes(happyRoutes());
    const app = getApp();
    await getStatus(app);
    await getStatus(app);
    // one round: repo + pulls + (checks, status, compare, reviews) + branches + compare + commit
    expect(mock).toHaveBeenCalledTimes(9);
  });

  it("retries a failed round after the 10s error cache", async () => {
    const clock = { t: NOW.getTime() };
    let repoCalls = 0;
    stubRoutes([
      [
        /repos\/octocat\/hello$/,
        () => (++repoCalls === 1 ? jsonResponse({ message: "boom" }, 500) : jsonResponse(REPO)),
      ],
      ...happyRoutes().slice(1),
    ]);
    const app = getApp(() => clock.t);
    const first = await getStatus(app);
    expect(first.ok).toBe(false);
    clock.t += 10_000;
    const second = await getStatus(app);
    if (!second.ok || !second.prs.ok) return expect.unreachable("expected recovery");
    expect(second.prs.data).toHaveLength(1);
  });
});
