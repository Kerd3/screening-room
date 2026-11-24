import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/og";

/** Crawl the public catalog; keep crawlers out of the API and personal pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/bookmarks", "/watched", "/friends", "/alerts", "/settings", "/login", "/register"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
