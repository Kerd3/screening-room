"use client";

import { Row } from "./Row";
import type { MediaItem } from "@/lib/tmdb/types";

/** A profile shelf; a client wrapper so cards show the viewer's own bookmarks. */
export function ProfileShelf({ title, items, notes }: { title: string; items: MediaItem[]; notes?: Record<string, string> }) {
  if (!items.length) return null;
  return <Row title={title} items={items} reasons={notes} />;
}
