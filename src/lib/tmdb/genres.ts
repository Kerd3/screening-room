import type { MediaType } from "./types";

// TMDB genre ids are stable, so they ship with the app. Filter chips and
// recommendation scoring then need no API call.
export const MOVIE_GENRES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

export const TV_GENRES: Record<number, string> = {
  10759: "Action & Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10768: "War & Politics",
  37: "Western",
};

export function genresFor(type: MediaType) {
  const map = type === "movie" ? MOVIE_GENRES : TV_GENRES;
  return Object.entries(map).map(([id, name]) => ({ id: Number(id), name }));
}

export function genreName(id: number): string | undefined {
  return MOVIE_GENRES[id] ?? TV_GENRES[id];
}

// TV uses a few combined genres. Expand them to movie genres so one
// preference profile covers both media types.
const CANONICAL: Record<number, number[]> = {
  10759: [28, 12],
  10765: [878, 14],
  10768: [10752],
  10762: [10751],
};

export function canonicalGenres(ids: number[]): number[] {
  const out = new Set<number>();
  for (const id of ids) for (const g of CANONICAL[id] ?? [id]) out.add(g);
  return [...out];
}
