import { z } from "zod";
import { handle, HttpError, queryOf } from "@/lib/api";
import { db } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/digest";

const params = z.object({ u: z.string().min(1).max(64), t: z.string().min(1).max(128) });

async function unsubscribe(req: Request) {
  const { u, t } = params.parse(queryOf(req));
  if (!verifyUnsubscribe(u, t)) throw new HttpError(400, "This unsubscribe link isn't valid.");
  await db.userPreference.updateMany({ where: { userId: u }, data: { weeklyDigest: false } });
}

/** The link in the email: turns the digest off and says so. */
export const GET = handle(async (req: Request) => {
  await unsubscribe(req);
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1b1726;color:#ede6d8;font-family:system-ui,sans-serif;padding:16px">
<main style="max-width:420px;text-align:center"><h1>You're unsubscribed</h1>
<p style="color:#9c94a8">You won't get the weekly digest any more. You can turn it back on in <a href="/settings" style="color:#f0b44c">Settings</a>.</p></main></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
});

/** One-click unsubscribe from the mail app (RFC 8058, List-Unsubscribe-Post). */
export const POST = handle(async (req: Request) => {
  await unsubscribe(req);
  return Response.json({ ok: true });
});
