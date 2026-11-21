import { describe, expect, it, vi } from "vitest";
import { cacheKey, TieredCache, type PersistentStore, type StoredEntry } from "./cache";

function memoryStore(): PersistentStore & { rows: Map<string, StoredEntry> } {
  const rows = new Map<string, StoredEntry>();
  return {
    rows,
    async get(k) {
      return rows.get(k) ?? null;
    },
    async set(k, body, expiresAt) {
      rows.set(k, { body, expiresAt });
    },
  };
}

describe("TieredCache", () => {
  it("returns cached values within the TTL without calling upstream again", async () => {
    let now = 0;
    const cache = new TieredCache(memoryStore(), { now: () => now });
    const fetcher = vi.fn(async () => ({ n: 1 }));

    await cache.getOrFetch("k", 1000, fetcher);
    now = 500;
    await cache.getOrFetch("k", 1000, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.stats.misses).toBe(1);
    expect(cache.stats.memoryHits).toBe(1);
  });

  it("coalesces concurrent misses into one upstream call", async () => {
    const cache = new TieredCache(null);
    let resolve!: (v: string) => void;
    const fetcher = vi.fn(() => new Promise<string>((r) => (resolve = r)));

    const calls = Array.from({ length: 10 }, () => cache.getOrFetch("k", 1000, fetcher));
    await Promise.resolve();
    resolve("value");

    expect(await Promise.all(calls)).toEqual(Array(10).fill("value"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.stats.coalesced).toBe(9);
  });

  it("serves stale data immediately and refreshes it in the background", async () => {
    let now = 0;
    const cache = new TieredCache(null, { now: () => now });
    let version = 1;
    const fetcher = vi.fn(async () => version);

    await cache.getOrFetch("k", 1000, fetcher);
    now = 2000;
    version = 2;

    expect(await cache.getOrFetch("k", 1000, fetcher)).toBe(1); // stale, not blocked
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(await cache.getOrFetch("k", 1000, fetcher)).toBe(2); // refreshed
    expect(cache.stats.staleServed).toBe(1);
  });

  it("falls back to the persistent tier after a restart (fresh memory)", async () => {
    const store = memoryStore();
    const first = new TieredCache(store);
    await first.getOrFetch("k", 60_000, async () => "from upstream");

    const afterRestart = new TieredCache(store);
    const fetcher = vi.fn(async () => "should not be called");
    expect(await afterRestart.getOrFetch("k", 60_000, fetcher)).toBe("from upstream");
    expect(fetcher).not.toHaveBeenCalled();
    expect(afterRestart.stats.persistentHits).toBe(1);
  });

  it("serves an old copy when upstream fails, instead of erroring", async () => {
    const now = 0;
    const store = memoryStore();
    await store.set("k", JSON.stringify("old"), -1); // long expired
    const cache = new TieredCache(store, { now: () => now });

    // Expired entry: served stale while the background refresh fails quietly.
    const result = await cache.getOrFetch("k", 1000, async () => {
      throw new Error("TMDB down");
    });
    expect(result).toBe("old");
  });

  it("rethrows when upstream fails and nothing is cached", async () => {
    const cache = new TieredCache(memoryStore());
    await expect(
      cache.getOrFetch("missing", 1000, async () => {
        throw new Error("TMDB down");
      }),
    ).rejects.toThrow("TMDB down");
    expect(cache.stats.upstreamErrors).toBe(1);
  });

  it("keeps working when the persistent store is broken", async () => {
    const broken: PersistentStore = {
      get: async () => {
        throw new Error("disk");
      },
      set: async () => {
        throw new Error("disk");
      },
    };
    const cache = new TieredCache(broken);
    expect(await cache.getOrFetch("k", 1000, async () => 42)).toBe(42);
  });
});

describe("cacheKey", () => {
  it("is order-independent and skips empty params", () => {
    expect(cacheKey("/discover/movie", { b: 2, a: 1, c: undefined, d: "" })).toBe(
      cacheKey("/discover/movie", { a: 1, b: 2 }),
    );
    expect(cacheKey("/x", {})).toBe("tmdb:/x");
  });
});
