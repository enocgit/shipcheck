/**
 * Single-slot TTL cache for the aggregated snapshot (PRD-0001 FR8, ADR-0005).
 * Read-time expiry, no timers or background jobs. Successes live 60s, failures
 * and degraded snapshots only 10s so recovery is quick without hammering the
 * API. Concurrent misses share one in-flight fetch instead of stampeding.
 */

export type CacheOutcome<T> =
  | { ok: true; value: T; /** Degraded snapshots retry after the failure TTL. */ degraded?: boolean }
  | { ok: false; error: string };

const SUCCESS_TTL_MS = 60_000;
const FAILURE_TTL_MS = 10_000;

export interface TtlCacheOptions {
  /** Injectable clock (ms epoch); defaults to Date.now. */
  now?: () => number;
  successTtlMs?: number;
  failureTtlMs?: number;
}

interface Entry<T> {
  outcome: CacheOutcome<T>;
  storedAt: number;
}

function isShortTtl<T>(outcome: CacheOutcome<T>): boolean {
  return !outcome.ok || outcome.degraded === true;
}

export function createTtlCache<T>(options: TtlCacheOptions = {}) {
  const now = options.now ?? Date.now;
  const successTtlMs = options.successTtlMs ?? SUCCESS_TTL_MS;
  const failureTtlMs = options.failureTtlMs ?? FAILURE_TTL_MS;
  let entry: Entry<T> | undefined;
  let inFlight: Promise<CacheOutcome<T>> | undefined;

  return {
    /** Returns the cached outcome while fresh; otherwise fetches (coalesced) and caches the result. */
    get(fetch: () => Promise<CacheOutcome<T>>): Promise<CacheOutcome<T>> {
      if (entry) {
        const ttl = isShortTtl(entry.outcome) ? failureTtlMs : successTtlMs;
        if (now() - entry.storedAt < ttl) return Promise.resolve(entry.outcome);
      }
      // Concurrent misses share the same round instead of duplicating GitHub calls.
      inFlight ??= fetch()
        .then((outcome) => {
          entry = { outcome, storedAt: now() };
          return outcome;
        })
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
  };
}
