import { handle } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const POST = handle(async () => {
  const userId = await requireUserId();
  await db.share.updateMany({ where: { toUserId: userId, seenAt: null }, data: { seenAt: new Date() } });
  return Response.json({ ok: true });
});
