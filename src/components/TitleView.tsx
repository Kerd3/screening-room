"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { BookmarkButton } from "./BookmarkButton";
import { POSTER_SIZES } from "./MediaCard";
import Link from "next/link";
import { EmptyState, ErrorNotice } from "./Notice";
import { RatingPanel } from "./RatingPanel";
import { Row } from "./Row";
import { ShareButton } from "./ShareButton";
import { WatchedButton } from "./WatchedButton";
import { WhereToWatch } from "./WhereToWatch";
import { ApiError, fetchJson } from "@/lib/client/fetcher";
import { itemKey, useBookmarkKeys, useMe, useWatchedKeys } from "@/lib/client/hooks";
import { tmdbImage } from "@/lib/tmdb/images";
import type { MediaDetail, MediaItem, MediaType } from "@/lib/tmdb/types";

export function TitleView({ type, id }: { type: MediaType; id: number }) {
  const bookmarks = useBookmarkKeys();
  const watched = useWatchedKeys();
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ["title", type, id],
    queryFn: () => fetchJson<{ detail: MediaDetail; similar: MediaItem[] }>(`/api/titles/${type}/${id}`),
  });
  const together = useQuery({
    queryKey: ["together", type, id],
    queryFn: () => fetchJson<{ items: (MediaItem & { sharedBy: number })[] }>(`/api/titles/${type}/${id}/together`),
    select: (d) => d.items,
  });

  if (q.isPending) return <div className="aspect-[21/9] w-full rounded-panel bg-stall motion-safe:animate-pulse" aria-busy="true" />;
  if (q.isError) {
    // A title TMDB doesn't have: say so plainly instead of offering a retry that can't work.
    if (q.error instanceof ApiError && q.error.status === 404) {
      return (
        <EmptyState title="We couldn't find that title">
          It may have been removed from TMDB, or the link may be wrong.{" "}
          <Link href={type === "tv" ? "/tv" : "/movies"} className="font-medium text-paper underline decoration-tungsten underline-offset-4">
            Browse {type === "tv" ? "TV series" : "movies"}
          </Link>
        </EmptyState>
      );
    }
    return <ErrorNotice error={q.error} onRetry={() => q.refetch()} />;
  }

  const { detail: d, similar } = q.data;
  const backdrop = tmdbImage(d.backdropPath, "backdrop");
  const poster = tmdbImage(d.posterPath, "poster");
  const bookmarked = bookmarks.has(itemKey(d));
  const length =
    d.mediaType === "movie"
      ? d.runtime && `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m`
      : d.numberOfSeasons && `${d.numberOfSeasons} ${d.numberOfSeasons === 1 ? "season" : "seasons"}`;

  return (
    <article>
      <div className="relative -mx-4 overflow-hidden md:mx-0 md:rounded-panel">
        <div className="relative aspect-[16/9] max-h-[440px] w-full bg-stall md:aspect-[21/9]">
          {backdrop && <Image src={backdrop} alt="" fill preload sizes="(min-width: 1440px) 1352px, 100vw" className="object-cover" />}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-velvet via-velvet/40 to-transparent" />
        </div>
      </div>

      <div className="relative -mt-24 grid gap-8 md:-mt-40 md:grid-cols-[220px_minmax(0,1fr)] md:px-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="relative hidden aspect-[2/3] overflow-hidden rounded-poster bg-stall md:block">
          {poster && <Image src={poster} alt={`${d.title} poster`} fill sizes={POSTER_SIZES} className="object-cover" />}
        </div>

        <div className="md:pt-24">
          <h1 className="display text-[64px] text-paper md:text-[96px]">{d.title}</h1>
          {d.tagline && <p className="mt-3 text-xl text-usher">{d.tagline}</p>}
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-usher">
            {d.year && <span>{d.year}</span>}
            <span>{d.mediaType === "movie" ? "Movie" : "Series"}</span>
            {length && <span>{length}</span>}
            {d.status && d.mediaType === "tv" && <span>{d.status}</span>}
            {d.rating > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="size-4" aria-hidden />
                {d.rating.toFixed(1)} on TMDB
              </span>
            )}
          </p>
          {d.genres.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Genres">
              {d.genres.map((g) => (
                <li key={g.id} className="rounded-full border border-line px-3 py-1 text-sm text-usher">
                  {g.name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 max-w-[65ch] text-paper/90">{d.overview || "No synopsis available."}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <BookmarkButton item={d} bookmarked={bookmarked} variant="solid" />
            <WatchedButton item={d} watched={watched.has(itemKey(d))} />
            {me?.user && <ShareButton item={d} />}
          </div>
          {d.mediaType === "tv" && d.nextEpisodeDate && (
            <p className="mt-6 text-usher">
              Next episode airs{" "}
              <span className="text-paper">
                {new Date(d.nextEpisodeDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
              </span>
              .{!bookmarked && " Bookmark the series to get an alert when a new season is announced."}
            </p>
          )}
        </div>
      </div>

      <WhereToWatch type={type} id={id} title={d.title} />

      {d.seasons.length > 0 && (
        <section aria-labelledby="seasons" className="mt-16">
          <h2 id="seasons" className="display text-[32px] text-paper">
            Seasons
          </h2>
          <ol className="mt-4 divide-y divide-line">
            {d.seasons.map((s) => (
              <li key={s.seasonNumber} className="flex flex-wrap items-baseline gap-x-4 py-3">
                <span className="w-40 font-medium text-paper">{s.name}</span>
                <span className="text-usher">{s.episodeCount} episodes</span>
                {s.airDate && <span className="text-usher">{s.airDate.slice(0, 4)}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <RatingPanel type={type} tmdbId={id} title={d.title} />

      {together.data && together.data.length > 0 && (
        <div className="mt-16">
          <Row
            title="Bookmarked together"
            items={together.data}
            reasons={Object.fromEntries(
              together.data.map((t) => [itemKey(t), `Saved with this by ${t.sharedBy} ${t.sharedBy === 1 ? "person" : "people"}`]),
            )}
          />
        </div>
      )}
      {similar.length > 0 && (
        <div className="mt-16">
          <Row title="More like this" items={similar} />
        </div>
      )}
    </article>
  );
}
