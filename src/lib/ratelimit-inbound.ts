/**
 * Sliding-window rate limit for this app's own API routes. One noisy client
 * can't drain the shared TMDB quota. Kept in memory, per server process.
 */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): { ok: boolean; remaining: number; retryAfterSec: number } {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((s) => s > t - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const retryAfterSec = Math.ceil((recent[0] + this.windowMs - t) / 1000);
      return { ok: false, remaining: 0, retryAfterSec };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(t);
    return { ok: true, remaining: this.limit - recent.length, retryAfterSec: 0 };
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits) if (!v.some((s) => s > t - this.windowMs)) this.hits.delete(k);
  }
}

const g = globalThis as unknown as { __limiters?: Record<string, SlidingWindowLimiter> };
g.__limiters ??= {};

/** Named limiters: requests per minute per client. */
export const limiters = {
  search: (g.__limiters.search ??= new SlidingWindowLimiter(30, 60_000)),
  browse: (g.__limiters.browse ??= new SlidingWindowLimiter(120, 60_000)),
  write: (g.__limiters.write ??= new SlidingWindowLimiter(60, 60_000)),
};
