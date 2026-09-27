import type { Config } from "./config.js";
import { createGithubClient, GithubError } from "./github.js";
import { createTtlCache, type CacheOutcome } from "./cache.js";
import { assessPr } from "./verdicts.js";
import { assessBranches, deriveSignal } from "./hygiene.js";
import {
  statusResponseSchema,
  type BranchEntry,
  type PrEntry,
  type StatusResponse,
} from "./contracts/status.js";

/**
 * Aggregates one `/api/status` snapshot (PRD-0001 FR1, FR6–FR8). On cache miss
 * it fetches the shared repo info, PRs (with checks + base comparison), and
 * branches in parallel, computes verdicts and the ship signal, validates the
 * result against the frozen contract, and caches it: 60s when at least one
 * section succeeded, 10s when the whole round failed.
 */

export interface StatusServiceOptions {
  /** Injectable clock (ms epoch); defaults to the system time. */
  now?: () => number;
}

const VERDICT_ORDER = { fix: 0, wait: 1, ship: 2 } as const;

function sectionError(error: unknown): string {
  if (error instanceof GithubError) return error.message;
  return "Unexpected error fetching from GitHub";
}

export function createStatusService(config: Config, options: StatusServiceOptions = {}) {
  const nowMs = options.now ?? Date.now;
  const github = createGithubClient(config);
  const cache = createTtlCache<StatusResponse>({ now: nowMs });

  async function buildPrs(at: Date): Promise<PrEntry[]> {
    const records = await github.listOpenPrs();
    const entries: PrEntry[] = [];
    for (const record of records) {
      const [checks, behindBase, reviewState] = await Promise.all([
        github.getChecks(record.headSha),
        github.compareBehind(record.baseRefName, record.headSha),
        github.getReviewState(record.number),
      ]);
      const { verdict, reasons } = assessPr(
        {
          isDraft: record.isDraft,
          mergeable: record.mergeable,
          checks,
          approved: reviewState.approved,
          changesRequested: reviewState.changesRequested,
          behindBase,
          updatedAt: record.updatedAt,
        },
        at,
      );
      entries.push({
        number: record.number,
        title: record.title,
        author: record.author,
        url: record.url,
        headRefName: record.headRefName,
        baseRefName: record.baseRefName,
        isDraft: record.isDraft,
        verdict,
        reasons,
        updatedAt: record.updatedAt.toISOString(),
      });
    }
    return entries.sort(
      (a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || a.number - b.number,
    );
  }

  async function buildBranches(defaultBranch: string, at: Date): Promise<BranchEntry[]> {
    return assessBranches(await github.listBranches(defaultBranch), at);
  }

  async function fetchSnapshot(): Promise<CacheOutcome<StatusResponse>> {
    const at = new Date(nowMs());

    // Shared first read: the default branch feeds both sections.
    let defaultBranch: string;
    try {
      defaultBranch = await github.getDefaultBranch();
    } catch (error) {
      // No shared data -> no honest snapshot at all: whole-request failure (10s cache).
      return { ok: false, error: sectionError(error) };
    }

    const [prsResult, branchesResult] = await Promise.allSettled([
      buildPrs(at),
      buildBranches(defaultBranch, at),
    ]);

    const prs =
      prsResult.status === "fulfilled"
        ? { ok: true as const, data: prsResult.value }
        : { ok: false as const, error: sectionError(prsResult.reason) };
    const branches =
      branchesResult.status === "fulfilled"
        ? { ok: true as const, data: branchesResult.value }
        : { ok: false as const, error: sectionError(branchesResult.reason) };

    if (!prs.ok && !branches.ok) {
      return { ok: false, error: prs.error };
    }

    const degraded = !prs.ok || !branches.ok;

    const snapshot: StatusResponse = {
      ok: true,
      repo: `${config.owner}/${config.name}`,
      generatedAt: at.toISOString(),
      shipSignal: deriveSignal({
        verdicts: prs.ok ? prs.data.map((p) => p.verdict) : [],
        staleBranches: branches.ok ? branches.data.filter((b) => b.stale).length : 0,
        anySectionFailed: degraded,
      }),
      prs,
      branches,
    };

    const parsed = statusResponseSchema.safeParse(snapshot);
    if (!parsed.success) {
      // A snapshot that fails its own contract is an internal bug, not data to render.
      return { ok: false, error: "Internal error: snapshot failed contract validation" };
    }
    // A degraded snapshot retries after the failure TTL (FR8), not the 60s success TTL.
    return degraded ? { ok: true, value: parsed.data, degraded: true } : { ok: true, value: parsed.data };
  }

  return {
    /** Contract-valid response for GET /api/status; never throws. */
    async getStatus(): Promise<StatusResponse> {
      const outcome = await cache.get(fetchSnapshot);
      if (!outcome.ok) return { ok: false, error: outcome.error };
      return outcome.value;
    },
  };
}
