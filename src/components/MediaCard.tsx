"use client";

import Image from "next/image";
import Link from "next/link";
import { Film, Star, Tv } from "lucide-react";
import { BookmarkButton } from "./BookmarkButton";
import { tmdbImage } from "@/lib/tmdb/images";
import type { MediaItem } from "@/lib/tmdb/types";

export const POSTER_SIZES = "(min-width: 1440px) 200px, (min-width: 1024px) 18vw, (min-width: 768px) 25vw, 45vw";

export function MediaCard({
  item,
  bookmarked,
  preload = false,
  reason,
  onOpen,
  className = "",
}: {
  item: MediaItem;
  bookmarked: boolean;
  preload?: boolean;
  /** Why this title is recommended; shown in lilac under the metadata. */
  reason?: string;
  onOpen?: () => void;
  className?: string;
}) {
  const poster = tmdbImage(item.posterPath, "poster");
  const href = `/title/${item.mediaType}/${item.id}`;

  return (
    <article className={`group relative ${className}`}>
      <Link href={href} onClick={onOpen} className="block rounded-poster">
        <div className="relative aspect-[2/3] overflow-hidden rounded-poster bg-stall">
          {poster ? (
            <Image
              src={poster}
              alt=""
              fill
              sizes={POSTER_SIZES}
              preload={preload}
              loading={preload ? undefined : "lazy"}
              className="object-cover transition-[filter] duration-200 group-hover:brightness-110"
            />
          ) : (
            <div className="flex h-full items-end p-3">
              <span className="display text-[28px] text-usher">{item.title}</span>
            </div>
          )}
        </div>
        <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug text-paper group-hover:underline group-hover:decoration-tungsten/70 group-hover:underline-offset-4">
          {item.title}
        </h3>
      </Link>

      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-usher">
        {item.year && <span>{item.year}</span>}
        <span className="inline-flex items-center gap-1">
          {item.mediaType === "movie" ? (
            <Film className="size-3.5" aria-hidden />
          ) : (
            <Tv className="size-3.5" aria-hidden />
          )}
          {item.mediaType === "movie" ? "Movie" : "Series"}
        </span>
        {item.rating > 0 && (
          <span className="inline-flex items-center gap-1">
            <Star className="size-3.5" aria-hidden />
            <span className="sr-only">Rated</span>
            {item.rating.toFixed(1)}
          </span>
        )}
      </p>
      {reason && <p className="mt-1 line-clamp-2 text-sm text-lilac">{reason}</p>}

      <div className="absolute right-2 top-2">
        <BookmarkButton item={item} bookmarked={bookmarked} />
      </div>
    </article>
  );
}

export function PosterSkeleton() {
  return (
    <div aria-hidden>
      <div className="aspect-[2/3] rounded-poster bg-stall motion-safe:animate-pulse" />
      <div className="mt-3 h-4 w-3/4 rounded bg-stall" />
      <div className="mt-2 h-3 w-1/2 rounded bg-stall" />
    </div>
  );
}
