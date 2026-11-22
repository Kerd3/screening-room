import { Suspense } from "react";
import { HydrationBoundary } from "@tanstack/react-query";
import { HomeSkeleton, HomeView } from "@/components/HomeView";
import { loadHomeShelves } from "@/lib/prefetch";

/**
 * Home renders on the server with its shelves (fetched through a cache that
 * refreshes hourly), so the hero and first shelves are in the HTML before any
 * JavaScript runs. The static shell shows a skeleton while that streams in.
 * Without data (TMDB unavailable), HomeView fetches in the browser instead.
 */
export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;
  if (q) return <HomeView q={q} />; // search results are fetched in the browser
  const state = await loadHomeShelves();
  return (
    <HydrationBoundary state={state ?? undefined}>
      <HomeView />
    </HydrationBoundary>
  );
}
