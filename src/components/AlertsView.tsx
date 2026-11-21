"use client";

import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorNotice } from "./Notice";
import { fetchJson } from "@/lib/client/fetcher";
import { tmdbImage } from "@/lib/tmdb/images";
import type { MediaItem } from "@/lib/tmdb/types";

interface AlertsResponse {
  alerts: { id: number; kind: string; message: string; createdAt: string; unread: boolean; item: MediaItem }[];
}

export function AlertsView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["alerts"], queryFn: () => fetchJson<AlertsResponse>("/api/alerts") });
  const markAll = useMutation({
    mutationFn: () => fetchJson("/api/alerts", { method: "PATCH", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  if (q.isError) return <ErrorNotice error={q.error} onRetry={() => q.refetch()} />;
  const alerts = q.data?.alerts ?? [];
  const unread = alerts.filter((a) => a.unread).length;

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="display mr-auto text-[64px] text-paper">Alerts</h1>
        {unread > 0 && (
          <button
            onClick={() => markAll.mutate()}
            className="h-11 rounded-full border border-line px-5 text-[15px] font-medium text-paper hover:bg-stall"
          >
            Mark all as read
          </button>
        )}
      </div>
      <p className="mt-2 max-w-[60ch] text-usher">
        New seasons and announced air dates for the series you&rsquo;ve bookmarked. Shows are rechecked about every 12 hours.
      </p>

      {q.isPending ? null : alerts.length === 0 ? (
        <EmptyState title="No alerts yet">
          Bookmark a series that&rsquo;s still airing, and you&rsquo;ll hear about its next season here.
        </EmptyState>
      ) : (
        <ul className="mt-8 max-w-3xl divide-y divide-line">
          {alerts.map((a) => {
            const poster = tmdbImage(a.item.posterPath, "poster");
            return (
              <li key={a.id} className="flex items-center gap-4 py-4">
                <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-[4px] bg-stall">
                  {poster && <Image src={poster} alt="" fill sizes="48px" className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/title/tv/${a.item.id}`} className={`hover:underline ${a.unread ? "font-semibold text-paper" : "text-paper/80"}`}>
                    {a.message}
                  </Link>
                  <p className="text-sm text-usher">
                    {new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                {a.unread && (
                  <span className="size-2 shrink-0 rounded-full bg-tungsten">
                    <span className="sr-only">Unread</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
