import { z } from "zod";
import { clientKey, enforce, handle, mediaTypeSchema, queryOf } from "@/lib/api";
import { getUserId, requireUserId } from "@/lib/auth";
import { ensureTitle } from "@/lib/catalog";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";
import { onSignal } from "@/lib/recs/profile";

const ref = z.object({ type: mediaTypeSchema, tmdbId: z.coerce.number().int().positive() });
const body = ref.extend({
  score: z.number().int().min(1).max(10),
  review: z.string().trim().max(2000).optional().transform((r) => r || null),
});

/** Ratings and reviews for one title, plus the signed-in user's own rating. */
export const GET = handle(async (req: Request) => {
  const { type, tmdbId } = ref.parse(queryOf(req));
  const userId = await getUserId();
  const title = await db.title.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: type } },
  });
  if (!title) return Response.json({ mine: null, average: null, count: 0, reviews: [] });

  const [agg, reviews, mine] = await Promise.all([
    db.rating.aggregate({ where: { titleId: title.id }, _avg: { score: true }, _count: true }),
    db.rating.findMany({
      where: { titleId: title.id, review: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } } },
    }),
    userId ? db.rating.findUnique({ where: { userId_titleId: { userId, titleId: title.id } } }) : null,
  ]);

  return Response.json({
    mine: mine && { score: mine.score, review: mine.review },
    average: agg._avg.score,
    count: agg._count,
    reviews: reviews.map((r) => ({
      id: r.id,
      name: r.user.name,
      score: r.score,
      review: r.review,
      updatedAt: r.updatedAt,
      mine: r.userId === userId,
    })),
  });
});

export const PUT = handle(async (req: Request) => {
  const userId = await requireUserId();
  enforce(limiters.write, clientKey(req, userId));
  const { type, tmdbId, score, review } = body.parse(await req.json());
  const title = await ensureTitle(type, tmdbId);
  await db.rating.upsert({
    where: { userId_titleId: { userId, titleId: title.id } },
    create: { userId, titleId: title.id, score, review },
    update: { score, review },
  });
  await onSignal(userId, { affectsCollaborative: true });
  return Response.json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  const userId = await requireUserId();
  const { type, tmdbId } = ref.parse(queryOf(req));
  const title = await db.title.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: type } },
  });
  if (title) {
    await db.rating.deleteMany({ where: { userId, titleId: title.id } });
    await onSignal(userId, { affectsCollaborative: true });
  }
  return Response.json({ ok: true });
});
