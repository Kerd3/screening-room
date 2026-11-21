import { z } from "zod";
import { clientKey, enforce, handle, mediaTypeSchema } from "@/lib/api";
import { getDetail, getSimilar } from "@/lib/catalog";
import { limiters } from "@/lib/ratelimit-inbound";

const params = z.object({ type: mediaTypeSchema, id: z.coerce.number().int().positive() });

export const GET = handle(async (req: Request, ctx: RouteContext<"/api/titles/[type]/[id]">) => {
  enforce(limiters.browse, clientKey(req));
  const { type, id } = params.parse(await ctx.params);
  const [detail, similar] = await Promise.all([
    getDetail(type, id),
    getSimilar(type, id).catch(() => []),
  ]);
  return Response.json({ detail, similar: similar.slice(0, 12) });
});
