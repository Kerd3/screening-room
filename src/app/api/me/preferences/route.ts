import { z } from "zod";
import { clientKey, enforce, handle } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";

const body = z.object({
  bookmarksPublic: z.boolean().optional(),
  alertsEnabled: z.boolean().optional(),
  preferredMediaType: z.enum(["all", "movie", "tv"]).optional(),
});

export const GET = handle(async () => {
  const userId = await requireUserId();
  const pref = await db.userPreference.upsert({ where: { userId }, create: { userId }, update: {} });
  return Response.json(pref);
});

export const PATCH = handle(async (req: Request) => {
  const userId = await requireUserId();
  await enforce(limiters.write, clientKey(req, userId));
  const data = body.parse(await req.json());
  const pref = await db.userPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return Response.json(pref);
});
