import { LRUCache } from "lru-cache";

/**
 * Two-tier cache for expensive upstream calls.
 *
 *   tier 1: in-process LRU, fast but lost on restart
 *   tier 2: persistent store (SQLite ApiCache table), survives restarts
 *
 * Behaviors:
 *   - fresh hit: return immediately
 *   - stale hit (past TTL): return the stale value now and refresh in the background
 *   - miss: fetch upstream; concurrent misses for one key share a single
 *     in-flight promise (request coalescing, so there is no stampede)
 *   - upstream failure: serve any stored copy, however old, before failing
 */

export interface StoredEntry {
  body: string;
  expiresAt: number; // epoch ms, soft expiry
}

export interface PersistentStore {
  get(key: string): Promise<StoredEntry | null>;
  set(key: string, body: string, expiresAt: number): Promise<void>;
}

export interface CacheStats {
  memoryHits: number;
  persistentHits: number;
  staleServed: number;
  staleOnError: number;
  misses: number;
  coalesced: number;
  upstreamCalls: number;
  upstreamErrors: number;
  revalidations: number;
}

const emptyStats = (): CacheStats => ({
  memoryHits: 0,
  persistentHits: 0,
  staleServed: 0,
  staleOnError: 0,
  misses: 0,
  coalesced: 0,
  upstreamCalls: 0,
  upstreamErrors: 0,
  revalidations: 0,
});

export class TieredCache {
  private memory: LRUCache<string, StoredEntry>;
  private inflight = new Map<string, Promise<unknown>>();
  readonly stats: CacheStats = emptyStats();

  constructor(
    private readonly store: PersistentStore | null,
    opts: { maxEntries?: number; now?: () => number } = {},
  ) {
    this.memory = new LRUCache({ max: opts.maxEntries ?? 2000 });
    this.now = opts.now ?? Date.now;
  }

  private now: () => number;

  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const entry = await this.lookup(key);
    if (entry) {
      if (entry.expiresAt > this.now()) return JSON.parse(entry.body) as T;
      // Stale: serve now, refresh in the background.
      this.stats.staleServed++;
      this.stats.revalidations++;
      void this.fetchAndStore(key, ttlMs, fetcher).catch(() => {});
      return JSON.parse(entry.body) as T;
    }

    this.stats.misses++;
    try {
      return await this.fetchAndStore(key, ttlMs, fetcher);
    } catch (err) {
      // Last resort: an old copy might still exist in persistent storage.
      const fallback = await this.lookup(key, { countHit: false });
      if (fallback) {
        this.stats.staleOnError++;
        return JSON.parse(fallback.body) as T;
      }
      throw err;
    }
  }

  private async lookup(key: string, { countHit = true } = {}): Promise<StoredEntry | null> {
    const mem = this.memory.get(key);
    if (mem) {
      if (countHit && mem.expiresAt > this.now()) this.stats.memoryHits++;
      return mem;
    }
    if (!this.store) return null;
    try {
      const row = await this.store.get(key);
      if (row) {
        if (countHit && row.expiresAt > this.now()) this.stats.persistentHits++;
        this.memory.set(key, row);
      }
      return row;
    } catch {
      return null; // a broken cache store must never take the app down
    }
  }

  private fetchAndStore<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      this.stats.coalesced++;
      return existing as Promise<T>;
    }
    const p = (async () => {
      this.stats.upstreamCalls++;
      try {
        const value = await fetcher();
        const entry: StoredEntry = { body: JSON.stringify(value), expiresAt: this.now() + ttlMs };
        this.memory.set(key, entry);
        if (this.store) await this.store.set(key, entry.body, entry.expiresAt).catch(() => {});
        return value;
      } catch (err) {
        this.stats.upstreamErrors++;
        // On a failed background refresh, keep the stale entry where it is.
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  resetStats() {
    Object.assign(this.stats, emptyStats());
  }

  get memorySize() {
    return this.memory.size;
  }
}

/** Builds a stable, readable cache key: path plus sorted query params. */
export function cacheKey(path: string, params: Record<string, string | number | undefined>) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `tmdb:${path}${qs ? `?${qs}` : ""}`;
}
