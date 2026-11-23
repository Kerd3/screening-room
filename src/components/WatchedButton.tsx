"use client";

import { Check, Eye } from "lucide-react";
import { useToggleWatched } from "@/lib/client/hooks";
import type { MediaItem } from "@/lib/tmdb/types";

/** "Mark as watched" toggle for the title page, next to Bookmark. */
export function WatchedButton({ item, watched }: { item: MediaItem; watched: boolean }) {
  const toggle = useToggleWatched();
  const Icon = watched ? Check : Eye;
  return (
    <button
      type="button"
      aria-pressed={watched}
      onClick={() => toggle.mutate({ item, watched })}
      className={`inline-flex h-11 items-center gap-2 rounded-full border px-5 text-[15px] font-semibold transition-colors duration-150
        ${watched ? "border-transparent bg-stall text-paper hover:bg-stall-raised" : "border-line text-paper hover:bg-stall"}`}
    >
      <Icon className={`size-5 ${watched ? "text-tungsten" : ""}`} aria-hidden />
      {watched ? "Watched" : "Mark as watched"}
    </button>
  );
}
