"use client";

import Link from "next/link";
import { GRID } from "./InfiniteGrid";
import { MediaCard, PosterSkeleton } from "./MediaCard";
import { EmptyState, ErrorNotice } from "./Notice";
import { itemKey, useBookmarkKeys, useWatched, type WatchedItem } from "@/lib/client/hooks";

const link = "font-medium text-paper underline decoration-tungsten underline-offset-4";

/** Watch history, grouped by the month each title was watched. */
export function WatchedView() {
  const { data, isPending, error, refetch } = useWatched();
  const bookmarks = useBookmarkKeys();

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
      <EmptyState title="No watch history yet">
        Use &ldquo;Mark as watched&rdquo; on any title, or{" "}
        <Link href="/settings#import" className={link}>
          import your Letterboxd or IMDb history
        </Link>
        . Watched titles shape your recommendations and are never recommended again.
      </EmptyState>
    );
  }

  const months = groupByMonth(all);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end gap-4">
        <h1 className="display mr-auto text-[64px] text-paper">Watch history</h1>
        <p className="text-usher">
          {all.length} {all.length === 1 ? "title" : "titles"} ·{" "}
          <Link href="/settings#import" className={link}>
            Import more
          </Link>
        </p>
      </div>
      {months.map(([label, items]) => (
        <section key={label} className="mb-16" aria-label={label}>
          <h2 className="mb-6 text-xl font-semibold text-paper">
            {label} <span className="font-normal text-usher">{items.length}</span>
          </h2>
          <div className={GRID}>
            {items.map((item, i) => (
              <MediaCard key={itemKey(item)} item={item} bookmarked={bookmarks.has(itemKey(item))} preload={i < 6} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function groupByMonth(items: WatchedItem[]): [string, WatchedItem[]][] {
  const groups = new Map<string, WatchedItem[]>();
  for (const item of items) {
    const label = new Date(item.watchedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups];
}
