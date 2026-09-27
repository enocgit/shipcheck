import { describe, expect, it, vi } from "vitest";
import { createTtlCache, type CacheOutcome } from "./cache.js";

function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const ok = (v: string): CacheOutcome<string> => ({ ok: true, value: v });
const fail = (e: string): CacheOutcome<string> => ({ ok: false, error: e });

describe("createTtlCache", () => {
  it("returns a fresh value on first get", async () => {
    const clock = fakeClock();
    const fetch = vi.fn(async () => ok("v1"));
    const cache = createTtlCache<string>({ now: clock.now });
    expect(await cache.get(fetch)).toEqual(ok("v1"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("serves a success from cache within 60s and refetches after", async () => {
    const clock = fakeClock();
    const fetch = vi.fn(async () => ok("v1"));
    const cache = createTtlCache<string>({ now: clock.now });
    await cache.get(fetch);
    clock.advance(59_999);
    await cache.get(fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock.advance(1);
    await cache.get(fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches a failure for only 10s", async () => {
    const clock = fakeClock();
    let n = 0;
    const fetch = vi.fn(async (): Promise<CacheOutcome<string>> => (++n === 1 ? fail("boom") : ok("v2")));
    const cache = createTtlCache<string>({ now: clock.now });
    expect(await cache.get(fetch)).toEqual(fail("boom"));
    clock.advance(9_999);
    expect(await cache.get(fetch)).toEqual(fail("boom"));
    expect(fetch).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(await cache.get(fetch)).toEqual(ok("v2"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("a success after a failed round is cached for the full success TTL", async () => {
    const clock = fakeClock();
    let n = 0;
    const fetch = vi.fn(async (): Promise<CacheOutcome<string>> => (++n === 1 ? fail("boom") : ok("v2")));
    const cache = createTtlCache<string>({ now: clock.now });
    await cache.get(fetch); // failure
    clock.advance(10_000);
    await cache.get(fetch); // recovery success
    clock.advance(10_000);
    await cache.get(fetch); // still within 60s success TTL
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("a degraded snapshot retries after the failure TTL, not the success TTL", async () => {
    const clock = fakeClock();
    let n = 0;
    const fetch = vi.fn(async (): Promise<CacheOutcome<string>> =>
      ++n === 1 ? { ok: true, value: "partial", degraded: true } : ok("full"),
    );
    const cache = createTtlCache<string>({ now: clock.now });
    await cache.get(fetch);
    clock.advance(9_999);
    expect(await cache.get(fetch)).toEqual({ ok: true, value: "partial", degraded: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(await cache.get(fetch)).toEqual(ok("full"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("concurrent misses share one fetch round", async () => {
    const clock = fakeClock();
    const fetch = vi.fn(async () => ok("v1"));
    const cache = createTtlCache<string>({ now: clock.now });
    const [a, b] = await Promise.all([cache.get(fetch), cache.get(fetch)]);
    expect(a).toEqual(ok("v1"));
    expect(b).toEqual(ok("v1"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
