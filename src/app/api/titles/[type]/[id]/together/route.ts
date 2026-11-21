import { z } from "zod";
import { handle, mediaTypeSchema } from "@/lib/api";
import { bookmarkedTogether } from "@/lib/recs/recommend";

const params = z.object({ type: mediaTypeSchema, id: z.coerce.number().int().positive() });

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/titles/[type]/[id]/together">) => {
  const { type, id } = params.parse(await ctx.params);
  return Response.json({ items: await bookmarkedTogether(type, id) });
});
