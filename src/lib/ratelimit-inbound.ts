import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/redis";

/**
 * Rate limits for this app's own API routes, so one noisy client can't drain
 * the shared TMDB quota.
 *
 * With Upstash Redis configured, limits are counted in Redis and shared by
 * every serverless instance. Without it (local development, CI), or if Redis
 * fails or takes longer than a second, each instance falls back to its own
 * in-memory sliding window. A Redis outage degrades accuracy, never availability.
 */

export interface LimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
  backend: "redis" | "memory";
}

export interface Limiter {
  check(key: string): Promise<LimitResult>;
}

/** The subset of @upstash/ratelimit's response this module uses. */
export type RemoteLimit = (key: string) => Promise<{ success: boolean; remaining: number; reset: number; reason?: string }>;

/** In-memory sliding window: the fallback, and the whole limiter without Redis. */
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

let warned = false;

export function createLimiter({
  limit,
  windowSec,
  remote,
  now = Date.now,
}: {
  limit: number;
  windowSec: number;
  remote: RemoteLimit | null;
  now?: () => number;
}): Limiter {
  const local = new SlidingWindowLimiter(limit, windowSec * 1000, now);
  return {
    async check(key) {
      if (remote) {
        try {
          const r = await remote(key);
          // "timeout" means Redis didn't answer in time and the library let the
          // request through; count it locally instead so a limit still applies.
          if (r.reason !== "timeout") {
            return {
              ok: r.success,
              remaining: r.remaining,
              retryAfterSec: r.success ? 0 : Math.max(1, Math.ceil((r.reset - now()) / 1000)),
              backend: "redis",
            };
          }
        } catch (e) {
          if (!warned) {
            warned = true;
            console.warn("Redis rate limit unavailable; using per-instance limits.", (e as Error).message);
          }
        }
      }
      return { ...local.check(key), backend: "memory" };
    },
  };
}

function redisSlidingWindow(name: string, limit: number, windowSec: number): RemoteLimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    prefix: `sr:rl:${name}`,
    timeout: 1000,
    // Remembers blocked keys in memory so repeat offenders don't cost a Redis call.
    ephemeralCache: new Map(),
  });
  return (key) => rl.limit(key);
}

const g = globalThis as unknown as { __limiters?: Record<string, Limiter> };
const make = (name: string, limit: number, windowSec: number) =>
  ((g.__limiters ??= {})[name] ??= createLimiter({ limit, windowSec, remote: redisSlidingWindow(name, limit, windowSec) }));

/** Named limiters: requests per minute per signed-in user, or per IP. */
export const limiters = {
  search: make("search", 30, 60),
  browse: make("browse", 120, 60),
  write: make("write", 60, 60),
};

export const rateLimitBackend = () => (getRedis() ? "redis" : "memory");
