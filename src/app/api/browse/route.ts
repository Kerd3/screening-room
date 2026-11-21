import { z } from "zod";
import { clientKey, enforce, handle, mediaTypeSchema, queryOf } from "@/lib/api";
import { browse } from "@/lib/catalog";
import { limiters } from "@/lib/ratelimit-inbound";

const year = z.coerce.number().int().min(1900).max(2100).optional();
const query = z.object({
  type: mediaTypeSchema,
  page: z.coerce.number().int().min(1).max(500).default(1),
  genres: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map(Number).filter(Number.isFinite) : [])),
  sort: z.enum(["popular", "top", "newest"]).default("popular"),
  yearFrom: year,
  yearTo: year,
  status: z.enum(["any", "airing", "ended"]).default("any"),
});

export const GET = handle(async (req: Request) => {
  await enforce(limiters.browse, clientKey(req));
  const q = query.parse(queryOf(req));
  return Response.json(await browse(q));
});
