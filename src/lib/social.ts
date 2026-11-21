import "server-only";
import { db } from "@/lib/db";

/** Accepted friendships are stored once; either side may be the requester. */
export async function areFriends(a: string, b: string) {
  const f = await db.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
  return Boolean(f);
}

export async function listFriends(userId: string) {
  const rows = await db.friendship.findMany({
    where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      addressee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows
    .map((f) => (f.requesterId === userId ? f.addressee : f.requester))
    .sort((x, y) => x.name.localeCompare(y.name));
}
