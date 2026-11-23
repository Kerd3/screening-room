import "server-only";
import { snapshotTitle } from "@/lib/catalog";
import { db } from "@/lib/db";
import type { ImportKind, ImportRow, ImportSource } from "@/lib/importCsv";
import { onSignal } from "@/lib/recs/profile";
import { tmdb } from "@/lib/tmdb";
import { toMediaItem } from "@/lib/tmdb/normalize";
import type { MediaItem, MediaType, TmdbListItem, TmdbPaged } from "@/lib/tmdb/types";

interface TmdbFind {
  movie_results?: TmdbListItem[];
  tv_results?: TmdbListItem[];
}

/** Lookups run a few at a time; the TMDB client's rate limiter does the rest. */
const CONCURRENCY = 6;

/**
 * Finds the TMDB title for an imported row. IMDb ids match exactly; Letterboxd
 * rows are matched by title and release year (falling back to a year either
 * side, since the two sites sometimes disagree about release dates).
 */
export async function matchRow(row: ImportRow): Promise<MediaItem | null> {
  if (row.imdbId) {
    const found = await tmdb.get<TmdbFind>(`/find/${row.imdbId}`, { external_source: "imdb_id" }, "detail");
    const movie = found.movie_results?.[0] && toMediaItem(found.movie_results[0], "movie");
    const tv = found.tv_results?.[0] && toMediaItem(found.tv_results[0], "tv");
    return (row.mediaType === "tv" ? tv || movie : movie || tv) || null;
  }

  const type: MediaType = row.mediaType ?? "movie";
  const yearParam = type === "movie" ? "primary_release_year" : "first_air_date_year";
  const search = (params: Record<string, string | number | undefined>) =>
    tmdb
      .get<TmdbPaged>(`/search/${type}`, { query: row.title, ...params }, "search")
      .then((r) => r.results.map((x) => toMediaItem(x, type)).filter((x): x is MediaItem => x !== null));

  if (row.year) {
    const exact = await search({ [yearParam]: row.year });
    if (exact[0]) return exact[0];
    const near = (await search({})).find((x) => x.year !== null && Math.abs(x.year - row.year!) <= 1);
    return near ?? null;
  }
  return (await search({}))[0] ?? null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const dateOf = (iso?: string) => {
  const d = iso ? new Date(`${iso}T12:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) && d <= new Date() ? d : undefined;
};

export interface ImportResult {
  imported: number;
  unmatched: string[];
}

/**
 * Imports one batch of rows for a user.
 *   watched   -> watch history
 *   watchlist -> bookmarks
 *   ratings   -> ratings and watch history
 * Existing entries are kept as they are: an import never overwrites a rating
 * or review made in the app.
 */
export async function importRows(
  userId: string,
  source: ImportSource,
  kind: ImportKind,
  rows: ImportRow[],
): Promise<ImportResult> {
  const matches = await mapPool(rows, CONCURRENCY, (row) => matchRow(row).catch(() => null));

  const unmatched: string[] = [];
  const byTitle = new Map<string, { item: MediaItem; row: ImportRow }>();
  matches.forEach((item, i) => {
    const row = rows[i];
    if (!item) unmatched.push(row.year ? `${row.title} (${row.year})` : row.title);
    // The same film can appear twice (a diary rewatch); keep the first row.
    else if (!byTitle.has(`${item.mediaType}:${item.id}`)) byTitle.set(`${item.mediaType}:${item.id}`, { item, row });
  });

  await mapPool([...byTitle.values()], CONCURRENCY, async ({ item, row }) => {
    const titleId = await snapshotTitle(item);
    const at = dateOf(row.date);
    if (kind === "watchlist") {
      await db.bookmark.upsert({
        where: { userId_titleId: { userId, titleId } },
        create: { userId, titleId, ...(at && { createdAt: at }) },
        update: {},
      });
      return;
    }
    await db.watched.upsert({
      where: { userId_titleId: { userId, titleId } },
      create: { userId, titleId, source, ...(at && { watchedAt: at }) },
      update: {},
    });
    if (kind === "ratings" && row.rating) {
      await db.rating.upsert({
        where: { userId_titleId: { userId, titleId } },
        create: { userId, titleId, score: row.rating },
        update: {},
      });
    }
  });

  if (byTitle.size) await onSignal(userId, { affectsCollaborative: kind !== "watched" });
  return { imported: byTitle.size, unmatched };
}
