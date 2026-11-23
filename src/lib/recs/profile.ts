import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { maybeRebuildSimilarity } from "./collaborative";
import { computeAffinity, type Signal } from "./signals";

const parseGenres = (s: string) => JSON.parse(s) as number[];

/** Loads every signal for a user (the last 500 searches at most). */
export async function loadSignals(userId: string): Promise<Signal[]> {
  const [bookmarks, watched, ratings, searches] = await Promise.all([
    db.bookmark.findMany({ where: { userId }, include: { title: { select: { genreIds: true } } } }),
    db.watched.findMany({ where: { userId }, include: { title: { select: { genreIds: true } } } }),
    db.rating.findMany({ where: { userId }, include: { title: { select: { genreIds: true } } } }),
    db.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { clickedTitle: { select: { genreIds: true } } },
    }),
  ]);
  return [
    ...bookmarks.map((b): Signal => ({ kind: "bookmark", at: b.createdAt, genreIds: parseGenres(b.title.genreIds) })),
    ...watched.map((w): Signal => ({ kind: "watched", at: w.watchedAt, genreIds: parseGenres(w.title.genreIds) })),
    ...ratings.map((r): Signal => ({
      kind: "rating",
      at: r.updatedAt,
      score: r.score,
      genreIds: parseGenres(r.title.genreIds),
    })),
    ...searches.flatMap((s): Signal[] => [
      { kind: "searchQuery", at: s.createdAt, query: s.query },
      ...(s.clickedTitle
        ? [{ kind: "searchClick", at: s.createdAt, genreIds: parseGenres(s.clickedTitle.genreIds) } as Signal]
        : []),
    ]),
  ];
}

/** Recomputes a user's GenreAffinity rows from their signals. */
export async function rebuildAffinity(userId: string) {
  const affinity = computeAffinity(await loadSignals(userId));
  await db.$transaction([
    db.genreAffinity.deleteMany({ where: { userId } }),
    db.genreAffinity.createMany({
      data: [...affinity].map(([genreId, score]) => ({ userId, genreId, score })),
    }),
  ]);
  return affinity;
}

/**
 * Call after any new signal, from a route handler. Both rebuilds run after the
 * response is sent (which also works on serverless), so saving a bookmark or
 * rating doesn't wait on them. Recommendations rebuild the profile on demand
 * anyway, so nothing is ever shown from a stale profile.
 */
export async function onSignal(userId: string, opts: { affectsCollaborative?: boolean } = {}) {
  after(async () => {
    await rebuildAffinity(userId).catch((e) => console.error("affinity rebuild failed", e));
    if (opts.affectsCollaborative) await maybeRebuildSimilarity();
  });
}
