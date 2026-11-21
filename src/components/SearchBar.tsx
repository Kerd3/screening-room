"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Search, X } from "lucide-react";

const PLACEHOLDERS: Record<string, string> = {
  "/": "Search for movies or TV series",
  "/movies": "Search for movies",
  "/tv": "Search for TV series",
  "/bookmarks": "Search your bookmarked shows",
};

/** Pages that show search results in place; elsewhere a search goes to Home. */
const SEARCHABLE = new Set(Object.keys(PLACEHOLDERS));

export function SearchBar() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchable = SEARCHABLE.has(pathname);

  // Keep the field in sync when the URL changes from outside (back/forward,
  // nav links), but not when the change is just our own debounced commit.
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    if (urlQuery !== value.trim()) setValue(urlQuery);
  }

  function commit(next: string) {
    const target = searchable ? pathname : "/";
    const sp = new URLSearchParams(searchable ? params : undefined);
    if (next.trim()) sp.set("q", next.trim());
    else sp.delete("q");
    const url = sp.size ? `${target}?${sp}` : target;
    if (searchable) router.replace(url, { scroll: false });
    else router.push(url);
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    // Debounced so each keystroke doesn't spend TMDB quota.
    if (searchable) timer.current = setTimeout(() => commit(next), 300);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        commit(value);
      }}
      className="group flex items-center gap-4 border-b border-transparent pb-2 transition-colors duration-150
                 focus-within:border-tungsten/60"
    >
      <Search className="size-6 shrink-0 text-paper" aria-hidden strokeWidth={1.75} />
      <label htmlFor="site-search" className="sr-only">
        {PLACEHOLDERS[pathname] ?? PLACEHOLDERS["/"]}
      </label>
      <input
        id="site-search"
        type="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDERS[pathname] ?? PLACEHOLDERS["/"]}
        className="min-w-0 flex-1 bg-transparent text-xl text-paper caret-tungsten placeholder:text-usher
                   focus:outline-none md:text-2xl [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="flex size-11 items-center justify-center rounded-full text-usher hover:bg-stall hover:text-paper"
        >
          <X className="size-5" aria-hidden />
          <span className="sr-only">Clear search</span>
        </button>
      )}
    </form>
  );
}
