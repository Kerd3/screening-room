import "server-only";
import { tmdb } from "@/lib/tmdb";
import { toMediaDetail } from "@/lib/tmdb/normalize";
import type { MediaDetail, MediaType, TmdbDetail } from "@/lib/tmdb/types";

/**
 * Title details for metadata and preview images. Goes through the cached,
 * rate-limited TMDB client but, unlike getDetail(), never writes to the
 * database (crawlers shouldn't create catalog rows). Returns null for an
 * unknown title or when TMDB isn't configured.
 */
export async function getTitleForMeta(type: string, id: string): Promise<MediaDetail | null> {
  const tmdbId = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  try {
    const raw = await tmdb.get<TmdbDetail>(`/${type}/${tmdbId}`, {}, "detail");
    return toMediaDetail(raw, type as MediaType);
  } catch {
    return null;
  }
}

/** A one-sentence description that fits preview cards (about 160 characters). */
export function shortOverview(text: string, max = 160) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
