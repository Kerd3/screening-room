export const TMDB_IMAGE_PREFIX = "https://image.tmdb.org/t/p/";

/** Builds an image URL the custom loader can resize; usable on server and client. */
export function tmdbImage(path: string | null, kind: "poster" | "backdrop" | "logo"): string | null {
  if (!path) return null;
  // Logos use the poster size buckets; the loader picks w92 for small icons.
  return `${TMDB_IMAGE_PREFIX}${kind === "backdrop" ? "w1280" : "w780"}${path}`;
}
