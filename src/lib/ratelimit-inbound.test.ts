import { describe, expect, it, vi } from "vitest";
import { createLimiter, SlidingWindowLimiter, type RemoteLimit } from "./ratelimit-inbound";
import { createGlobalGate } from "./tmdb/globalGate";

/** A fake shared store: two limiters built on it behave like two server instances. */
function fakeRedisWindow(limit: number, windowMs: number, now: () => number): RemoteLimit {
  const hits = new Map<string, number[]>();
  return async (key) => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((s) => s > t - windowMs);
    const success = recent.length < limit;
    if (success) recent.push(t);
    hits.set(key, recent);
    return { success, remaining: Math.max(0, limit - recent.length), reset: (recent[0] ?? t) + windowMs };
  };
}

describe("SlidingWindowLimiter (memory)", () => {
  it("allows the limit within a window, then blocks with a retry time", () => {
    let t = 0;
    const l = new SlidingWindowLimiter(3, 60_000, () => t);
    expect([l.check("a").ok, l.check("a").ok, l.check("a").ok]).toEqual([true, true, true]);
    const blocked = l.check("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    expect(l.check("b").ok).toBe(true); // keys are independent
    t = 60_001;
    expect(l.check("a").ok).toBe(true);
  });
});

describe("createLimiter", () => {
  it("shares one count across instances when Redis is configured", async () => {
    const now = () => 1_000;
    const shared = fakeRedisWindow(5, 60_000, now);
    const instanceA = createLimiter({ limit: 5, windowSec: 60, remote: shared, now });
    const instanceB = createLimiter({ limit: 5, windowSec: 60, remote: shared, now });

    const results = [];
    for (let i = 0; i < 3; i++) results.push((await instanceA.check("ip:1")).ok);
    for (let i = 0; i < 3; i++) results.push((await instanceB.check("ip:1")).ok);
    // 3 + 3 = 6 requests against a shared limit of 5: the sixth is refused,
    // even though neither instance alone has reached 5.
    expect(results).toEqual([true, true, true, true, true, false]);
    const r = await instanceB.check("ip:1");
    expect(r.backend).toBe("redis");
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("without Redis, each instance counts separately", async () => {
    const a = createLimiter({ limit: 2, windowSec: 60, remote: null });
    const b = createLimiter({ limit: 2, windowSec: 60, remote: null });
    const r = [await a.check("k"), await a.check("k"), await b.check("k"), await a.check("k")];
    expect(r.map((x) => x.ok)).toEqual([true, true, true, false]);
    expect(r[0].backend).toBe("memory");
  });

  it("falls back to the per-instance limit when Redis errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken: RemoteLimit = async () => {
      throw new Error("ECONNRESET");
    };
    const l = createLimiter({ limit: 1, windowSec: 60, remote: broken });
    const first = await l.check("k");
    const second = await l.check("k");
    expect([first.ok, second.ok]).toEqual([true, false]); // still limited, never an exception
    expect(first.backend).toBe("memory");
  });

  it("counts locally when Redis times out instead of letting everything through", async () => {
    const slow: RemoteLimit = async () => ({ success: true, remaining: 0, reset: 0, reason: "timeout" });
    const l = createLimiter({ limit: 1, windowSec: 60, remote: slow });
    expect((await l.check("k")).ok).toBe(true);
    expect((await l.check("k")).ok).toBe(false);
  });
});

describe("global TMDB gate", () => {
  it("passes straight through without Redis", async () => {
    const gate = createGlobalGate(null);
    await gate.acquire();
    expect(gate.stats).toEqual({ waits: 0, failOpen: 0 });
  });

  it("waits for the shared bucket to refill, then proceeds", async () => {
    let t = 0;
    const sleeps: number[] = [];
    let calls = 0;
    const remote: RemoteLimit = async () => ({ success: ++calls > 2, remaining: 0, reset: t + 200 });
    const gate = createGlobalGate(remote, {
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });
    await gate.acquire();
    expect(sleeps).toEqual([200, 200]);
    expect(gate.stats.waits).toBe(2);
  });

  it("gives up waiting after maxWaitMs and lets the local limiter handle it", async () => {
    let t = 0;
    const remote: RemoteLimit = async () => ({ success: false, remaining: 0, reset: t + 1000 });
    const gate = createGlobalGate(remote, { maxWaitMs: 2500, now: () => t, sleep: async (ms) => void (t += ms) });
    await gate.acquire();
    expect(gate.stats.waits).toBe(2);
    expect(gate.stats.failOpen).toBe(1);
  });

  it("fails open when Redis errors", async () => {
    const gate = createGlobalGate(async () => {
      throw new Error("down");
    });
    await gate.acquire();
    expect(gate.stats.failOpen).toBe(1);
  });
});
