import "server-only";
import { db } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import { toMediaDetail } from "@/lib/tmdb/normalize";
import type { TmdbDetail } from "@/lib/tmdb/types";

export interface SnapshotState {
  seasonCount: number;
  nextEpisodeDate: string | null;
}

/** Decides which alert, if any, a change in a series' airing state warrants. */
export function diffSnapshot(
  title: string,
  prev: SnapshotState,
  next: SnapshotState,
): { kind: "NEW_SEASON" | "NEW_EPISODE_DATE"; message: string } | null {
  if (next.seasonCount > prev.seasonCount) {
    return { kind: "NEW_SEASON", message: `${title} season ${next.seasonCount} is now listed.` };
  }
  if (next.nextEpisodeDate && next.nextEpisodeDate !== prev.nextEpisodeDate) {
    const when = new Date(next.nextEpisodeDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return { kind: "NEW_EPISODE_DATE", message: `${title} has a new episode airing ${when}.` };
  }
  return null;
}

/**
 * Checks bookmarked series against their last known state and creates alerts
 * for every user who bookmarked a changed show. Requests go through the
 * cached, rate-limited client (6h TTL), so running it often is cheap.
 * Pass userId to check only that user's bookmarks.
 */
export async function checkSeasons({ userId, concurrency = 4 }: { userId?: string; concurrency?: number } = {}) {
  const titles = await db.title.findMany({
    where: { mediaType: "tv", bookmarks: { some: userId ? { userId } : {} } },
    include: { tvSnapshot: true },
  });

  let created = 0;
  let checked = 0;
  const queue = [...titles];
  async function worker() {
    for (let t = queue.shift(); t; t = queue.shift()) {
      try {
        const raw = await tmdb.get<TmdbDetail>(`/tv/${t.tmdbId}`, {}, "tvStatus");
        const d = toMediaDetail(raw, "tv");
        const next = { seasonCount: d.numberOfSeasons ?? 0, nextEpisodeDate: d.nextEpisodeDate };
        checked++;

        if (t.tvSnapshot) {
          const change = diffSnapshot(t.title, t.tvSnapshot, next);
          if (change) created += await notifyBookmarkers(t.id, change);
        }
        await db.tvSnapshot.upsert({
          where: { titleId: t.id },
          create: { titleId: t.id, ...next, lastAirDate: d.lastAirDate },
          update: { ...next, lastAirDate: d.lastAirDate, checkedAt: new Date() },
        });
        await db.title.update({
          where: { id: t.id },
          data: { numberOfSeasons: d.numberOfSeasons, lastAirDate: d.lastAirDate, status: d.status },
        });
      } catch (e) {
        console.error(`season check failed for ${t.title}`, e);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (userId) await db.user.update({ where: { id: userId }, data: { alertsCheckedAt: new Date() } });
  return { checked, alertsCreated: created };
}

async function notifyBookmarkers(titleId: number, change: { kind: string; message: string }) {
  const users = await db.bookmark.findMany({
    where: { titleId, user: { OR: [{ preference: null }, { preference: { alertsEnabled: true } }] } },
    select: { userId: true },
  });
  let n = 0;
  for (const { userId } of users) {
    const dupe = await db.alert.findFirst({ where: { userId, titleId, message: change.message } });
    if (dupe) continue;
    await db.alert.create({ data: { userId, titleId, kind: change.kind, message: change.message } });
    n++;
  }
  return n;
}
