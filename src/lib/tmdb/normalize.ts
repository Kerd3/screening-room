import type {
  MediaDetail,
  MediaItem,
  MediaType,
  Paged,
  TmdbDetail,
  TmdbListItem,
  TmdbPaged,
  TmdbWatchProviders,
  WatchOptions,
} from "./types";

function yearOf(date?: string | null): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

export function toMediaItem(raw: TmdbListItem, fallbackType?: MediaType): MediaItem | null {
  const type = (raw.media_type ?? fallbackType) as MediaType | undefined;
  if (type !== "movie" && type !== "tv") return null; // drops "person" results
  const releaseDate = (type === "movie" ? raw.release_date : raw.first_air_date) || null;
  return {
    id: raw.id,
    mediaType: type,
    title: (type === "movie" ? raw.title : raw.name) ?? raw.title ?? raw.name ?? "Untitled",
    overview: raw.overview ?? "",
    year: yearOf(releaseDate),
    releaseDate,
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    genreIds: raw.genre_ids ?? [],
    rating: Math.round((raw.vote_average ?? 0) * 10) / 10,
    popularity: raw.popularity ?? 0,
  };
}

export function toPaged(raw: TmdbPaged, fallbackType?: MediaType): Paged<MediaItem> {
  return {
    page: raw.page,
    // TMDB refuses pages past 500.
    totalPages: Math.min(raw.total_pages, 500),
    totalResults: raw.total_results,
    results: raw.results
      .map((r) => toMediaItem(r, fallbackType))
      .filter((r): r is MediaItem => r !== null),
  };
}

/**
 * Picks one country's options from TMDB's watch-provider data. "Stream"
 * merges subscription, free and ad-supported services. Each group is ordered
 * by TMDB's display priority and has no duplicates.
 */
export function toWatchOptions(raw: TmdbWatchProviders, region: string): WatchOptions {
  const regions = Object.keys(raw.results ?? {}).sort();
  const r = raw.results?.[region];
  const group = (...lists: (TmdbWatchProviders["results"][string]["flatrate"] | undefined)[]) => {
    const seen = new Set<number>();
    return lists
      .flatMap((l) => l ?? [])
      .sort((a, b) => a.display_priority - b.display_priority)
      .filter((p) => !seen.has(p.provider_id) && (seen.add(p.provider_id), true))
      .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path }));
  };
  return {
    region,
    regions,
    link: r?.link ?? null,
    stream: group(r?.flatrate, r?.free, r?.ads),
    rent: group(r?.rent),
    buy: group(r?.buy),
  };
}

export function toMediaDetail(raw: TmdbDetail, type: MediaType): MediaDetail {
  const base = toMediaItem({ ...raw, media_type: type }, type)!;
  const genres = raw.genres ?? [];
  return {
    ...base,
    genreIds: genres.map((g) => g.id),
    genres,
    tagline: raw.tagline || null,
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
    status: raw.status ?? null,
    numberOfSeasons: raw.number_of_seasons ?? null,
    seasons: (raw.seasons ?? [])
      .filter((s) => s.season_number > 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count,
        airDate: s.air_date,
      })),
    lastAirDate: raw.last_air_date ?? null,
    nextEpisodeDate: raw.next_episode_to_air?.air_date ?? null,
  };
}
