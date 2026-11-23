/**
 * Runs a scheduled job inside a Sentry cron monitor, so Sentry raises an issue
 * when the job fails, runs too long, or stops running at all (a missed
 * check-in). The monitor is created or updated from `schedule` on first run.
 *
 * Only production check-ins are sent: preview deployments and local runs would
 * otherwise look like extra (or missed) runs. Without a DSN the job just runs.
 */
export async function withCronMonitor<T>(
  slug: string,
  schedule: string,
  job: () => Promise<T>,
  { maxRuntimeMinutes = 5 }: { maxRuntimeMinutes?: number } = {},
): Promise<T> {
  const enabled =
    (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) && process.env.VERCEL_ENV === "production";
  if (!enabled) return job();

  const Sentry = await import("@sentry/nextjs");
  try {
    return await Sentry.withMonitor(slug, job, {
      schedule: { type: "crontab", value: schedule },
      timezone: "UTC",
      checkinMargin: 30, // Vercel Cron may start a job several minutes late
      maxRuntime: maxRuntimeMinutes,
      failureIssueThreshold: 1,
      recoveryThreshold: 1,
    });
  } finally {
    await Sentry.flush(2000); // serverless functions may freeze right after responding
  }
}
