"use client";

import Image from "next/image";
import Link from "next/link";
import { EyeOff, Film, Star, Tv } from "lucide-react";
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
  onDismiss,
  className = "",
  headingLevel = 3,
  sizes = POSTER_SIZES,
}: {
  item: MediaItem;
  bookmarked: boolean;
  preload?: boolean;
  /** Why this title is recommended; shown in lilac under the metadata. */
  reason?: string;
  onOpen?: () => void;
  /** Shows a "Not interested" button (recommendations only). */
  onDismiss?: () => void;
  className?: string;
  /** 2 when the card sits directly under the page's h1 (grids); 3 under a section h2 (shelves). */
  headingLevel?: 2 | 3;
  /** Rendered poster width, so the browser downloads the right size (grids vs fixed-width shelves). */
  sizes?: string;
}) {
  const poster = tmdbImage(item.posterPath, "poster");
  const Heading = headingLevel === 2 ? "h2" : "h3";
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
              sizes={sizes}
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
        <Heading className="mt-3 line-clamp-2 text-base font-semibold leading-snug text-paper group-hover:underline group-hover:decoration-tungsten/70 group-hover:underline-offset-4">
          {item.title}
        </Heading>
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
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Not interested in ${item.title}`}
          title="Not interested"
          className="absolute left-2 top-2 flex size-11 items-center justify-center rounded-full bg-velvet/60 text-paper backdrop-blur-sm
                     transition-[opacity,background-color] duration-150 hover:bg-velvet/90
                     md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <EyeOff className="size-[18px]" aria-hidden />
        </button>
      )}
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
