"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { fetchJson, qs } from "@/lib/client/fetcher";
import { tmdbImage } from "@/lib/tmdb/images";
import type { MediaType, WatchOptions, WatchProvider } from "@/lib/tmdb/types";

const STORAGE_KEY = "sr:watch-region";

function readSavedRegion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked (private mode, embedded views)
  }
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();
const countryName = (code: string) => regionNames?.of(code) ?? code;

/**
 * Where to watch a title, in the visitor's country by default. This only
 * mounts after the title has loaded (never during hydration), so reading
 * localStorage in the initial state is safe.
 */
export function WhereToWatch({ type, id, title }: { type: MediaType; id: number; title: string }) {
  const [chosen, setChosen] = useState<string | null>(readSavedRegion);
  const selectId = useId();
  const q = useQuery({
    queryKey: ["providers", type, id, chosen ?? "auto"],
    queryFn: () => fetchJson<WatchOptions>(`/api/titles/${type}/${id}/providers?${qs({ region: chosen })}`),
    staleTime: 60 * 60_000,
  });

  const data = q.data;
  const region = data?.region ?? chosen ?? "US";
  const groups: [string, WatchProvider[]][] = data
    ? [
        ["Stream", data.stream],
        ["Rent", data.rent],
        ["Buy", data.buy],
      ]
    : [];
  const available = groups.some(([, list]) => list.length > 0);
  // Always offer the current region, even when TMDB lists nothing for it.
  const regions = data ? [...new Set([...data.regions, region])].sort((a, b) => countryName(a).localeCompare(countryName(b))) : [];

  return (
    <section aria-labelledby="where-to-watch" className="mt-16">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <h2 id="where-to-watch" className="display text-[32px] text-paper">
          Where to watch
        </h2>
        {data && (
          <div className="flex items-center gap-2 text-[15px] text-usher">
            <label htmlFor={selectId}>in</label>
            <select
              id={selectId}
              value={region}
              onChange={(e) => {
                setChosen(e.target.value);
                try {
                  localStorage.setItem(STORAGE_KEY, e.target.value);
                } catch {}
              }}
              className="h-11 rounded-full border border-line bg-stall px-4 text-[15px] text-paper hover:bg-stall-raised"
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {countryName(r)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {q.isPending && <div className="mt-6 h-16 max-w-xl rounded-panel bg-stall motion-safe:animate-pulse" aria-hidden />}
      {q.isError && <p className="mt-4 text-usher">Streaming availability couldn&rsquo;t be loaded right now.</p>}

      {data && !available && (
        <p className="mt-4 max-w-[60ch] text-usher">
          {title} isn&rsquo;t available to stream, rent or buy in {countryName(region)} right now.
          {data.regions.length > 0 && ` It is in ${data.regions.length} other ${data.regions.length === 1 ? "country" : "countries"}; pick one above.`}
        </p>
      )}

      {data && available && (
        <>
          <dl className="mt-6 space-y-5">
            {groups
              .filter(([, list]) => list.length > 0)
              .map(([label, list]) => (
                <div key={label} className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <dt className="w-20 shrink-0 pt-2.5 font-medium text-paper">{label}</dt>
                  <dd>
                    <ul className="flex flex-wrap gap-2">
                      {list.map((p) => (
                        <li key={p.id}>
                          <a
                            href={data.link ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-11 items-center gap-2.5 rounded-full border border-line bg-stall py-1 pl-1 pr-4 text-[15px] text-paper transition-colors duration-150 hover:bg-stall-raised"
                          >
                            {p.logoPath ? (
                              <Image
                                src={tmdbImage(p.logoPath, "logo")!}
                                alt=""
                                width={36}
                                height={36}
                                className="size-9 rounded-full"
                              />
                            ) : (
                              <span aria-hidden className="size-9 rounded-full bg-stall-raised" />
                            )}
                            {p.name}
                            <span className="sr-only"> ({label.toLowerCase()}, opens in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
          </dl>
          <p className="mt-5 flex items-center gap-1.5 text-sm text-usher">
            Availability from JustWatch, via TMDB.
            {data.link && (
              <a
                href={data.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-paper underline decoration-tungsten underline-offset-4"
              >
                See prices and links
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </p>
        </>
      )}
    </section>
  );
}
