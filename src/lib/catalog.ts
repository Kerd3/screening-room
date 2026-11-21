import "server-only";
import { db } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import { toMediaDetail, toPaged } from "@/lib/tmdb/normalize";
import type { MediaDetail, MediaItem, MediaType, Paged, TmdbDetail, TmdbPaged } from "@/lib/tmdb/types";

export type SortKey = "popular" | "top" | "newest";
export type TvStatus = "any" | "airing" | "ended";

export interface BrowseQuery {
  type: MediaType;
  page: number;
  genres: number[];
  sort: SortKey;
  yearFrom?: number;
  yearTo?: number;
  status?: TvStatus;
}

export async function getTrending(type: "all" | MediaType = "all", page = 1) {
  const raw = await tmdb.get<TmdbPaged>(`/trending/${type}/week`, { page });
  return toPaged(raw, type === "all" ? undefined : type);
}

/** Page-specific browsing for the Movies and TV pages, through /discover. */
export async function browse(q: BrowseQuery): Promise<Paged<MediaItem>> {
  const dateField = q.type === "movie" ? "primary_release_date" : "first_air_date";
  const today = new Date().toISOString().slice(0, 10);
  const params: Record<string, string | number | undefined> = {
    page: q.page,
    with_genres: q.genres.length ? q.genres.join("|") : undefined, // any of the selected
    [`${dateField}.gte`]: q.yearFrom ? `${q.yearFrom}-01-01` : undefined,
    [`${dateField}.lte`]: q.yearTo ? `${q.yearTo}-12-31` : undefined,
  };

  if (q.sort === "popular") params.sort_by = "popularity.desc";
  if (q.sort === "top") {
    params.sort_by = "vote_average.desc";
    params["vote_count.gte"] = 300; // keeps obscure 10/10s out of "top rated"
  }
  if (q.sort === "newest") {
    params.sort_by = `${dateField}.desc`;
    params[`${dateField}.lte`] = params[`${dateField}.lte`] ?? today; // released only
    params["vote_count.gte"] = 20;
  }
  if (q.type === "tv" && q.status === "airing") params.with_status = "0|2";
  if (q.type === "tv" && q.status === "ended") params.with_status = "3|4";

  const raw = await tmdb.get<TmdbPaged>(`/discover/${q.type}`, params);
  return toPaged(raw, q.type);
}

export async function search(query: string, type: "all" | MediaType, page = 1) {
  const path = type === "all" ? "/search/multi" : `/search/${type}`;
  const raw = await tmdb.get<TmdbPaged>(path, { query, page }, "search");
  return toPaged(raw, type === "all" ? undefined : type);
}

export async function getDetail(type: MediaType, id: number): Promise<MediaDetail> {
  const raw = await tmdb.get<TmdbDetail>(`/${type}/${id}`, {}, "detail");
  const detail = toMediaDetail(raw, type);
  await snapshotTitle(detail).catch(() => {}); // best effort
  return detail;
}

/** TMDB's own "recommendations" for a title (used for Similar titles). */
export async function getSimilar(type: MediaType, id: number) {
  const raw = await tmdb.get<TmdbPaged>(`/${type}/${id}/recommendations`, {}, "detail");
  return toPaged(raw, type).results;
}

/**
 * Upserts the local Title row for a TMDB item and returns its id. Bookmarks,
 * ratings, alerts and the recommender all reference this local id.
 */
export async function snapshotTitle(item: MediaItem | MediaDetail) {
  const d = item as Partial<MediaDetail>;
  const data = {
    title: item.title,
    overview: item.overview,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    releaseDate: item.releaseDate,
    genreIds: JSON.stringify(item.genreIds),
    voteAverage: item.rating,
    popularity: item.popularity,
    ...(d.numberOfSeasons !== undefined && { numberOfSeasons: d.numberOfSeasons }),
    ...(d.lastAirDate !== undefined && { lastAirDate: d.lastAirDate }),
    ...(d.status !== undefined && { status: d.status }),
  };
  const row = await db.title.upsert({
    where: { tmdbId_mediaType: { tmdbId: item.id, mediaType: item.mediaType } },
    create: { tmdbId: item.id, mediaType: item.mediaType, ...data },
    update: data,
  });
  return row.id;
}

/** Finds or creates the local Title for a TMDB id, fetching details if new. */
export async function ensureTitle(type: MediaType, tmdbId: number) {
  const existing = await db.title.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: type } },
  });
  if (existing) return existing;
  const detail = await getDetail(type, tmdbId);
  const id = await snapshotTitle(detail);
  return db.title.findUniqueOrThrow({ where: { id } });
}

type TitleRow = Awaited<ReturnType<typeof db.title.findUniqueOrThrow>>;

/** Converts a stored Title row back to the UI's MediaItem shape. */
export function titleToMediaItem(t: TitleRow): MediaItem {
  return {
    id: t.tmdbId,
    mediaType: t.mediaType as MediaType,
    title: t.title,
    overview: t.overview,
    year: t.releaseDate ? Number(t.releaseDate.slice(0, 4)) || null : null,
    releaseDate: t.releaseDate,
    posterPath: t.posterPath,
    backdropPath: t.backdropPath,
    genreIds: JSON.parse(t.genreIds) as number[],
    rating: t.voteAverage,
    popularity: t.popularity,
  };
}
