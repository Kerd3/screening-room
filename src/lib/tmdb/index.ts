import "server-only";
import { db } from "@/lib/db";
import { TieredCache } from "./cache";
import { createTmdbClient, prismaCacheStore, type TmdbClient } from "./client";
import { TokenBucket } from "./rateLimiter";

// One client (and so one cache and one rate limiter) per server process.
const g = globalThis as unknown as { __tmdb?: TmdbClient };

export const tmdb: TmdbClient =
  g.__tmdb ??
  createTmdbClient({
    token: () => process.env.TMDB_READ_TOKEN || undefined,
    cache: new TieredCache(prismaCacheStore(db)),
    limiter: new TokenBucket(Number(process.env.TMDB_MAX_RPS ?? 35)),
  });

if (process.env.NODE_ENV !== "production") g.__tmdb = tmdb;

export { TmdbConfigError, TmdbError, TTL } from "./client";
