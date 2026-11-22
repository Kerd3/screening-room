"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { GRID } from "./InfiniteGrid";
import { MediaCard, PosterSkeleton } from "./MediaCard";
import { EmptyState, ErrorNotice } from "./Notice";
import { itemKey, useBookmarks, type BookmarkedItem } from "@/lib/client/hooks";

type TypeFilter = "all" | "movie" | "tv";
type Sort = "newest" | "oldest" | "title";

export function BookmarksView() {
  const rawQuery = (useSearchParams().get("q") ?? "").trim();
  const q = rawQuery.toLowerCase();
  const { data, isPending, error, refetch } = useBookmarks();
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<Sort>("newest");

  if (isPending) {
    return (
      <div className={GRID}>
        {Array.from({ length: 6 }, (_, i) => (
          <PosterSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (error) return <ErrorNotice error={error} onRetry={() => refetch()} />;

  const all = data ?? [];
  if (all.length === 0) {
    return (
      <EmptyState title="Nothing bookmarked yet">
        Tap the bookmark on any poster to keep it here.{" "}
        <Link href="/movies" className="font-medium text-paper underline decoration-tungsten underline-offset-4">
          Browse movies
        </Link>
      </EmptyState>
    );
  }

  // Search on this page filters the user's own list locally, with no API call.
  const filtered = all
    .filter((b) => !q || b.title.toLowerCase().includes(q))
    .filter((b) => type === "all" || b.mediaType === type)
    .sort(sorters[sort]);

  if (q) {
    return (
      <>
        <h1 className="mb-8 text-xl text-paper md:text-[28px]" aria-live="polite">
          Found {filtered.length} {filtered.length === 1 ? "result" : "results"} for &lsquo;{rawQuery}&rsquo; in your
          bookmarks
        </h1>
        {/* Directly under the h1 here, so card titles are h2. */}
        <Grid items={filtered} headingLevel={2} />
      </>
    );
  }

  const movies = filtered.filter((b) => b.mediaType === "movie");
  const series = filtered.filter((b) => b.mediaType === "tv");

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end gap-4">
        <h1 className="display mr-auto text-[64px] text-paper">Bookmarks</h1>
        <div role="radiogroup" aria-label="Show" className="flex rounded-full bg-stall p-1">
          {(
            [
              ["all", `All ${all.length}`],
              ["movie", "Movies"],
              ["tv", "Series"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={type === v}
              onClick={() => setType(v)}
              className={`h-9 rounded-full px-4 text-[15px] font-medium transition-colors duration-150
                ${type === v ? "bg-paper text-velvet" : "text-usher hover:text-paper"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label htmlFor="bm-sort" className="sr-only">
          Sort bookmarks
        </label>
        <select
          id="bm-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-11 rounded-full border border-line bg-stall px-4 text-[15px] text-paper hover:bg-stall-raised"
        >
          <option value="newest">Recently bookmarked</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A to Z</option>
        </select>
      </div>

      {type !== "tv" && movies.length > 0 && (
        <Section title="Bookmarked movies" items={movies} />
      )}
      {type !== "movie" && series.length > 0 && (
        <Section title="Bookmarked TV series" items={series} />
      )}
    </>
  );
}

const sorters: Record<Sort, (a: BookmarkedItem, b: BookmarkedItem) => number> = {
  newest: (a, b) => b.bookmarkedAt.localeCompare(a.bookmarkedAt),
  oldest: (a, b) => a.bookmarkedAt.localeCompare(b.bookmarkedAt),
  title: (a, b) => a.title.localeCompare(b.title),
};

function Section({ title, items }: { title: string; items: BookmarkedItem[] }) {
  return (
    <section className="mb-16" aria-label={title}>
      <h2 className="mb-6 text-xl font-semibold text-paper">
        {title} <span className="font-normal text-usher">{items.length}</span>
      </h2>
      <Grid items={items} />
    </section>
  );
}

function Grid({ items, headingLevel = 3 }: { items: BookmarkedItem[]; headingLevel?: 2 | 3 }) {
  return (
    <div className={GRID}>
      {items.map((item, i) => (
        <MediaCard key={itemKey(item)} item={item} bookmarked preload={i < 6} headingLevel={headingLevel} />
      ))}
    </div>
  );
}
