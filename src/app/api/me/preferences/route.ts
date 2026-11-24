import { z } from "zod";
import { clientKey, enforce, handle } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { ensureHandle } from "@/lib/publicProfile";
import { limiters } from "@/lib/ratelimit-inbound";

const body = z.object({
  bookmarksPublic: z.boolean().optional(),
  alertsEnabled: z.boolean().optional(),
  preferredMediaType: z.enum(["all", "movie", "tv"]).optional(),
  weeklyDigest: z.boolean().optional(),
  profilePublic: z.boolean().optional(),
});

// The Settings page says when the digest can't send yet, and links the public profile.
async function withStatus<T extends { userId: string }>(pref: T) {
  const user = await db.user.findUnique({ where: { id: pref.userId }, select: { handle: true } });
  return { ...pref, emailConfigured: emailConfigured(), handle: user?.handle ?? null };
}

export const GET = handle(async () => {
  const userId = await requireUserId();
  const pref = await db.userPreference.upsert({ where: { userId }, create: { userId }, update: {} });
  return Response.json(await withStatus(pref));
});

export const PATCH = handle(async (req: Request) => {
  const userId = await requireUserId();
  await enforce(limiters.write, clientKey(req, userId));
  const data = body.parse(await req.json());
  if (data.profilePublic) await ensureHandle(userId);
  const pref = await db.userPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return Response.json(await withStatus(pref));
});
