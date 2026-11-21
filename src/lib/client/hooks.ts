"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { MediaItem, MediaType } from "@/lib/tmdb/types";
import { fetchJson } from "./fetcher";

export interface Me {
  user: { id: string; name: string; email: string } | null;
  unreadAlerts?: number;
  unseenShares?: number;
  pendingFriends?: number;
}

const fetchMe = () => fetchJson<Me>("/api/me");

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 30_000,
  });
}

export interface BookmarkedItem extends MediaItem {
  bookmarkedAt: string;
}

export const itemKey = (i: { mediaType: MediaType; id: number }) => `${i.mediaType}:${i.id}`;

export function useBookmarks(enabled = true) {
  return useQuery({
    queryKey: ["bookmarks"],
    queryFn: () => fetchJson<{ items: BookmarkedItem[] }>("/api/bookmarks"),
    enabled,
    staleTime: 60_000,
    select: (d) => d.items,
  });
}

/** Set of "type:id" keys, for instant isBookmarked checks on every card. */
export function useBookmarkKeys() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const { data } = useBookmarks(signedIn);
  return new Set((data ?? []).map(itemKey));
}

/**
 * Toggles a bookmark with an optimistic update: the card flips immediately
 * and rolls back if the server rejects the change.
 */
export function useToggleBookmark() {
  const qc = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async ({ item, bookmarked }: { item: MediaItem; bookmarked: boolean }) => {
      // keepalive: the change still reaches the server if the user reloads or
      // leaves right after clicking (the UI has already updated optimistically).
      if (bookmarked) {
        await fetchJson(`/api/bookmarks?type=${item.mediaType}&tmdbId=${item.id}`, {
          method: "DELETE",
          keepalive: true,
        });
      } else {
        await fetchJson("/api/bookmarks", {
          method: "POST",
          body: JSON.stringify({ type: item.mediaType, tmdbId: item.id }),
          keepalive: true,
        });
      }
    },
    onMutate: async ({ item, bookmarked }) => {
      // Wait for the session check if it's still loading; reading only the cache
      // would treat a signed-in user who clicks early as signed out.
      const me = await qc.ensureQueryData({ queryKey: ["me"], queryFn: fetchMe });
      if (!me.user) {
        router.push(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        throw new Error("signed-out");
      }
      await qc.cancelQueries({ queryKey: ["bookmarks"] });
      const prev = qc.getQueryData<{ items: BookmarkedItem[] }>(["bookmarks"]);
      const items = prev?.items ?? [];
      const next = bookmarked
        ? items.filter((b) => itemKey(b) !== itemKey(item))
        : [{ ...item, bookmarkedAt: new Date().toISOString() }, ...items];
      qc.setQueryData(["bookmarks"], { items: next });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["bookmarks"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}
