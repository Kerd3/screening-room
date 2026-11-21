import { after } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { checkSeasons } from "@/lib/alerts";
import { requireUserId } from "@/lib/auth";
import { titleToMediaItem } from "@/lib/catalog";
import { db } from "@/lib/db";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export const GET = handle(async () => {
  const userId = await requireUserId();

  // Opportunistic check: if this user's shows haven't been checked in 12h,
  // refresh in the background so the next visit has fresh alerts.
  const user = await db.user.findUnique({ where: { id: userId }, select: { alertsCheckedAt: true } });
  if (!user?.alertsCheckedAt || Date.now() - user.alertsCheckedAt.getTime() > STALE_AFTER_MS) {
    after(() => checkSeasons({ userId }).catch((e) => console.error("background season check failed", e)));
  }

  const alerts = await db.alert.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { title: true },
  });
  return Response.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      kind: a.kind,
      message: a.message,
      createdAt: a.createdAt,
      unread: !a.readAt,
      item: titleToMediaItem(a.title),
    })),
  });
});

/** Mark specific alerts, or all of them, as read. */
export const PATCH = handle(async (req: Request) => {
  const userId = await requireUserId();
  const { ids } = z.object({ ids: z.array(z.number().int()).optional() }).parse(await req.json());
  await db.alert.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return Response.json({ ok: true });
});
