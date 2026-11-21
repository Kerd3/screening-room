import { handle, HttpError } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { titleToMediaItem } from "@/lib/catalog";
import { db } from "@/lib/db";
import { areFriends } from "@/lib/social";

/** A friend's bookmarks, if they've left their list visible to friends. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/friends/[id]/bookmarks">) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  if (!(await areFriends(userId, id))) throw new HttpError(404, "Not found.");

  const pref = await db.userPreference.findUnique({ where: { userId: id } });
  if (pref && !pref.bookmarksPublic) {
    throw new HttpError(403, "This friend keeps their bookmarks private.");
  }
  const rows = await db.bookmark.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { title: true },
  });
  return Response.json({ items: rows.map((b) => titleToMediaItem(b.title)) });
});
