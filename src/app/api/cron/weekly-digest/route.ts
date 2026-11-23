import { timingSafeEqual } from "node:crypto";
import { handle, HttpError } from "@/lib/api";
import { withCronMonitor } from "@/lib/cronMonitor";
import { sendWeeklyDigests } from "@/lib/digest";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Weekly digest email, Mondays 09:00 UTC (see vercel.json). */
const run = handle(async (req: Request) => {
  if (!authorized(req)) throw new HttpError(401, "Missing or wrong CRON_SECRET.");
  // Keep in sync with the schedule in vercel.json.
  return Response.json(await withCronMonitor("weekly-digest", "0 9 * * 1", () => sendWeeklyDigests()));
});

export const GET = run;
export const POST = run;
