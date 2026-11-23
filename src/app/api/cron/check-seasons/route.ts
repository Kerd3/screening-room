import { timingSafeEqual } from "node:crypto";
import { handle, HttpError } from "@/lib/api";
import { checkSeasons } from "@/lib/alerts";
import { withCronMonitor } from "@/lib/cronMonitor";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduler entry point: checks every bookmarked series for new seasons.
 * Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET` (see vercel.json);
 * POST is kept for other schedulers.
 */
const run = handle(async (req: Request) => {
  if (!authorized(req)) throw new HttpError(401, "Missing or wrong CRON_SECRET.");
  // Keep in sync with the schedule in vercel.json.
  return Response.json(await withCronMonitor("check-seasons", "0 9 * * *", checkSeasons));
});

export const GET = run;
export const POST = run;
