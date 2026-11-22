import type { NextConfig } from "next";

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

export default nextConfig;
