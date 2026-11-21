"use client";

import { TMDB_IMAGE_PREFIX } from "./images";

// next/image custom loader. TMDB serves fixed size buckets from its CDN, so
// each requested width maps to the smallest bucket at least that wide.
const POSTER = [92, 154, 185, 342, 500, 780];
const BACKDROP = [300, 780, 1280];

export default function tmdbImageLoader({ src, width }: { src: string; width: number }) {
  if (!src.startsWith(TMDB_IMAGE_PREFIX)) return src; // local asset

  // src is built by tmdbImage(): .../t/p/{w780|w1280}/path.jpg
  const rest = src.slice(TMDB_IMAGE_PREFIX.length);
  const slash = rest.indexOf("/");
  const kind = rest.slice(0, slash);
  const path = rest.slice(slash);
  const buckets = kind === "w1280" ? BACKDROP : POSTER;
  const size = buckets.find((b) => b >= width) ?? buckets[buckets.length - 1];
  return `${TMDB_IMAGE_PREFIX}w${size}${path}`;
}
