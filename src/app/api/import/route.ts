import { z } from "zod";
import { clientKey, enforce, handle } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { importRows } from "@/lib/importer";
import { limiters } from "@/lib/ratelimit-inbound";

export const maxDuration = 60;

/** One batch. The browser parses the export file and sends it in batches like this. */
const batch = z.object({
  source: z.enum(["letterboxd", "imdb"]),
  kind: z.enum(["watched", "watchlist", "ratings"]),
  rows: z
    .array(
      z.object({
        imdbId: z.string().regex(/^tt\d{5,10}$/).optional(),
        title: z.string().trim().min(1).max(300),
        year: z.number().int().min(1870).max(2100).optional(),
        mediaType: z.enum(["movie", "tv"]).optional(),
        rating: z.number().int().min(1).max(10).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    )
    .min(1)
    .max(50),
});

/** Imports a batch of Letterboxd or IMDb rows into watch history, bookmarks or ratings. */
export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  await enforce(limiters.import, clientKey(req, userId));
  const { source, kind, rows } = batch.parse(await req.json());
  return Response.json(await importRows(userId, source, kind, rows));
});
