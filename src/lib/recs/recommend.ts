import "server-only";
import { getSimilar, titleToMediaItem } from "@/lib/catalog";
import { db } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import { canonicalGenres, genreName } from "@/lib/tmdb/genres";
import { toPaged } from "@/lib/tmdb/normalize";
import type { MediaItem, MediaType, TmdbPaged } from "@/lib/tmdb/types";
import { scoreForUser } from "./collaborative";
import { blend, diversify, genreMatch, normalize, varyReasons, weightsFor, type Candidate } from "./hybrid";
import { rebuildAffinity } from "./profile";
import { topGenres } from "./signals";

const key = (i: { mediaType: string; id: number }) => `${i.mediaType}:${i.id}`;

/** TMDB average below which a title isn't recommended (0 = unrated, allowed). */
export const MIN_RECOMMENDED_RATING = 5.5;

export async function getRecommendations(userId: string, limit = 20) {
  const [bookmarks, ratings, watched, dismissed, pref] = await Promise.all([
    db.bookmark.findMany({ where: { userId }, include: { title: true }, orderBy: { createdAt: "desc" } }),
    db.rating.findMany({ where: { userId }, include: { title: true }, orderBy: { updatedAt: "desc" } }),
    db.watched.findMany({ where: { userId }, include: { title: true }, orderBy: { watchedAt: "desc" } }),
    db.dismissal.findMany({ where: { userId }, select: { title: { select: { tmdbId: true, mediaType: true } } } }),
    db.userPreference.findUnique({ where: { userId }, select: { preferredMediaType: true } }),
  ]);
  const signalCount = bookmarks.length + ratings.length + watched.length;
  if (signalCount === 0) return { items: [], reasons: {}, strategy: "popular" as const };

  // "Show me" in Settings: movies, series, or both.
  const onlyType: MediaType | null =
    pref?.preferredMediaType === "movie" || pref?.preferredMediaType === "tv" ? pref.preferredMediaType : null;

  // Everything already saved, watched or rated is excluded (rated means watched),
  // and so is anything marked "Not interested".
  const seen = new Set([
    ...[...bookmarks, ...ratings, ...watched].map((r) => key(titleToMediaItem(r.title))),
    ...dismissed.map((d) => key({ mediaType: d.title.mediaType, id: d.title.tmdbId })),
  ]);

  const affinity = await rebuildAffinity(userId);
  const candidates = new Map<string, Candidate>();
  const upsert = (item: MediaItem, patch: Partial<Candidate>) => {
    const k = key(item);
    if (seen.has(k) || (onlyType && item.mediaType !== onlyType)) return;
    // Quality floor: don't recommend titles audiences rated poorly. Unrated
    // (rating 0, usually brand-new) titles are allowed through.
    if (item.rating > 0 && item.rating < MIN_RECOMMENDED_RATING) return;
    const c = candidates.get(k) ?? { key: k, item, cf: 0, content: 0 };
    candidates.set(k, { ...c, ...patch, cf: Math.max(c.cf, patch.cf ?? 0), content: Math.max(c.content, patch.content ?? 0) });
  };

  // 1. Collaborative: neighbors of everything the user likes.
  const userItems = new Map<number, number>();
  for (const b of bookmarks) userItems.set(b.titleId, 1);
  for (const r of ratings) if (r.score >= 6) userItems.set(r.titleId, Math.max(userItems.get(r.titleId) ?? 0, r.score / 10));
  const ids = [...userItems.keys()];
  const neighbors = ids.length
    ? await db.itemSimilarity.findMany({
        where: { OR: [{ titleAId: { in: ids } }, { titleBId: { in: ids } }] },
      })
    : [];
  const cfScores = scoreForUser(userItems, neighbors);
  if (cfScores.size) {
    const titles = await db.title.findMany({ where: { id: { in: [...cfScores.keys(), ...ids] } } });
    const byId = new Map(titles.map((t) => [t.id, t]));
    const norm = normalize([...cfScores.values()].map((s) => s.score));
    for (const [titleId, s] of cfScores) {
      const t = byId.get(titleId);
      if (!t) continue;
      const because = byId.get(s.because);
      upsert(titleToMediaItem(t), {
        cf: norm(s.score),
        cfReason: because ? `Popular with people who saved ${because.title}` : undefined,
      });
    }
  }

  // 2. Content-based: TMDB's related titles for recent favorites, plus a
  //    discover query on the user's top genres. All of it goes through the cached client.
  const seeds = [
    ...ratings.filter((r) => r.score >= 8).map((r) => ({ t: r.title, why: `Because you rated ${r.title.title} ${r.score}/10` })),
    ...bookmarks.map((b) => ({ t: b.title, why: `Because you bookmarked ${b.title.title}` })),
    ...watched.map((w) => ({ t: w.title, why: `Because you watched ${w.title.title}` })),
  ].slice(0, 5);
  const top = topGenres(affinity, 3);

  const seedResults = await Promise.all(
    seeds.map((s) => getSimilar(s.t.mediaType as MediaType, s.t.tmdbId).then((items) => ({ s, items })).catch(() => null)),
  );
  for (const r of seedResults) {
    if (!r) continue;
    r.items.slice(0, 12).forEach((item, rank) => {
      const relatedness = 1 - rank / 15; // TMDB's own ordering is a useful prior
      upsert(item, { content: 0.5 * relatedness + 0.5 * genreMatch(item.genreIds, affinity), contentReason: r.s.why });
    });
  }

  if (top.length) {
    const discovered = await Promise.all(
      (onlyType ? [onlyType] : (["movie", "tv"] as const)).map((type) =>
        tmdb
          .get<TmdbPaged>(`/discover/${type}`, { with_genres: top.join("|"), sort_by: "popularity.desc", "vote_count.gte": 200 })
          .then((raw) => toPaged(raw, type).results)
          .catch(() => [] as MediaItem[]),
      ),
    );
    const label = genreName(top[0]);
    for (const item of discovered.flat()) {
      upsert(item, { content: 0.8 * genreMatch(item.genreIds, affinity), contentReason: label ? `You like ${label}` : undefined });
    }
  }

  const weights = weightsFor(signalCount, cfScores.size > 0);
  const diversified = diversify(blend([...candidates.values()], weights), limit);

  // Vary the labels: a pick whose reason is already used twice shows its other
  // true reason, or the user's strongest genre it matches.
  const ranked = varyReasons(diversified, (r) => {
    const c = candidates.get(key(r.item));
    const other = r.reason === c?.cfReason ? c?.contentReason : c?.cfReason;
    if (other) return other;
    const genre = canonicalGenres(r.item.genreIds)
      .filter((g) => (affinity.get(g) ?? 0) > 0)
      .sort((a, b) => (affinity.get(b) ?? 0) - (affinity.get(a) ?? 0))[0];
    const name = genre !== undefined ? genreName(genre) : undefined;
    return name ? `You like ${name}` : undefined;
  });
  return {
    items: ranked.map((r) => r.item),
    reasons: Object.fromEntries(ranked.map((r) => [key(r.item), r.reason])),
    strategy: signalCount < 5 ? ("cold-start" as const) : ("hybrid" as const),
  };
}

/** "People who bookmarked this also bookmarked", from the similarity table. */
export async function bookmarkedTogether(type: MediaType, tmdbId: number, limit = 12) {
  const title = await db.title.findUnique({ where: { tmdbId_mediaType: { tmdbId, mediaType: type } } });
  if (!title) return [];
  const rows = await db.itemSimilarity.findMany({
    where: { OR: [{ titleAId: title.id }, { titleBId: title.id }] },
    orderBy: { score: "desc" },
    take: limit,
    include: { titleA: true, titleB: true },
  });
  return rows.map((r) => ({
    ...titleToMediaItem(r.titleAId === title.id ? r.titleB : r.titleA),
    sharedBy: r.coCount,
  }));
}
