"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookmarkButton } from "./BookmarkButton";
import { ErrorNotice } from "./Notice";
import { Row } from "./Row";
import { SearchResults } from "./SearchResults";
import { fetchJson } from "@/lib/client/fetcher";
import { itemKey, useBookmarkKeys, useMe } from "@/lib/client/hooks";
import { HOME_SHELF_URLS } from "@/lib/homeShelves";
import { genreName } from "@/lib/tmdb/genres";
import { tmdbImage } from "@/lib/tmdb/images";
import type { MediaItem, Paged } from "@/lib/tmdb/types";

export interface Recommendations {
  items: MediaItem[];
  reasons: Record<string, string>;
  strategy: "hybrid" | "cold-start" | "popular";
}

const get = <T,>(url: string) => () => fetchJson<T>(url);

/** Titles per shelf: about two screens of scrolling, and a third fewer cards to render than 20. */
const SHELF_SIZE = 12;

/**
 * q comes from the server page (not useSearchParams), so Home can be
 * server-rendered with its data instead of rendering only in the browser.
 */
export function HomeView({ q }: { q?: string }) {
  if (q) return <SearchResults q={q} type="all" />;
  return <Shelves />;
}

/** Shown in the static shell while the server renders Home's content. */
export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="relative -mx-4 mb-4 overflow-hidden md:mx-0 md:rounded-panel">
        <div className="aspect-[4/5] max-h-[640px] w-full bg-stall sm:aspect-[16/9] md:aspect-[21/9] md:min-h-[440px]" />
      </div>
    </div>
  );
}

function Shelves() {
  const { data: me } = useMe();
  const signedIn = Boolean(me?.user);
  const trending = useQuery({ queryKey: ["trending", "all"], queryFn: get<Paged<MediaItem>>(HOME_SHELF_URLS[0]) });
  const movies = useQuery({ queryKey: ["trending", "movie"], queryFn: get<Paged<MediaItem>>(HOME_SHELF_URLS[1]) });
  const series = useQuery({ queryKey: ["trending", "tv"], queryFn: get<Paged<MediaItem>>(HOME_SHELF_URLS[2]) });
  const recs = useQuery({
    queryKey: ["recommendations"],
    queryFn: get<Recommendations>(`/api/recommendations?limit=${SHELF_SIZE}`),
    enabled: signedIn,
  });
  const { hidden, dismiss, undo } = useDismiss();

  if (trending.isError) return <ErrorNotice error={trending.error} onRetry={() => trending.refetch()} />;

  const featured = trending.data?.results.find((i) => i.backdropPath);

  return (
    <>
      <h1 className="sr-only">Home</h1>
      <Hero item={featured} />

      <Row
        title="Trending this week"
        items={trending.data?.results.filter((i) => i !== featured).slice(0, SHELF_SIZE)}
        loading={trending.isPending}
      />

      {signedIn ? (
        <Row
          title="For you"
          items={recs.data?.items}
          loading={recs.isPending}
          reasons={recs.data?.reasons}
          onDismiss={dismiss}
          action={
            <p role="status" aria-live="polite" className="text-[15px] text-usher">
              {hidden && (
                <>
                  Hidden {hidden.title}.{" "}
                  <button
                    type="button"
                    onClick={undo}
                    className="inline-flex h-11 items-center px-1 font-medium text-paper underline decoration-tungsten underline-offset-4"
                  >
                    Undo
                  </button>
                </>
              )}
            </p>
          }
        >
          {recs.isSuccess && recs.data.items.length === 0 ? (
            <p className="max-w-xl text-usher">
              Bookmark or rate a few titles and your picks show up here, based on what you save and what
              people with similar taste save.
            </p>
          ) : undefined}
        </Row>
      ) : (
        <Row title="For you">
          <p className="max-w-xl text-usher">
            <Link href="/login" className="font-medium text-paper underline decoration-tungsten underline-offset-4">
              Log in
            </Link>{" "}
            and bookmark a few titles to get picks based on what you save.
          </p>
        </Row>
      )}

      <Row title="Movies people are watching" items={movies.data?.results.slice(0, SHELF_SIZE)} loading={movies.isPending} />
      <Row title="Series people are watching" items={series.data?.results.slice(0, SHELF_SIZE)} loading={series.isPending} />
    </>
  );
}

/**
 * "Not interested" on a For you pick: the card disappears at once, the server
 * records it (never shown again, a small push away from its genres), and the
 * last one can be undone.
 */
function useDismiss() {
  const qc = useQueryClient();
  const [hidden, setHidden] = useState<MediaItem | null>(null);
  const ref = (i: MediaItem) => `type=${i.mediaType}&tmdbId=${i.id}`;

  async function dismiss(item: MediaItem) {
    qc.setQueryData<Recommendations>(["recommendations"], (old) =>
      old ? { ...old, items: old.items.filter((i) => itemKey(i) !== itemKey(item)) } : old,
    );
    setHidden(item);
    try {
      await fetchJson("/api/recommendations/dismissed", {
        method: "POST",
        body: JSON.stringify({ type: item.mediaType, tmdbId: item.id }),
        keepalive: true,
      });
    } catch {
      setHidden(null);
      qc.invalidateQueries({ queryKey: ["recommendations"] }); // put it back
    }
  }

  async function undo() {
    if (!hidden) return;
    const item = hidden;
    setHidden(null);
    await fetchJson(`/api/recommendations/dismissed?${ref(item)}`, { method: "DELETE" }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["recommendations"] });
  }

  return { hidden, dismiss, undo };
}

/** The one bold element: the week's top title, lit like a screen in a dark room. */
function Hero({ item }: { item?: MediaItem }) {
  const bookmarks = useBookmarkKeys();
  // Same box as the loaded hero, so nothing below shifts when it arrives.
  if (!item) {
    return (
      <div aria-hidden className="relative -mx-4 mb-4 overflow-hidden md:mx-0 md:rounded-panel">
        <div className="aspect-[4/5] max-h-[640px] w-full bg-stall sm:aspect-[16/9] md:aspect-[21/9] md:min-h-[440px]" />
      </div>
    );
  }

  const backdrop = tmdbImage(item.backdropPath, "backdrop")!;
  const genres = item.genreIds.map(genreName).filter(Boolean).slice(0, 3);

  return (
    <section
      aria-label="Featured this week"
      className="relative -mx-4 mb-4 overflow-hidden md:mx-0 md:rounded-panel"
    >
      <div className="relative aspect-[4/5] max-h-[640px] w-full sm:aspect-[16/9] md:aspect-[21/9] md:min-h-[440px]">
        <Image
          src={backdrop}
          alt=""
          fill
          preload
          sizes="(min-width: 1440px) 1352px, 100vw"
          className="object-cover motion-safe:animate-lamp"
        />
        {/* Projector cone from above, then a fall-off into the velvet for legible type. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 55% 90% at 50% -20%, rgb(240 180 76 / 0.16), transparent 60%), linear-gradient(to top, #1b1726 4%, rgb(27 23 38 / 0.75) 38%, rgb(27 23 38 / 0.1) 75%)",
          }}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 md:p-10">
        {/* Long titles step down a size, so they never climb out of the image. */}
        <h2
          className={`display text-paper ${
            item.title.length > 22
              ? "max-w-[20ch] text-[44px] md:text-[64px] xl:text-[80px]"
              : "max-w-[14ch] text-[64px] md:text-[96px]"
          }`}
        >
          {item.title}
        </h2>
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-usher">
          {item.year && <span>{item.year}</span>}
          <span>{item.mediaType === "movie" ? "Movie" : "Series"}</span>
          {genres.map((g) => (
            <span key={g}>{g}</span>
          ))}
        </p>
        <p className="mt-3 line-clamp-3 max-w-[60ch] text-paper/90">{item.overview}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <BookmarkButton item={item} bookmarked={bookmarks.has(itemKey(item))} variant="solid" />
          <Link
            href={`/title/${item.mediaType}/${item.id}`}
            className="inline-flex h-11 items-center rounded-full border border-paper/25 px-5 text-[15px] font-semibold text-paper
                       transition-colors duration-150 hover:bg-paper/10"
          >
            View details
          </Link>
        </div>
      </div>
    </section>
  );
}
