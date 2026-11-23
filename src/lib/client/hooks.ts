"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { MediaItem, MediaType } from "@/lib/tmdb/types";
import { fetchJson } from "./fetcher";
import { useHydrated } from "./useHydrated";

export interface Me {
  user: { id: string; name: string; email: string } | null;
  unreadAlerts?: number;
  unseenShares?: number;
  pendingFriends?: number;
}

const fetchMe = () => fetchJson<Me>("/api/me");

/**
 * The signed-in user. Until this component has hydrated it reports "still
 * loading", even if another section already fetched the answer, so the first
 * client render always matches the server HTML (see useHydrated).
 */
export function useMe() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 30_000,
  });
  const hydrated = useHydrated();
  if (hydrated) return query;
  return { ...query, data: undefined, isPending: true as const, isSuccess: false as const };
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
  // A disabled query can still hold cached data; only trust it when signed in.
  return new Set(signedIn ? (data ?? []).map(itemKey) : []);
}

export interface WatchedItem extends MediaItem {
  watchedAt: string;
  source: "app" | "letterboxd" | "imdb";
}

export function useWatched(enabled = true) {
  return useQuery({
    queryKey: ["watched"],
    queryFn: () => fetchJson<{ items: WatchedItem[] }>("/api/watched"),
    enabled,
    staleTime: 60_000,
    select: (d) => d.items,
  });
}

/** Set of "type:id" keys of watched titles. */
export function useWatchedKeys() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const { data } = useWatched(signedIn);
  return new Set(signedIn ? (data ?? []).map(itemKey) : []);
}

/** Marks or unmarks a title as watched, optimistically like bookmarks. */
export function useToggleWatched() {
  const qc = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async ({ item, watched }: { item: MediaItem; watched: boolean }) => {
      if (watched) {
        await fetchJson(`/api/watched?type=${item.mediaType}&tmdbId=${item.id}`, { method: "DELETE", keepalive: true });
      } else {
        await fetchJson("/api/watched", {
          method: "POST",
          body: JSON.stringify({ type: item.mediaType, tmdbId: item.id }),
          keepalive: true,
        });
      }
    },
    onMutate: async ({ item, watched }) => {
      const me = await qc.ensureQueryData({ queryKey: ["me"], queryFn: fetchMe });
      if (!me.user) {
        router.push(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        throw new Error("signed-out");
      }
      await qc.cancelQueries({ queryKey: ["watched"] });
      const prev = qc.getQueryData<{ items: WatchedItem[] }>(["watched"]);
      const items = prev?.items ?? [];
      const next = watched
        ? items.filter((w) => itemKey(w) !== itemKey(item))
        : [{ ...item, watchedAt: new Date().toISOString(), source: "app" as const }, ...items];
      qc.setQueryData(["watched"], { items: next });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["watched"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["watched"] });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
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
