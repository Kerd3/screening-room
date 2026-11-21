import { cacheKey, TieredCache, type PersistentStore } from "./cache";
import { RetryableError, TokenBucket, withRetry } from "./rateLimiter";

const BASE_URL = "https://api.themoviedb.org/3";

/** Cache lifetimes by kind of data: the more volatile, the shorter. */
export const TTL = {
  config: 7 * 24 * 60 * 60 * 1000, // genres, configuration
  detail: 24 * 60 * 60 * 1000, // title details, similar, recommendations
  list: 60 * 60 * 1000, // trending, popular, discover
  search: 10 * 60 * 1000,
  tvStatus: 6 * 60 * 60 * 1000, // used by season alerts
} as const;
export type TtlKind = keyof typeof TTL;

export class TmdbConfigError extends Error {
  constructor() {
    super("TMDB_READ_TOKEN is not set. Add your TMDB API Read Access Token to .env.");
    this.name = "TmdbConfigError";
  }
}

export class TmdbError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

export interface TmdbRuntimeStats {
  rateLimited429: number;
  retries: number;
}

interface TmdbClientDeps {
  token: () => string | undefined;
  cache: TieredCache;
  limiter: TokenBucket;
  fetchImpl?: typeof fetch;
}

export function createTmdbClient(deps: TmdbClientDeps) {
  const runtime: TmdbRuntimeStats = { rateLimited429: 0, retries: 0 };
  const doFetch = deps.fetchImpl ?? fetch;

  async function upstream<T>(path: string, params: Record<string, string | number | undefined>) {
    const token = deps.token();
    if (!token) throw new TmdbConfigError();

    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }

    return withRetry(
      async () => {
        await deps.limiter.acquire();
        let res: Response;
        try {
          res = await doFetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store", // this module does its own caching
            signal: AbortSignal.timeout(8000),
          });
        } catch (err) {
          throw new RetryableError(`Network error calling TMDB: ${(err as Error).message}`);
        }

        if (res.status === 429) {
          runtime.rateLimited429++;
          const retryAfterMs = Number(res.headers.get("retry-after") ?? "1") * 1000;
          deps.limiter.pauseFor(retryAfterMs);
          throw new RetryableError("TMDB rate limit hit", retryAfterMs);
        }
        if (res.status >= 500) throw new RetryableError(`TMDB ${res.status}`);
        if (res.status === 401) throw new TmdbError(401, "TMDB rejected the API token.");
        if (!res.ok) throw new TmdbError(res.status, `TMDB ${res.status} for ${path}`);
        return (await res.json()) as T;
      },
      { onRetry: () => void runtime.retries++ },
    );
  }

  /** Cached, rate-limited GET against the TMDB v3 API. */
  function get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    ttl: TtlKind = "list",
  ): Promise<T> {
    // Fail before the cache layer, so a missing token isn't counted as an upstream call.
    if (!deps.token()) return Promise.reject(new TmdbConfigError());
    const merged = { language: "en-US", include_adult: "false", ...params };
    return deps.cache.getOrFetch(cacheKey(path, merged), TTL[ttl], () =>
      upstream<T>(path, merged),
    );
  }

  return {
    get,
    runtime,
    cache: deps.cache,
    limiter: deps.limiter,
    get configured() {
      return Boolean(deps.token());
    },
  };
}

export type TmdbClient = ReturnType<typeof createTmdbClient>;

export function prismaCacheStore(db: {
  apiCache: {
    findUnique(args: { where: { key: string } }): Promise<{ body: string; expiresAt: Date } | null>;
    upsert(args: {
      where: { key: string };
      create: { key: string; body: string; expiresAt: Date };
      update: { body: string; expiresAt: Date };
    }): Promise<unknown>;
  };
}): PersistentStore {
  return {
    async get(key) {
      const row = await db.apiCache.findUnique({ where: { key } });
      return row ? { body: row.body, expiresAt: row.expiresAt.getTime() } : null;
    },
    async set(key, body, expiresAt) {
      const exp = new Date(expiresAt);
      await db.apiCache.upsert({
        where: { key },
        create: { key, body, expiresAt: exp },
        update: { body, expiresAt: exp },
      });
    },
  };
}
