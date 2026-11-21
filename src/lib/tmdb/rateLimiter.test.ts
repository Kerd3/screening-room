import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetryableError, TokenBucket, withRetry } from "./rateLimiter";

describe("TokenBucket", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lets a burst up to capacity through, then queues the rest", async () => {
    const bucket = new TokenBucket(10, 10, () => Date.now());
    let done = 0;
    const all = Array.from({ length: 25 }, () => bucket.acquire().then(() => done++));

    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(10);
    expect(bucket.pending).toBe(15);

    await vi.advanceTimersByTimeAsync(1000); // 10 more tokens refill
    expect(done).toBe(20);

    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(25);
    await Promise.all(all);
  });

  it("never exceeds the configured rate over a sustained window", async () => {
    const bucket = new TokenBucket(5, 5, () => Date.now());
    const stamps: number[] = [];
    const all = Array.from({ length: 30 }, () => bucket.acquire().then(() => stamps.push(Date.now())));
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(all);

    // Within any 1s window after the initial burst there are at most 5 grants (+1 boundary).
    const start = stamps[0];
    for (let t = start; t < start + 5000; t += 250) {
      const inWindow = stamps.filter((s) => s >= t && s < t + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(6 + 5); // first window includes the full burst
    }
    const lastSecond = stamps.filter((s) => s > stamps[29] - 1000).length;
    expect(lastSecond).toBeLessThanOrEqual(6);
  });

  it("pauseFor blocks every caller until the pause ends", async () => {
    const bucket = new TokenBucket(100, 100, () => Date.now());
    bucket.pauseFor(2000);
    let granted = false;
    void bucket.acquire().then(() => (granted = true));

    await vi.advanceTimersByTimeAsync(1999);
    expect(granted).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(granted).toBe(true);
  });
});

describe("withRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("backs off exponentially on retryable errors and then succeeds", async () => {
    const delays: number[] = [];
    let calls = 0;
    const p = withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new RetryableError("503");
        return "ok";
      },
      { baseMs: 100, random: () => 0, onRetry: (_a, d) => delays.push(d) },
    );
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe("ok");
    expect(delays).toEqual([100, 200]);
  });

  it("honors Retry-After when it is longer than the backoff", async () => {
    const delays: number[] = [];
    let calls = 0;
    const p = withRetry(
      async () => {
        if (calls++ === 0) throw new RetryableError("429", 3000);
        return "ok";
      },
      { baseMs: 100, random: () => 0, onRetry: (_a, d) => delays.push(d) },
    );
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toBe("ok");
    expect(delays).toEqual([3000]);
  });

  it("gives up after the retry budget and rethrows", async () => {
    const p = withRetry(
      async () => {
        throw new RetryableError("down");
      },
      { retries: 2, baseMs: 10, random: () => 0 },
    );
    const assertion = expect(p).rejects.toThrow("down");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error("404");
      }),
    ).rejects.toThrow("404");
    expect(calls).toBe(1);
  });
});
