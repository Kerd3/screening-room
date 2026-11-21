import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // TMDB already serves pre-sized images from its CDN, so a custom loader
    // maps each requested width to the nearest TMDB size bucket instead of
    // re-optimizing through Next's image server.
    loader: "custom",
    loaderFile: "./src/lib/tmdb/imageLoader.ts",
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
