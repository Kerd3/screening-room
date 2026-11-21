import { z } from "zod";
import { clientKey, enforce, handle, HttpError, queryOf } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { limiters } from "@/lib/ratelimit-inbound";
import { listFriends } from "@/lib/social";

const userCard = { select: { id: true, name: true, email: true } } as const;

export const GET = handle(async () => {
  const userId = await requireUserId();
  const [friends, incoming, outgoing] = await Promise.all([
    listFriends(userId),
    db.friendship.findMany({
      where: { addresseeId: userId, status: "PENDING" },
      include: { requester: userCard },
      orderBy: { createdAt: "desc" },
    }),
    db.friendship.findMany({
      where: { requesterId: userId, status: "PENDING" },
      include: { addressee: userCard },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return Response.json({
    friends,
    incoming: incoming.map((r) => ({ requestId: r.id, user: r.requester, createdAt: r.createdAt })),
    outgoing: outgoing.map((r) => ({ requestId: r.id, user: r.addressee, createdAt: r.createdAt })),
  });
});

/** Send a friend request by email. If they already asked you, it's accepted. */
export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  await enforce(limiters.write, clientKey(req, userId));
  const { email } = z.object({ email: z.email("Enter a valid email address.") }).parse(await req.json());

  const other = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!other) throw new HttpError(404, "No account uses that email. Ask them to sign up first.");
  if (other.id === userId) throw new HttpError(400, "That's your own email.");

  const reverse = await db.friendship.findUnique({
    where: { requesterId_addresseeId: { requesterId: other.id, addresseeId: userId } },
  });
  if (reverse) {
    await db.friendship.update({ where: { id: reverse.id }, data: { status: "ACCEPTED" } });
    return Response.json({ status: "ACCEPTED", name: other.name });
  }
  const f = await db.friendship.upsert({
    where: { requesterId_addresseeId: { requesterId: userId, addresseeId: other.id } },
    create: { requesterId: userId, addresseeId: other.id },
    update: { status: "PENDING" },
  });
  return Response.json({ status: f.status, name: other.name }, { status: 201 });
});

/** Accept or decline a request addressed to you. */
export const PATCH = handle(async (req: Request) => {
  const userId = await requireUserId();
  const { requestId, action } = z
    .object({ requestId: z.number().int(), action: z.enum(["accept", "decline"]) })
    .parse(await req.json());
  const { count } = await db.friendship.updateMany({
    where: { id: requestId, addresseeId: userId, status: "PENDING" },
    data: { status: action === "accept" ? "ACCEPTED" : "DECLINED" },
  });
  if (!count) throw new HttpError(404, "That request is no longer pending.");
  return Response.json({ ok: true });
});

/** Remove a friend (either direction). */
export const DELETE = handle(async (req: Request) => {
  const userId = await requireUserId();
  const { userId: otherId } = z.object({ userId: z.string().min(1) }).parse(queryOf(req));
  await db.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: userId },
      ],
    },
  });
  return Response.json({ ok: true });
});
