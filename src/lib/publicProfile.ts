import "server-only";
import { randomBytes } from "node:crypto";
import { titleToMediaItem } from "@/lib/catalog";
import { db } from "@/lib/db";
import { genreName } from "@/lib/tmdb/genres";
import type { MediaItem } from "@/lib/tmdb/types";

/** "Riley Demo" -> "riley-demo-x7k2": readable, and the suffix keeps it unguessable and unique. */
export function makeHandle(name: string) {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "viewer";
  return `${base}-${randomBytes(3).toString("hex").slice(0, 4)}`;
}

export const HANDLE_PATTERN = /^[a-z0-9-]{3,40}$/;

/** Gives the user a handle the first time their profile goes public. */
export async function ensureHandle(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { handle: true, name: true } });
  if (user.handle) return user.handle;
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = makeHandle(user.name);
    try {
      await db.user.update({ where: { id: userId }, data: { handle } });
      return handle;
    } catch {
      // Unique clash on the handle: try another suffix.
    }
  }
  throw new Error("Couldn't create a profile address.");
}

export interface PublicProfile {
  name: string;
  handle: string;
  memberSince: string;
  counts: { watched: number; rated: number; bookmarked: number };
  topGenres: string[];
  favorites: (MediaItem & { score: number })[];
  recent: (MediaItem & { watchedAt: string })[];
}

/** A public profile, or null when the handle is unknown or the profile is private. */
export async function loadPublicProfile(handle: string): Promise<PublicProfile | null> {
  if (!HANDLE_PATTERN.test(handle)) return null;
  const user = await db.user.findUnique({
    where: { handle },
    select: { id: true, name: true, createdAt: true, preference: { select: { profilePublic: true } } },
  });
  if (!user?.preference?.profilePublic) return null;
  const userId = user.id;

  const [favorites, recent, affinity, watched, rated, bookmarked] = await Promise.all([
    db.rating.findMany({
      where: { userId, score: { gte: 8 } },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      take: 12,
      include: { title: true },
    }),
    db.watched.findMany({ where: { userId }, orderBy: { watchedAt: "desc" }, take: 12, include: { title: true } }),
    db.genreAffinity.findMany({ where: { userId, score: { gt: 0 } }, orderBy: { score: "desc" }, take: 3 }),
    db.watched.count({ where: { userId } }),
    db.rating.count({ where: { userId } }),
    db.bookmark.count({ where: { userId } }),
  ]);

  return {
    name: user.name,
    handle,
    memberSince: user.createdAt.toISOString(),
    counts: { watched, rated, bookmarked },
    topGenres: affinity.map((a) => genreName(a.genreId)).filter((g): g is string => Boolean(g)),
    favorites: favorites.map((r) => ({ ...titleToMediaItem(r.title), score: r.score })),
    recent: recent.map((w) => ({ ...titleToMediaItem(w.title), watchedAt: w.watchedAt.toISOString() })),
  };
}
