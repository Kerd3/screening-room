import { z } from "zod";
import { clientKey, enforce, handle, mediaTypeSchema, queryOf } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { ensureTitle } from "@/lib/catalog";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";
import { onSignal } from "@/lib/recs/profile";

const ref = z.object({ type: mediaTypeSchema, tmdbId: z.coerce.number().int().positive() });

/** "Not interested": hides a pick for good and counts against its genres. */
export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  await enforce(limiters.write, clientKey(req, userId));
  const { type, tmdbId } = ref.parse(await req.json());
  const title = await ensureTitle(type, tmdbId);
  await db.dismissal.upsert({
    where: { userId_titleId: { userId, titleId: title.id } },
    create: { userId, titleId: title.id },
    update: {},
  });
  await onSignal(userId);
  return Response.json({ ok: true }, { status: 201 });
});

/** Undo. */
export const DELETE = handle(async (req: Request) => {
  const userId = await requireUserId();
  await enforce(limiters.write, clientKey(req, userId));
  const { type, tmdbId } = ref.parse(queryOf(req));
  const title = await db.title.findUnique({ where: { tmdbId_mediaType: { tmdbId, mediaType: type } } });
  if (title) {
    await db.dismissal.deleteMany({ where: { userId, titleId: title.id } });
    await onSignal(userId);
  }
  return Response.json({ ok: true });
});
