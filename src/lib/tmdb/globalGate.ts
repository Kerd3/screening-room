import type { RemoteLimit } from "@/lib/ratelimit-inbound";

/**
 * A rate limit for TMDB shared by every server instance. Each instance's local
 * token bucket only knows about its own requests; with several serverless
 * instances running, together they could exceed TMDB's limit. This gate takes
 * a token from a Redis token bucket first, and waits for the next refill when
 * the bucket is empty.
 *
 * It fails open: without Redis, on Redis errors, or after waiting maxWaitMs, the
 * request continues to the local bucket and the client's 429 retry handling.
 */
export interface GlobalGate {
  acquire(): Promise<void>;
  readonly stats: { waits: number; failOpen: number };
}

export function createGlobalGate(
  remote: RemoteLimit | null,
  {
    maxWaitMs = 5000,
    now = Date.now,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  }: { maxWaitMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): GlobalGate {
  const stats = { waits: 0, failOpen: 0 };
  return {
    stats,
    async acquire() {
      if (!remote) return;
      const started = now();
      for (;;) {
        let r;
        try {
          r = await remote("tmdb");
        } catch {
          stats.failOpen++;
          return;
        }
        if (r.success || r.reason === "timeout") return;
        const wait = Math.max(10, r.reset - now());
        if (now() - started + wait > maxWaitMs) {
          stats.failOpen++;
          return;
        }
        stats.waits++;
        await sleep(wait);
      }
    },
  };
}
