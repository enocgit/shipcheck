import type { Config } from "./config.js";
import type { PrState } from "./verdicts.js";
import type { BranchInput } from "./hygiene.js";

/**
 * The only module that talks to the GitHub REST API (ADR-0004, ADR-0005).
 * Read-only paths only. Every response is validated before it leaves this
 * module; failures are typed and carry server-authored messages only — the
 * token and token-bearing URLs never appear in errors, logs, or results (NFR1).
 * Collections are paginated to completion: a silently truncated list would
 * produce verdicts and signals from partial data.
 */

export type GithubErrorKind = "auth" | "forbidden" | "rate-limit" | "network" | "malformed";

export class GithubError extends Error {
  kind: GithubErrorKind;

  constructor(kind: GithubErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface PrRecord {
  number: number;
  title: string;
  author: string;
  url: string;
  headRefName: string;
  headSha: string;
  baseRefName: string;
  isDraft: boolean;
  mergeable: boolean | null;
  updatedAt: Date;
}

export type CheckState = PrState["checks"];

const API_ROOT = "https://api.github.com";
const PER_PAGE = 100;

interface PrApiShape {
  number: number;
  title: string;
  draft: boolean;
  html_url: string;
  user?: { login?: string } | null;
  head: { ref?: string; sha?: string };
  base: { ref?: string };
  updated_at: string;
  /** null while GitHub computes mergeability after activity. */
  mergeable: boolean | null;
}

interface CombinedStatusApiShape {
  state: string;
  total_count: number;
}

interface ReviewApiShape {
  user: { login?: string } | null;
  state: string;
}

interface BranchApiShape {
  name: string;
  commit: { sha: string };
}

interface ComparisonApiShape {
  ahead_by: number;
  behind_by: number;
}

interface CommitApiShape {
  commit: { committer: { date: string } };
}

interface RepoApiShape {
  default_branch: string;
}

function assert(condition: unknown, kind: GithubErrorKind, message: string): asserts condition {
  if (!condition) throw new GithubError(kind, message);
}

export function createGithubClient(config: Config) {
  async function get<T>(path: string, shape: (body: unknown) => T): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${API_ROOT}${path}`, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    } catch {
      throw new GithubError("network", `GitHub request failed for ${path}`);
    }
    if (response.status === 401) {
      throw new GithubError("auth", "GitHub rejected the token; check GITHUB_TOKEN");
    }
    if (response.status === 403) {
      // Primary limits (remaining=0), secondary limits (retry-after), and
      // permission denial all arrive as 403; distinguish them.
      const remaining = response.headers.get("x-ratelimit-remaining");
      const retryAfter = response.headers.get("retry-after");
      const limited = remaining === "0" || retryAfter !== null;
      throw new GithubError(
        limited ? "rate-limit" : "forbidden",
        limited
          ? "GitHub API rate limit exceeded"
          : "GitHub denied the request; check the token's permissions",
      );
    }
    if (!response.ok) {
      throw new GithubError("network", `GitHub request failed with status ${response.status}`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GithubError("malformed", "GitHub returned a non-JSON response");
    }
    return shape(body);
  }

  /** Fetches a paginated collection to completion (per_page pages until a short page). */
  async function paged<T>(
    path: string,
    parseItem: (raw: unknown) => T,
    select: (body: unknown) => unknown[] = (b) => {
      assert(Array.isArray(b), "malformed", `GitHub collection at ${path} is not an array`);
      return b as unknown[];
    },
  ): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; ; page++) {
      const separator = path.includes("?") ? "&" : "?";
      const body = await get(`${path}${separator}page=${page}&per_page=${PER_PAGE}`, (b) => select(b).map(parseItem));
      items.push(...body);
      if (body.length < PER_PAGE) return items;
    }
  }

  function parsePr(raw: unknown): PrRecord {
    assert(
      raw !== null && typeof raw === "object",
      "malformed",
      "GitHub PR entry is not an object",
    );
    const pr = raw as PrApiShape;
    assert(
      typeof pr.number === "number" && typeof pr.title === "string" && typeof pr.updated_at === "string",
      "malformed",
      "GitHub PR entry is missing required fields",
    );
    assert(
      typeof pr.html_url === "string" && typeof pr.head?.sha === "string",
      "malformed",
      "GitHub PR entry is missing head fields",
    );
    assert(
      typeof pr.head?.ref === "string",
      "malformed",
      "GitHub PR entry is missing head ref",
    );
    assert(
      typeof pr.draft === "boolean",
      "malformed",
      "GitHub PR entry is missing the draft flag",
    );
    assert(
      typeof pr.mergeable === "boolean" || pr.mergeable === null,
      "malformed",
      "GitHub PR entry has an invalid mergeability value",
    );
    const updatedAt = new Date(pr.updated_at);
    assert(!Number.isNaN(updatedAt.getTime()), "malformed", "GitHub PR has an invalid date");
    // PR URLs reach the page as hrefs: constrain the scheme/host here too, not
    // just at the snapshot contract (defense in depth; NFR2).
    assert(
      pr.html_url.startsWith("https://github.com/"),
      "malformed",
      "GitHub PR entry has a non-GitHub URL",
    );
    return {
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? "unknown",
      url: pr.html_url,
      headRefName: pr.head.ref,
      headSha: pr.head.sha,
      baseRefName: pr.base?.ref ?? "",
      isDraft: pr.draft,
      mergeable: pr.mergeable,
      updatedAt,
    };
  }

  function parseBranch(raw: unknown): { name: string; sha: string } {
    assert(
      raw !== null && typeof raw === "object" && typeof (raw as BranchApiShape).name === "string",
      "malformed",
      "GitHub branch entry is missing required fields",
    );
    const branch = raw as BranchApiShape;
    assert(
      typeof branch.commit?.sha === "string",
      "malformed",
      "GitHub branch entry is missing a commit SHA",
    );
    return { name: branch.name, sha: branch.commit.sha };
  }

  function parseComparison(raw: unknown): { ahead: number; behind: number } {
    assert(raw !== null && typeof raw === "object", "malformed", "GitHub comparison is not an object");
    const c = raw as ComparisonApiShape;
    assert(
      typeof c.ahead_by === "number" && typeof c.behind_by === "number",
      "malformed",
      "GitHub comparison is missing counts",
    );
    return { ahead: c.ahead_by, behind: c.behind_by };
  }

  return {
    async listOpenPrs(): Promise<PrRecord[]> {
      return paged(`/repos/${config.owner}/${config.name}/pulls?state=open`, parsePr);
    },

    /**
     * Aggregates check runs and commit statuses for the head SHA. Failures are
     * evaluated before pending runs: one failed and one in-progress run is a
     * failing build, not a waiting one (PRD FR3 outranks FR4's pending case).
     * neutral/skipped conclusions are not failures.
     */
    async getChecks(headSha: string): Promise<CheckState> {
      const runs = await paged(
        `/repos/${config.owner}/${config.name}/commits/${headSha}/check-runs`,
        (raw) => {
          assert(
            raw !== null && typeof raw === "object" && typeof (raw as { status?: unknown }).status === "string",
            "malformed",
            "GitHub check run is missing status",
          );
          const run = raw as { status: string; conclusion: string | null };
          assert(
            run.conclusion === null || typeof run.conclusion === "string",
            "malformed",
            "GitHub check run has an invalid conclusion",
          );
          return run;
        },
        (b) => {
          assert(b !== null && typeof b === "object", "malformed", "GitHub check-runs response is not an object");
          const body = b as { check_runs: unknown[] };
          assert(Array.isArray(body.check_runs), "malformed", "GitHub check_runs is not an array");
          return body.check_runs;
        },
      );
      const status = await get(
        `/repos/${config.owner}/${config.name}/commits/${headSha}/status`,
        (b) => {
          assert(b !== null && typeof b === "object", "malformed", "GitHub status response is not an object");
          const body = b as CombinedStatusApiShape;
          assert(
            typeof body.state === "string" && typeof body.total_count === "number",
            "malformed",
            "GitHub status response is missing state or count",
          );
          return body;
        },
      );

      const FAILED_CONCLUSIONS = new Set([
        "failure",
        "timed_out",
        "cancelled",
        "action_required",
        "startup_failure",
      ]);
      const failed =
        runs.some((r) => r.status === "completed" && r.conclusion !== null && FAILED_CONCLUSIONS.has(r.conclusion)) ||
        status.total_count > 0 && (status.state === "error" || status.state === "failure");
      if (failed) return "failing";
      const pending =
        runs.some((r) => r.status !== "completed") ||
        (status.total_count > 0 && status.state === "pending");
      if (pending) return "pending";
      if (runs.length === 0 && (status.total_count === 0 || status.state === "none")) return "none";
      return "passing";
    },

    /**
     * Latest review per user wins; COMMENTED reviews never change approval
     * state, and DISMISSED clears that user's prior state.
     */
    async getReviewState(prNumber: number): Promise<{ approved: boolean; changesRequested: boolean }> {
      const reviews = await paged(
        `/repos/${config.owner}/${config.name}/pulls/${prNumber}/reviews`,
        (raw) => {
          assert(
            raw !== null && typeof raw === "object" && typeof (raw as ReviewApiShape).state === "string",
            "malformed",
            "GitHub review entry is missing state",
          );
          const review = raw as ReviewApiShape;
          const login = review.user?.login;
          assert(typeof login === "string", "malformed", "GitHub review entry is missing user");
          return { login, state: review.state };
        },
      );
      const latest = new Map<string, string>();
      for (const { login, state } of reviews) {
        if (state === "COMMENTED") continue;
        if (state === "DISMISSED") latest.delete(login);
        else latest.set(login, state);
      }
      const states = [...latest.values()];
      return {
        approved: states.includes("APPROVED"),
        changesRequested: states.includes("CHANGES_REQUESTED"),
      };
    },

    async getDefaultBranch(): Promise<string> {
      const repo = await get(`/repos/${config.owner}/${config.name}`, (b) => {
        assert(b !== null && typeof b === "object", "malformed", "GitHub repo response is not an object");
        const body = b as RepoApiShape;
        assert(
          typeof body.default_branch === "string",
          "malformed",
          "GitHub repo response is missing default_branch",
        );
        return body.default_branch;
      });
      return repo;
    },

    /** True when head is behind base by any commits (PRD FR4). */
    async compareBehind(baseRef: string, headSha: string): Promise<boolean> {
      const comparison = await get(
        `/repos/${config.owner}/${config.name}/compare/${baseRef}...${headSha}`,
        parseComparison,
      );
      return comparison.behind > 0;
    },

    /** Branches other than the default branch, with ahead/behind and last-commit age. */
    async listBranches(defaultBranch: string): Promise<BranchInput[]> {
      const branches = await paged(
        `/repos/${config.owner}/${config.name}/branches`,
        parseBranch,
      );
      const result: BranchInput[] = [];
      for (const { name, sha } of branches) {
        if (name === defaultBranch) continue;
        const comparison = await get(
          `/repos/${config.owner}/${config.name}/compare/${defaultBranch}...${sha}`,
          parseComparison,
        );
        const commit = await get(`/repos/${config.owner}/${config.name}/commits/${sha}`, (b) => {
          assert(b !== null && typeof b === "object", "malformed", "GitHub commit is not an object");
          const c = b as CommitApiShape;
          const date = c.commit?.committer?.date;
          assert(typeof date === "string", "malformed", "GitHub commit is missing a date");
          const parsed = new Date(date);
          assert(!Number.isNaN(parsed.getTime()), "malformed", "GitHub commit date is invalid");
          return parsed;
        });
        result.push({ name, ahead: comparison.ahead, behind: comparison.behind, lastCommitAt: commit });
      }
      return result;
    },
  };
}
