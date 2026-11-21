"use client";

import { useSearchParams } from "next/navigation";
import { DECADES, FilterBar, useFilters } from "./FilterBar";
import { InfiniteGrid } from "./InfiniteGrid";
import { EmptyState } from "./Notice";
import { SearchResults } from "./SearchResults";
import { fetchJson, qs } from "@/lib/client/fetcher";
import type { MediaItem, MediaType, Paged } from "@/lib/tmdb/types";

const TITLES: Record<MediaType, string> = { movie: "Movies", tv: "TV Series" };

export function BrowseView({ type }: { type: MediaType }) {
  const q = useSearchParams().get("q")?.trim();
  const f = useFilters();

  if (q) return <SearchResults q={q} type={type} />;

  const decade = DECADES.find((d) => d.value === f.decade);
  const params = {
    type,
    genres: f.genres.join(",") || undefined,
    sort: f.sort,
    status: type === "tv" ? f.status : undefined,
    yearFrom: decade && "from" in decade ? decade.from : undefined,
    yearTo: decade && "to" in decade ? decade.to : undefined,
  };

  return (
    <>
      <h1 className="display mb-6 text-[64px] text-paper">{TITLES[type]}</h1>
      <FilterBar type={type} />
      <InfiniteGrid
        queryKey={["browse", params]}
        fetchPage={(page) => fetchJson<Paged<MediaItem>>(`/api/browse?${qs({ ...params, page })}`)}
        empty={
          <EmptyState title="No matches">
            No {type === "movie" ? "movies" : "series"} match all of these filters. Remove a genre or
            widen the years.
          </EmptyState>
        }
      />
    </>
  );
}
