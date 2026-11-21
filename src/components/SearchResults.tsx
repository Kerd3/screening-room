"use client";

import { InfiniteGrid } from "./InfiniteGrid";
import { EmptyState } from "./Notice";
import { fetchJson, qs } from "@/lib/client/fetcher";
import type { MediaItem, Paged } from "@/lib/tmdb/types";

type SearchPage = Paged<MediaItem> & { historyId: number | null };

export function SearchResults({ q, type }: { q: string; type: "all" | "movie" | "tv" }) {
  return (
    <InfiniteGrid
      queryKey={["search", type, q]}
      fetchPage={(page) => fetchJson<SearchPage>(`/api/search?${qs({ q, type, page })}`)}
      header={(total) => (
        <h1 className="mb-8 text-xl text-paper md:text-[28px]" aria-live="polite">
          Found {total.toLocaleString()} {total === 1 ? "result" : "results"} for &lsquo;{q}&rsquo;
        </h1>
      )}
      empty={
        <EmptyState title={`Nothing found for “${q}”`}>
          Check the spelling, or try the original title or a shorter search.
        </EmptyState>
      }
      // Which result a search led to is a stronger signal than the query alone.
      onItemOpen={(item, first) => {
        if (!first.historyId) return;
        void fetch("/api/search/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ historyId: first.historyId, type: item.mediaType, tmdbId: item.id }),
          keepalive: true,
        });
      }}
    />
  );
}
