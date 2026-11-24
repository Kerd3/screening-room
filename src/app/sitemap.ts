import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/og";

/**
 * The browse pages. Title pages are discovered through their links (the
 * catalog is TMDB's, far too large to list), and public profiles are shared
 * by their owners rather than advertised.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/movies`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/tv`, changeFrequency: "daily", priority: 0.8 },
  ];
}
