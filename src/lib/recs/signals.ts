import { canonicalGenres, MOVIE_GENRES, TV_GENRES } from "@/lib/tmdb/genres";

/**
 * Implicit-signal weights. There's no viewing history, so preference comes from
 * what people save, rate, search for and click.
 */
export const WEIGHTS = {
  bookmark: 3,
  /** Centered on 5.5, so a 2/10 counts against a genre and a 9/10 counts for it. */
  rating: (score: number) => (score - 5.5) * 0.8,
  searchClick: 1,
  searchGenreMention: 0.5,
} as const;

export const HALF_LIFE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export function decay(at: Date, now: Date) {
  const ageDays = Math.max(0, (now.getTime() - at.getTime()) / DAY);
  return 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

export interface Signal {
  kind: "bookmark" | "rating" | "searchClick" | "searchQuery";
  at: Date;
  genreIds?: number[]; // the title's genres (bookmark, rating, click)
  score?: number; // rating 1-10
  query?: string; // search text
}

const GENRE_WORDS: [RegExp, number][] = Object.entries({ ...TV_GENRES, ...MOVIE_GENRES })
  .flatMap(([id, name]) =>
    name
      .split(/\s*&\s*|\s+/)
      .filter((w) => w.length > 3)
      .map((w) => [new RegExp(`\\b${w}`, "i"), Number(id)] as [RegExp, number]),
  );

export function genresMentioned(query: string): number[] {
  const ids = GENRE_WORDS.filter(([re]) => re.test(query)).map(([, id]) => id);
  return canonicalGenres([...new Set(ids)]);
}

/** Folds signals into a decayed genre-affinity vector (canonical genre ids). */
export function computeAffinity(signals: Signal[], now = new Date()): Map<number, number> {
  const out = new Map<number, number>();
  const add = (genres: number[], w: number) => {
    for (const g of canonicalGenres(genres)) out.set(g, (out.get(g) ?? 0) + w);
  };
  for (const s of signals) {
    const d = decay(s.at, now);
    if (s.kind === "bookmark") add(s.genreIds ?? [], WEIGHTS.bookmark * d);
    if (s.kind === "rating" && s.score) add(s.genreIds ?? [], WEIGHTS.rating(s.score) * d);
    if (s.kind === "searchClick") add(s.genreIds ?? [], WEIGHTS.searchClick * d);
    if (s.kind === "searchQuery" && s.query) add(genresMentioned(s.query), WEIGHTS.searchGenreMention * d);
  }
  for (const [g, v] of out) if (Math.abs(v) < 1e-3) out.delete(g);
  return out;
}

export function topGenres(affinity: Map<number, number>, n: number) {
  return [...affinity.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g]) => g);
}
