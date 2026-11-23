import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { HydrationBoundary } from "@tanstack/react-query";
import { TitleView } from "@/components/TitleView";
import { loadTitlePage } from "@/lib/prefetch";
import { getTitleForMeta, shortOverview } from "@/lib/titleMeta";

/**
 * Per-title tab title, description and link-preview text. The page body
 * already streams in after the static shell, so this metadata streams with it.
 * The preview image itself comes from opengraph-image.tsx next to this file.
 */
export async function generateMetadata({ params }: PageProps<"/title/[type]/[id]">): Promise<Metadata> {
  const { type, id } = await params;
  // Request-time on purpose: the TMDB cache checks expiry against the clock,
  // which Next.js won't allow while prerendering the static shell.
  await connection();
  const d = await getTitleForMeta(type, id);
  if (!d) return { title: "Title not found" };
  const name = `${d.title}${d.year ? ` (${d.year})` : ""}`;
  const description = shortOverview(d.overview || `${d.mediaType === "movie" ? "Movie" : "Series"} on Screening Room.`);
  return {
    title: name,
    description,
    alternates: { canonical: `/title/${type}/${id}` },
    openGraph: { type: d.mediaType === "movie" ? "video.movie" : "video.tv_show", title: name, description, url: `/title/${type}/${id}` },
    twitter: { card: "summary_large_image", title: name, description },
  };
}

export default function TitlePage({ params }: PageProps<"/title/[type]/[id]">) {
  // params is awaited inside the boundary, so the layout shell still prerenders.
  return (
    <Suspense fallback={<div className="aspect-[21/9] w-full rounded-panel bg-stall" aria-busy="true" />}>
      <TitleFromParams params={params} />
    </Suspense>
  );
}

async function TitleFromParams({ params }: { params: PageProps<"/title/[type]/[id]">["params"] }) {
  const { type, id } = await params;
  const tmdbId = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(tmdbId) || tmdbId <= 0) notFound();

  // Rendered into the HTML (cached hourly), so the backdrop and title show
  // before the JavaScript loads; seeds the same query key TitleView uses.
  const state = await loadTitlePage(type, tmdbId);
  return (
    <HydrationBoundary state={state ?? undefined}>
      <TitleView type={type} id={tmdbId} />
    </HydrationBoundary>
  );
}
