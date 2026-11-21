export type MediaType = "movie" | "tv";

/** The single shape the UI works with, for movies and series alike. */
export interface MediaItem {
  id: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  year: number | null;
  releaseDate: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  genreIds: number[];
  rating: number;
  popularity: number;
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
}

export interface MediaDetail extends MediaItem {
  tagline: string | null;
  genres: { id: number; name: string }[];
  runtime: number | null;
  status: string | null;
  numberOfSeasons: number | null;
  seasons: SeasonSummary[];
  lastAirDate: string | null;
  nextEpisodeDate: string | null;
}

export interface Paged<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

// Raw TMDB response shapes (only the fields this app reads).
export interface TmdbListItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  popularity?: number;
}

export interface TmdbPaged {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbListItem[];
}

export interface TmdbDetail extends TmdbListItem {
  tagline?: string;
  genres?: { id: number; name: string }[];
  runtime?: number;
  episode_run_time?: number[];
  status?: string;
  number_of_seasons?: number;
  seasons?: { season_number: number; name: string; episode_count: number; air_date: string | null }[];
  last_air_date?: string | null;
  next_episode_to_air?: { air_date?: string | null } | null;
}
