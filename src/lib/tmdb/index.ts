import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { TieredCache } from "./cache";
import { createTmdbClient, prismaCacheStore, type TmdbClient } from "./client";
import { createGlobalGate, type GlobalGate } from "./globalGate";
import { TokenBucket } from "./rateLimiter";

const maxRps = Number(process.env.TMDB_MAX_RPS ?? 35);

function makeGlobalGate(): GlobalGate {
  const redis = getRedis();
  if (!redis) return createGlobalGate(null);
  const bucket = new Ratelimit({
    redis,
    limiter: Ratelimit.tokenBucket(maxRps, "1 s", maxRps),
    prefix: "sr:tmdb",
    timeout: 500,
  });
  return createGlobalGate((key) => bucket.limit(key));
}

// One client (and so one cache and one rate limiter) per server process.
const g = globalThis as unknown as { __tmdb?: TmdbClient; __tmdbGate?: GlobalGate };

export const tmdbGlobalGate: GlobalGate = (g.__tmdbGate ??= makeGlobalGate());

export const tmdb: TmdbClient =
  g.__tmdb ??
  createTmdbClient({
    token: () => process.env.TMDB_READ_TOKEN || undefined,
    cache: new TieredCache(prismaCacheStore(db)),
    limiter: new TokenBucket(maxRps),
    globalGate: tmdbGlobalGate,
  });

if (process.env.NODE_ENV !== "production") g.__tmdb = tmdb;

export { TmdbConfigError, TmdbError, TTL } from "./client";
