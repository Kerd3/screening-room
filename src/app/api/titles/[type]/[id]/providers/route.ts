import { z } from "zod";
import { clientKey, enforce, handle, mediaTypeSchema, queryOf } from "@/lib/api";
import { getWatchOptions } from "@/lib/catalog";
import { limiters } from "@/lib/ratelimit-inbound";
import { detectRegion } from "@/lib/region";

const params = z.object({ type: mediaTypeSchema, id: z.coerce.number().int().positive() });
const query = z.object({
  region: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((r) => r.toUpperCase())
    .optional(),
});

/** Where to watch a title. Defaults to the visitor's country; ?region= overrides it. */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/titles/[type]/[id]/providers">) => {
  await enforce(limiters.browse, clientKey(req));
  const { type, id } = params.parse(await ctx.params);
  const { region } = query.parse(queryOf(req));
  return Response.json(await getWatchOptions(type, id, region ?? detectRegion(req.headers)));
});
