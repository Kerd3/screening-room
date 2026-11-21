import { z } from "zod";
import { clientKey, enforce, handle, HttpError, mediaTypeSchema } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { ensureTitle, titleToMediaItem } from "@/lib/catalog";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";
import { areFriends } from "@/lib/social";

/** Titles friends have shared with you, newest first. */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const rows = await db.share.findMany({
    where: { toUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { title: true, from: { select: { name: true } } },
  });
  return Response.json({
    shares: rows.map((s) => ({
      id: s.id,
      from: s.from.name,
      note: s.note,
      createdAt: s.createdAt,
      unseen: !s.seenAt,
      item: titleToMediaItem(s.title),
    })),
  });
});

export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  await enforce(limiters.write, clientKey(req, userId));
  const { toUserId, type, tmdbId, note } = z
    .object({
      toUserId: z.string().min(1),
      type: mediaTypeSchema,
      tmdbId: z.number().int().positive(),
      note: z.string().trim().max(500).optional(),
    })
    .parse(await req.json());

  if (!(await areFriends(userId, toUserId))) {
    throw new HttpError(403, "You can only share with friends.");
  }
  const title = await ensureTitle(type, tmdbId);
  await db.share.create({ data: { fromUserId: userId, toUserId, titleId: title.id, note: note || null } });
  return Response.json({ ok: true }, { status: 201 });
});
