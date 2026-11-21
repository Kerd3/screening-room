"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaCard, PosterSkeleton } from "./MediaCard";
import { itemKey, useBookmarkKeys } from "@/lib/client/hooks";
import type { MediaItem } from "@/lib/tmdb/types";

/** A horizontally scrolling shelf of posters with keyboard and button scrolling. */
export function Row({
  title,
  items,
  loading,
  reasons,
  action,
  children,
}: {
  title: string;
  items?: MediaItem[];
  loading?: boolean;
  reasons?: Record<string, string>;
  action?: ReactNode;
  /** Rendered instead of the shelf (e.g. an error or a sign-in prompt). */
  children?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const bookmarks = useBookmarkKeys();
  const id = `row-${title.toLowerCase().replace(/\W+/g, "-")}`;

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section aria-labelledby={id} className="mt-12 first:mt-0">
      <div className="mb-4 flex items-end gap-4">
        <h2 id={id} className="display text-[32px] text-paper">
          {title}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {action}
          {!children && (
            <span className="hidden gap-2 md:flex">
              <button
                onClick={() => scrollBy(-1)}
                className="flex size-11 items-center justify-center rounded-full text-usher hover:bg-stall hover:text-paper"
              >
                <ChevronLeft className="size-5" aria-hidden />
                <span className="sr-only">Scroll {title} left</span>
              </button>
              <button
                onClick={() => scrollBy(1)}
                className="flex size-11 items-center justify-center rounded-full text-usher hover:bg-stall hover:text-paper"
              >
                <ChevronRight className="size-5" aria-hidden />
                <span className="sr-only">Scroll {title} right</span>
              </button>
            </span>
          )}
        </div>
      </div>

      {children ?? (
        <div
          ref={scroller}
          tabIndex={0}
          aria-label={`${title}, scrollable`}
          className="row-scroll -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:gap-6 md:px-8"
        >
          {loading || !items
            ? Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="w-[150px] shrink-0 md:w-[180px]">
                  <PosterSkeleton />
                </div>
              ))
            : items.map((item) => (
                <MediaCard
                  key={itemKey(item)}
                  item={item}
                  bookmarked={bookmarks.has(itemKey(item))}
                  reason={reasons?.[itemKey(item)]}
                  className="w-[150px] shrink-0 snap-start md:w-[180px]"
                />
              ))}
        </div>
      )}
    </section>
  );
}
