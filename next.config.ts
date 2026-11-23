import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The default bottom-left badge covers the nav rail's account button in dev.
  devIndicators: { position: "bottom-right" },
  images: {
    // TMDB already serves pre-sized images from its CDN, so a custom loader
    // maps each requested width to the nearest TMDB size bucket instead of
    // re-optimizing through Next's image server.
    loader: "custom",
    loaderFile: "./src/lib/tmdb/imageLoader.ts",
    // Offer the browser TMDB's real size buckets, so the width it picks is
    // the file it gets (Next's defaults like 384 would round up to w500).
    imageSizes: [92, 154, 185, 342],
    deviceSizes: [500, 780, 1280],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Uploads source maps to Sentry after production builds so stack traces show
// real file names and lines. Without SENTRY_AUTH_TOKEN (local builds, CI) the
// upload is skipped and the build is otherwise unchanged. Browser source maps
// are deleted after upload, so they are never served to visitors.
export default withSentryConfig(nextConfig, {
  org: "ezekeil-third-cruz",
  project: "screening-room",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  // Errors only: skip tracing-related build features and code.
  buildTimeInstrumentation: false,
  routeManifestInjection: false,
  bundleSizeOptimizations: { excludeDebugStatements: true, excludeTracing: true },
  suppressOnRouterTransitionStartWarning: true, // navigation tracing isn't used
  // The browser sends errors straight to Sentry, so the SDK's auto-generated
  // /sentry-tunnel relay on Vercel would be an unused public endpoint.
  // (Setting this logs a deprecation notice at build time; it still works.)
  tunnelRoute: false,
  // Keep the release out of browser chunks so their file names (and visitors'
  // caches) don't change on every deploy. The server reports the release.
  release: { inject: false },
});
