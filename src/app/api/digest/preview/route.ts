import { clientKey, enforce, handle, HttpError } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendDigestTo } from "@/lib/digest";
import { emailConfigured, EmailError } from "@/lib/email";
import { limiters } from "@/lib/ratelimit-inbound";

export const maxDuration = 30;

/** "Send me a preview" in Settings: this week's digest, sent now to the signed-in user. */
export const POST = handle(async (req: Request) => {
  const userId = await requireUserId();
  if (!emailConfigured()) throw new HttpError(503, "Email isn't set up on this server yet.");
  await enforce(limiters.email, clientKey(req, userId));
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  try {
    const sent = await sendDigestTo(userId, user.email);
    if (!sent) throw new HttpError(409, "Nothing to send yet. Bookmark or rate a few titles first.");
    return Response.json({ sentTo: user.email });
  } catch (err) {
    if (err instanceof EmailError) throw new HttpError(502, err.message);
    throw err;
  }
});
