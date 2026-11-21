import { z } from "zod";
import { clientKey, enforce, handle, queryOf } from "@/lib/api";
import { getTrending } from "@/lib/catalog";
import { limiters } from "@/lib/ratelimit-inbound";

const query = z.object({
  type: z.enum(["all", "movie", "tv"]).default("all"),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export const GET = handle(async (req: Request) => {
  await enforce(limiters.browse, clientKey(req));
  const { type, page } = query.parse(queryOf(req));
  return Response.json(await getTrending(type, page));
});
