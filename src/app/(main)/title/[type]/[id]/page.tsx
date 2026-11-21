import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TitleView } from "@/components/TitleView";

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
  return <TitleView type={type} id={tmdbId} />;
}
