import { z } from "zod";
import { clientKey, enforce, handle, mediaTypeSchema, queryOf } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { ensureTitle, titleToMediaItem } from "@/lib/catalog";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";
import { onSignal } from "@/lib/recs/profile";

const ref = z.object({ type: mediaTypeSchema, tmdbId: z.coerce.number().int().positive() });

/** The signed-in user's bookmarks, newest first. */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const rows = await db.bookmark.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { title: true },
  });
  return Response.json({
    items: rows.map((b) => ({ ...titleToMediaItem(b.title), bookmarkedAt: b.createdAt })),
  });
});

export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  enforce(limiters.write, clientKey(req, userId));
  const { type, tmdbId } = ref.parse(await req.json());
  const title = await ensureTitle(type, tmdbId);

  const bookmark = await db.bookmark.upsert({
    where: { userId_titleId: { userId, titleId: title.id } },
    create: { userId, titleId: title.id },
    update: {},
  });
  await onSignal(userId, { affectsCollaborative: true });
  return Response.json({ bookmarkedAt: bookmark.createdAt }, { status: 201 });
});

export const DELETE = handle(async (req: Request) => {
  const userId = await requireUserId();
  enforce(limiters.write, clientKey(req, userId));
  const { type, tmdbId } = ref.parse(queryOf(req));
  const title = await db.title.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: type } },
  });
  if (title) {
    await db.bookmark.deleteMany({ where: { userId, titleId: title.id } });
    await onSignal(userId, { affectsCollaborative: true });
  }
  return Response.json({ ok: true });
});
