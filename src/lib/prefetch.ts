import "server-only";
import { dehydrate, QueryClient, type DehydratedState } from "@tanstack/react-query";
import { cacheLife } from "next/cache";
import { getDetail, getSimilar, getTrending } from "@/lib/catalog";
import type { MediaType } from "@/lib/tmdb/types";

/**
 * Query-cache snapshots the server renders into the HTML, so the main content
 * shows before any JavaScript runs. Keys match the client's queries exactly
 * (see HomeView and TitleView), so the browser doesn't fetch them again.
 *
 * The snapshot is built inside the cached scope because seeding a QueryClient
 * stamps it with Date.now(), which Cache Components only allows there.
 * Loaders return null instead of throwing (TMDB not configured or down); the
 * page then fetches in the browser as before.
 */

async function homeShelvesCached(): Promise<DehydratedState> {
  "use cache";
  cacheLife("hours"); // trending lists change slowly; refreshed hourly in the background
  const [all, movie, tv] = await Promise.all([getTrending("all"), getTrending("movie", 2), getTrending("tv")]);
  const client = new QueryClient();
  client.setQueryData(["trending", "all"], all);
  client.setQueryData(["trending", "movie"], movie);
  client.setQueryData(["trending", "tv"], tv);
  return dehydrate(client);
}

export async function loadHomeShelves(): Promise<DehydratedState | null> {
  try {
    return await homeShelvesCached();
  } catch {
    return null;
  }
}

async function titlePageCached(type: MediaType, id: number): Promise<DehydratedState> {
  "use cache";
  cacheLife("hours");
  const [detail, similar] = await Promise.all([getDetail(type, id), getSimilar(type, id).catch(() => [])]);
  const client = new QueryClient();
  client.setQueryData(["title", type, id], { detail, similar: similar.slice(0, 12) });
  return dehydrate(client);
}

export async function loadTitlePage(type: MediaType, id: number): Promise<DehydratedState | null> {
  try {
    return await titlePageCached(type, id);
  } catch {
    return null;
  }
}
