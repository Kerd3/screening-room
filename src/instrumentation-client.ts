/**
 * Browser error tracking (Sentry), loaded only when a DSN is configured, so
 * pages carry no extra JavaScript otherwise. Loaded after startup to keep it
 * off the critical path; errors in the first moments of a visit are missed,
 * which is an acceptable trade for page speed.
 */
import { SENTRY_DATA_COLLECTION } from "@/lib/sentryPrivacy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0,
      dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [...SENTRY_DATA_COLLECTION.httpBodies] },
      // Noise from browser extensions and aborted navigations, not app bugs.
      ignoreErrors: ["ResizeObserver loop", "AbortError", "Failed to fetch"],
    }),
  );
}
