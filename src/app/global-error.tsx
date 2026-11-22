"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort error screen for crashes the normal pages can't recover from.
 * Reports the error to Sentry (when configured) and offers a way back.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-velvet px-4 text-paper">
        <main className="max-w-md text-center">
          <h1 className="display text-[64px]">Something broke</h1>
          <p className="mt-4 text-usher">
            The page hit an unexpected error. It has been reported. Try again, or go back to the home page.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <button
              onClick={reset}
              className="h-11 rounded-full bg-tungsten px-6 text-[15px] font-semibold text-velvet hover:bg-[#f5c46a]"
            >
              Try again
            </button>
            {/* A full page load on purpose: after a crash, client-side navigation may itself be broken. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="flex h-11 items-center rounded-full border border-line px-6 text-[15px] font-semibold">
              Go home
            </a>
          </div>
          {error.digest && <p className="mt-6 text-sm text-usher">Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
