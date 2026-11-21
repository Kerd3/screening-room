import { z } from "zod";
import { clientKey, enforce, handle, queryOf } from "@/lib/api";
import { getUserId } from "@/lib/auth";
import { search } from "@/lib/catalog";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";

const query = z.object({
  q: z.string().trim().min(1).max(100),
  type: z.enum(["all", "movie", "tv"]).default("all"),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export const GET = handle(async (req: Request) => {
  const userId = await getUserId();
  await enforce(limiters.search, clientKey(req, userId ?? undefined));
  const { q, type, page } = query.parse(queryOf(req));
  const results = await search(q, type, page);

  // Log the first page of a settled query (the client debounces) as a
  // personalization signal. Later pages are the same search, so they're skipped.
  let historyId: number | null = null;
  if (userId && page === 1 && q.length >= 2) {
    const row = await db.searchHistory.create({
      data: { userId, query: q, mediaFilter: type, resultCount: results.totalResults },
    });
    historyId = row.id;
  }
  return Response.json({ ...results, historyId });
});
