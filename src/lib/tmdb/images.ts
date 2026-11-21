export const TMDB_IMAGE_PREFIX = "https://image.tmdb.org/t/p/";

/** Builds an image URL the custom loader can resize; usable on server and client. */
export function tmdbImage(path: string | null, kind: "poster" | "backdrop"): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_PREFIX}${kind === "poster" ? "w780" : "w1280"}${path}`;
}
