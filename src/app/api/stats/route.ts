import { connection } from "next/server";
import { handle } from "@/lib/api";
import { db } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";

/** Cache and rate-limit counters for this server process (shown on /stats). */
export const GET = handle(async () => {
  await connection(); // always live, never prerendered
  const s = tmdb.cache.stats;
  const hits = s.memoryHits + s.persistentHits + s.staleServed;
  const lookups = hits + s.misses;
  const now = new Date();
  const [persistentEntries, persistentFresh] = await Promise.all([
    db.apiCache.count(),
    db.apiCache.count({ where: { expiresAt: { gt: now } } }),
  ]);

  return Response.json({
    tmdbConfigured: tmdb.configured,
    cache: {
      ...s,
      hitRate: lookups ? hits / lookups : 0,
      memoryEntries: tmdb.cache.memorySize,
      persistentEntries,
      persistentFresh,
    },
    rateLimit: {
      maxPerSecond: Number(process.env.TMDB_MAX_RPS ?? 35),
      queued: tmdb.limiter.pending,
      ...tmdb.runtime,
    },
  });
});
