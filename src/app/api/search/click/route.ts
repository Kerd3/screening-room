import { z } from "zod";
import { handle, mediaTypeSchema } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { ensureTitle } from "@/lib/catalog";
import { db } from "@/lib/db";
import { onSignal } from "@/lib/recs/profile";

const body = z.object({
  historyId: z.number().int().positive(),
  type: mediaTypeSchema,
  tmdbId: z.number().int().positive(),
});

/** Records which result a search led to. */
export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  const { historyId, type, tmdbId } = body.parse(await req.json());
  const title = await ensureTitle(type, tmdbId);
  // updateMany scoped to the user, so nobody can edit another user's history.
  const { count } = await db.searchHistory.updateMany({
    where: { id: historyId, userId, clickedTitleId: null },
    data: { clickedTitleId: title.id },
  });
  if (count) await onSignal(userId);
  return Response.json({ ok: true });
});
