"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorNotice } from "./Notice";
import { fetchJson } from "@/lib/client/fetcher";

interface Stats {
  tmdbConfigured: boolean;
  cache: {
    memoryHits: number;
    persistentHits: number;
    staleServed: number;
    staleOnError: number;
    misses: number;
    coalesced: number;
    upstreamCalls: number;
    upstreamErrors: number;
    hitRate: number;
    memoryEntries: number;
    persistentEntries: number;
    persistentFresh: number;
  };
  rateLimit: {
    maxPerSecond: number;
    queued: number;
    rateLimited429: number;
    retries: number;
    backend: "redis" | "memory";
    globalWaits: number;
    globalFailOpen: number;
  };
}

export function StatsView() {
  const q = useQuery({
    queryKey: ["stats"],
    queryFn: () => fetchJson<Stats>("/api/stats"),
    refetchInterval: 3000,
  });
  if (q.isError) return <ErrorNotice error={q.error} />;
  const s = q.data;

  return (
    <>
      <h1 className="display text-[64px] text-paper">Cache and rate limits</h1>
      <p className="mt-2 max-w-[65ch] text-usher">
        Live counters for this server process. Browse a few pages, then come back: repeat visits are served from
        cache and never reach TMDB.
      </p>
      {s && (
        <div className="mt-10 grid gap-12 lg:grid-cols-2">
          <section aria-labelledby="cache-h">
            <h2 id="cache-h" className="text-xl font-semibold text-paper">
              TMDB response cache
            </h2>
            <p className="mt-4">
              <span className="display text-[96px] text-tungsten">{Math.round(s.cache.hitRate * 100)}%</span>
              <span className="ml-3 text-usher">of lookups served without calling TMDB</span>
            </p>
            <dl className="mt-6 divide-y divide-line">
              <Stat label="Memory hits (tier 1)" value={s.cache.memoryHits} />
              <Stat label="Database hits (tier 2, shared)" value={s.cache.persistentHits} />
              <Stat label="Stale served while refreshing" value={s.cache.staleServed} />
              <Stat label="Old copy served when TMDB failed" value={s.cache.staleOnError} />
              <Stat label="Misses" value={s.cache.misses} />
              <Stat label="Duplicate requests merged" value={s.cache.coalesced} />
              <Stat label="Entries in memory" value={s.cache.memoryEntries} />
              <Stat label="Entries in database (fresh)" value={`${s.cache.persistentEntries} (${s.cache.persistentFresh})`} />
            </dl>
          </section>
          <section aria-labelledby="rl-h">
            <h2 id="rl-h" className="text-xl font-semibold text-paper">
              Outbound rate limiting
            </h2>
            <dl className="mt-6 divide-y divide-line">
              <Stat label="Upstream calls to TMDB" value={s.cache.upstreamCalls} />
              <Stat label="Upstream errors" value={s.cache.upstreamErrors} />
              <Stat
                label="Where limits are counted"
                value={s.rateLimit.backend === "redis" ? "Redis, shared by all servers" : "Memory, per server"}
              />
              <Stat label="Token bucket limit" value={`${s.rateLimit.maxPerSecond} per second`} />
              <Stat label="Waits for the shared TMDB bucket" value={s.rateLimit.globalWaits} />
              <Stat label="Requests waiting for a token" value={s.rateLimit.queued} />
              <Stat label="429 responses from TMDB" value={s.rateLimit.rateLimited429} />
              <Stat label="Retries after backoff" value={s.rateLimit.retries} />
              <Stat label="TMDB token configured" value={s.tmdbConfigured ? "Yes" : "No"} />
            </dl>
          </section>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-usher">{label}</dt>
      <dd className="font-semibold tabular-nums text-paper">{typeof value === "number" ? value.toLocaleString() : value}</dd>
    </div>
  );
}
