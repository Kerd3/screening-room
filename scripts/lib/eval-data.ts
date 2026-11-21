/** Loads bookmarks, ratings and the catalog in the shape the evaluation needs. */
import { titleToMediaItem } from "@/lib/catalog";
import { db } from "@/lib/db";
import type { CatalogEntry, Interaction } from "@/lib/recs/evaluate";

export async function loadEvalData(): Promise<{ interactions: Interaction[]; catalog: CatalogEntry[] }> {
  const [bookmarks, ratings, titles] = await Promise.all([
    db.bookmark.findMany({ select: { userId: true, titleId: true, createdAt: true } }),
    db.rating.findMany({ select: { userId: true, titleId: true, score: true, updatedAt: true } }),
    db.title.findMany(),
  ]);
  return {
    interactions: [
      ...bookmarks.map((b) => ({ userId: b.userId, titleId: b.titleId, kind: "bookmark" as const, at: b.createdAt })),
      ...ratings.map((r) => ({
        userId: r.userId,
        titleId: r.titleId,
        kind: "rating" as const,
        score: r.score,
        at: r.updatedAt,
      })),
    ],
    catalog: titles.map((t) => ({ titleId: t.id, item: titleToMediaItem(t) })),
  };
}
