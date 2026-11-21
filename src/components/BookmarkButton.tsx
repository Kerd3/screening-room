"use client";

import { Bookmark } from "lucide-react";
import { useState } from "react";
import { useToggleBookmark } from "@/lib/client/hooks";
import type { MediaItem } from "@/lib/tmdb/types";

export function BookmarkButton({
  item,
  bookmarked,
  variant = "overlay",
}: {
  item: MediaItem;
  bookmarked: boolean;
  variant?: "overlay" | "solid";
}) {
  const toggle = useToggleBookmark();
  const [pulse, setPulse] = useState(0);

  const label = bookmarked ? `Remove ${item.title} from bookmarks` : `Bookmark ${item.title}`;

  if (variant === "solid") {
    return (
      <button
        type="button"
        aria-pressed={bookmarked}
        onClick={() => {
          setPulse((p) => p + 1);
          toggle.mutate({ item, bookmarked });
        }}
        className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors duration-150
          ${bookmarked ? "bg-stall text-paper hover:bg-stall-raised" : "bg-tungsten text-velvet hover:bg-[#f5c46a]"}`}
      >
        <Bookmark
          key={pulse}
          className={`size-5 ${pulse ? "motion-safe:animate-pulse-once" : ""} ${bookmarked ? "fill-tungsten text-tungsten" : ""}`}
          aria-hidden
        />
        {bookmarked ? "Bookmarked" : "Bookmark"}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={bookmarked}
      aria-label={label}
      title={label}
      onClick={() => {
        setPulse((p) => p + 1);
        toggle.mutate({ item, bookmarked });
      }}
      className={`flex size-11 items-center justify-center rounded-full backdrop-blur-sm transition-colors duration-150
        ${bookmarked ? "bg-velvet/80 text-tungsten" : "bg-velvet/60 text-paper hover:bg-velvet/90"}`}
    >
      <Bookmark
        key={pulse}
        className={`size-[18px] ${pulse ? "motion-safe:animate-pulse-once" : ""} ${bookmarked ? "fill-tungsten" : ""}`}
        aria-hidden
        strokeWidth={2}
      />
    </button>
  );
}
