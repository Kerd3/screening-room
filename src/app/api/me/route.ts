import { z } from "zod";
import { clientKey, enforce, handle } from "@/lib/api";
import { getUserId, requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";

/** Current user plus the counts the nav needs (unread alerts, unseen shares). */
export const GET = handle(async () => {
  const userId = await getUserId();
  if (!userId) return Response.json({ user: null });

  // One round trip: the user and the three badge counts are fetched together.
  const [user, unreadAlerts, unseenShares, pendingFriends] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
    db.alert.count({ where: { userId, readAt: null } }),
    db.share.count({ where: { toUserId: userId, seenAt: null } }),
    db.friendship.count({ where: { addresseeId: userId, status: "PENDING" } }),
  ]);
  if (!user) return Response.json({ user: null });
  return Response.json({ user, unreadAlerts, unseenShares, pendingFriends });
});

const profile = z.object({
  name: z.string().trim().min(1, "Enter a display name.").max(40, "Use 40 characters or fewer."),
});

/** Update the signed-in user's display name. */
export const PATCH = handle(async (req: Request) => {
  const userId = await requireUserId();
  await enforce(limiters.write, clientKey(req, userId));
  const { name } = profile.parse(await req.json());
  const user = await db.user.update({
    where: { id: userId },
    data: { name },
    select: { id: true, name: true, email: true },
  });
  return Response.json({ user });
});
