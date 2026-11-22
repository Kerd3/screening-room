import { timingSafeEqual } from "node:crypto";
import { handle, HttpError } from "@/lib/api";

/**
 * Throws on purpose, to check that error tracking works end to end:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/debug/error
 * Protected by CRON_SECRET so visitors can't flood the error tracker.
 */
export const POST = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, "Missing or wrong CRON_SECRET.");
  }
  throw new Error(`Deliberate test error from /api/debug/error at ${new Date().toISOString()}`);
});
