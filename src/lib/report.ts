/**
 * Reports an unexpected server error to Sentry when it's configured. Used by
 * the API error handler, which turns errors into tidy 500 responses (so Next's
 * onRequestError hook never sees them). Never throws.
 */
export async function reportError(err: unknown, context: Record<string, string | undefined> = {}) {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(err, { tags: context });
    await Sentry.flush(2000); // serverless functions may freeze right after responding
  } catch {
    // Error reporting must never break the request.
  }
}
