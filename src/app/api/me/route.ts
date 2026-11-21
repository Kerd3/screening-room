import { handle } from "@/lib/api";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";

/** Current user plus the counts the nav needs (unread alerts, unseen shares). */
export const GET = handle(async () => {
  const userId = await getUserId();
  if (!userId) return Response.json({ user: null });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) return Response.json({ user: null });

  const [unreadAlerts, unseenShares, pendingFriends] = await Promise.all([
    db.alert.count({ where: { userId, readAt: null } }),
    db.share.count({ where: { toUserId: userId, seenAt: null } }),
    db.friendship.count({ where: { addresseeId: userId, status: "PENDING" } }),
  ]);
  return Response.json({ user, unreadAlerts, unseenShares, pendingFriends });
});
