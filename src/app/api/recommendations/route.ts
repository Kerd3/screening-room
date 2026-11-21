import { z } from "zod";
import { handle, queryOf } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { getRecommendations } from "@/lib/recs/recommend";

const query = z.object({ limit: z.coerce.number().int().min(1).max(40).default(20) });

export const GET = handle(async (req: Request) => {
  const userId = await requireUserId();
  const { limit } = query.parse(queryOf(req));
  return Response.json(await getRecommendations(userId, limit));
});
