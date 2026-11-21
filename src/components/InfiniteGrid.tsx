"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import { MediaCard, PosterSkeleton } from "./MediaCard";
import { ErrorNotice } from "./Notice";
import { itemKey, useBookmarkKeys } from "@/lib/client/hooks";
import type { MediaItem, Paged } from "@/lib/tmdb/types";

export const GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-8 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-x-6 md:gap-y-12";

type PageWithMeta = Paged<MediaItem> & { historyId?: number | null };

/**
 * Poster grid with infinite scroll. An IntersectionObserver near the bottom
 * fetches the next page early, and a "Load more" button is the fallback.
 */
export function InfiniteGrid({
  queryKey,
  fetchPage,
  header,
  empty,
  onItemOpen,
}: {
  queryKey: unknown[];
  fetchPage: (page: number) => Promise<PageWithMeta>;
  header?: (total: number) => ReactNode;
  empty?: ReactNode;
  onItemOpen?: (item: MediaItem, firstPage: PageWithMeta) => void;
}) {
  const bookmarks = useBookmarkKeys();
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });

  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (q.isPending) {
    return (
      <div className={GRID} aria-busy="true" aria-label="Loading titles">
        {Array.from({ length: 12 }, (_, i) => (
          <PosterSkeleton key={i} />
        ))}
      </div>
    );
  }
  // Only a failed first page replaces the grid; a failed later page shows below it.
  if (!q.data) return <ErrorNotice error={q.error} onRetry={() => q.refetch()} />;

  // TMDB can repeat a title across pages while popularity shifts; drop duplicates.
  const seen = new Set<string>();
  const items = q.data.pages
    .flatMap((p) => p.results)
    .filter((i) => (seen.has(itemKey(i)) ? false : (seen.add(itemKey(i)), true)));
  const total = q.data.pages[0]?.totalResults ?? 0;

  if (items.length === 0) return <>{empty}</>;

  return (
    <section>
      {header?.(total)}
      <div className={GRID}>
        {items.map((item, i) => (
          <MediaCard
            key={itemKey(item)}
            item={item}
            preload={i < 6}
            bookmarked={bookmarks.has(itemKey(item))}
            onOpen={onItemOpen ? () => onItemOpen(item, q.data.pages[0]) : undefined}
          />
        ))}
        {q.isFetchingNextPage &&
          Array.from({ length: 6 }, (_, i) => <PosterSkeleton key={`more-${i}`} />)}
      </div>
      <div ref={sentinel} className="h-px" />
      {q.hasNextPage && !q.isFetchingNextPage && (
        <div className="mt-12 flex justify-center">
          <button
            onClick={() => q.fetchNextPage()}
            className="h-11 rounded-full border border-line px-6 text-[15px] font-medium text-paper hover:bg-stall"
          >
            Load more
          </button>
        </div>
      )}
      {q.isFetchNextPageError && (
        <div className="mt-8">
          <ErrorNotice error={q.error} onRetry={() => q.fetchNextPage()} />
        </div>
      )}
    </section>
  );
}
