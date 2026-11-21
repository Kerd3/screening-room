"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { genresFor } from "@/lib/tmdb/genres";
import type { MediaType } from "@/lib/tmdb/types";

export const DECADES = [
  { value: "", label: "Any year" },
  { value: "2020", label: "2020s", from: 2020, to: 2029 },
  { value: "2010", label: "2010s", from: 2010, to: 2019 },
  { value: "2000", label: "2000s", from: 2000, to: 2009 },
  { value: "1990", label: "1990s", from: 1990, to: 1999 },
  { value: "1980", label: "1980s", from: 1980, to: 1989 },
  { value: "old", label: "Before 1980", from: 1900, to: 1979 },
] as const;

const SORTS = [
  { value: "popular", label: "Popular" },
  { value: "top", label: "Top rated" },
  { value: "newest", label: "Newest" },
] as const;

const STATUSES = [
  { value: "any", label: "All series" },
  { value: "airing", label: "Still airing" },
  { value: "ended", label: "Ended" },
] as const;

export interface Filters {
  genres: number[];
  sort: string;
  decade: string;
  status: string;
}

export function useFilters(): Filters {
  const p = useSearchParams();
  return {
    genres: (p.get("genres") ?? "").split(",").filter(Boolean).map(Number),
    sort: p.get("sort") ?? "popular",
    decade: p.get("decade") ?? "",
    status: p.get("status") ?? "any",
  };
}

/** Page-specific filters for Movies and TV, stored in the URL so views can be shared. */
export function FilterBar({ type }: { type: MediaType }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const f = useFilters();

  function update(changes: Record<string, string | null>) {
    const sp = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "" || (k === "sort" && v === "popular") || (k === "status" && v === "any"))
        sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(sp.size ? `${pathname}?${sp}` : pathname, { scroll: false });
  }

  function toggleGenre(id: number) {
    const next = f.genres.includes(id) ? f.genres.filter((g) => g !== id) : [...f.genres, id];
    update({ genres: next.join(",") || null });
  }

  const selectClass =
    "h-11 rounded-full border border-line bg-stall px-4 text-[15px] text-paper hover:bg-stall-raised focus-visible:outline-tungsten";

  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Sort by" className="flex rounded-full bg-stall p-1">
          {SORTS.map((s) => (
            <button
              key={s.value}
              role="radio"
              aria-checked={f.sort === s.value}
              onClick={() => update({ sort: s.value })}
              className={`h-9 rounded-full px-4 text-[15px] font-medium transition-colors duration-150
                ${f.sort === s.value ? "bg-paper text-velvet" : "text-usher hover:text-paper"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="sr-only" htmlFor="decade">
          Release decade
        </label>
        <select
          id="decade"
          value={f.decade}
          onChange={(e) => update({ decade: e.target.value })}
          className={selectClass}
        >
          {DECADES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>

        {type === "tv" && (
          <>
            <label className="sr-only" htmlFor="status">
              Series status
            </label>
            <select
              id="status"
              value={f.status}
              onChange={(e) => update({ status: e.target.value })}
              className={selectClass}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </>
        )}

        {(f.genres.length > 0 || f.decade || f.sort !== "popular" || f.status !== "any") && (
          <button
            onClick={() => update({ genres: null, decade: null, sort: null, status: null })}
            className="h-11 px-2 text-[15px] text-usher underline-offset-4 hover:text-paper hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div role="group" aria-label="Genres" className="flex flex-wrap gap-2">
        {genresFor(type).map((g) => {
          const on = f.genres.includes(g.id);
          return (
            <button
              key={g.id}
              aria-pressed={on}
              onClick={() => toggleGenre(g.id)}
              className={`h-9 rounded-full border px-4 text-sm font-medium transition-colors duration-150
                ${on ? "border-tungsten bg-tungsten/15 text-tungsten" : "border-line text-usher hover:border-usher/40 hover:text-paper"}`}
            >
              {g.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
