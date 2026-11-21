/**
 * Hybrid ranking: blends collaborative, content-based and popularity scores,
 * then diversifies the list so one genre can't take over the shelf.
 */
import { canonicalGenres } from "@/lib/tmdb/genres";
import type { MediaItem } from "@/lib/tmdb/types";

export interface Candidate {
  key: string; // "movie:123"
  item: MediaItem;
  cf: number; // 0..1 after normalization
  content: number; // 0..1
  cfReason?: string;
  contentReason?: string;
}

export interface Weights {
  cf: number;
  content: number;
  popularity: number;
}

/** Fewer than this many saved or rated titles counts as a cold start. */
export const COLD_START_SIGNALS = 5;

/**
 * Blend for users with enough history. Tuned with `npm run recs:tune` against
 * the hold-out evaluation; see docs/recommendation-tuning.md for the search.
 */
export const WARM_WEIGHTS: Weights = { cf: 0.5, content: 0.35, popularity: 0.15 };

/** Highest share of a shelf one primary genre may fill (1 = no cap). */
export const DIVERSITY_SHARE = 0.4;

export function weightsFor(
  signalCount: number,
  hasCollaborativeData: boolean,
  warm: Weights = WARM_WEIGHTS,
): Weights {
  if (signalCount < COLD_START_SIGNALS || !hasCollaborativeData) {
    return { cf: hasCollaborativeData ? 0.15 : 0, content: 0.7, popularity: 0.15 };
  }
  return warm;
}

export function normalize(values: number[]): (v: number) => number {
  const max = Math.max(0, ...values);
  return (v) => (max > 0 ? Math.max(0, v) / max : 0);
}

export interface Ranked {
  item: MediaItem;
  score: number;
  reason: string;
}

export function blend(candidates: Candidate[], w: Weights): Ranked[] {
  const maxPop = Math.max(1, ...candidates.map((c) => c.item.popularity));
  return candidates
    .map((c) => {
      const pop = Math.log1p(c.item.popularity) / Math.log1p(maxPop);
      const cfPart = w.cf * c.cf;
      const contentPart = w.content * c.content;
      const score = cfPart + contentPart + w.popularity * pop;
      // Explain with whichever part contributed most.
      const reason =
        cfPart >= contentPart && c.cfReason
          ? c.cfReason
          : (c.contentReason ?? c.cfReason ?? "Popular right now");
      return { item: c.item, score, reason };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Greedy diversification: walk the ranked list and skip a title once its
 * primary genre already fills `maxShare` of the slots.
 */
export function diversify(ranked: Ranked[], limit: number, maxShare = DIVERSITY_SHARE): Ranked[] {
  if (maxShare >= 1) return ranked.slice(0, limit);
  const cap = Math.max(1, Math.floor(limit * maxShare));
  const counts = new Map<number, number>();
  const picked: Ranked[] = [];
  const skipped: Ranked[] = [];
  for (const r of ranked) {
    if (picked.length >= limit) break;
    const primary = canonicalGenres(r.item.genreIds)[0];
    const n = primary === undefined ? 0 : (counts.get(primary) ?? 0);
    if (primary !== undefined && n >= cap) {
      skipped.push(r);
      continue;
    }
    if (primary !== undefined) counts.set(primary, n + 1);
    picked.push(r);
  }
  // Too few varied titles: backfill in rank order instead of showing a short list.
  for (const r of skipped) if (picked.length < limit) picked.push(r);
  return picked;
}

/**
 * Keeps explanations varied. When one reason ("Popular with people who saved
 * X") would label more than `maxRepeat` picks, the extra picks fall back to
 * their other true reason (genre match or a different seed title). The
 * ranking itself is unchanged; only the label is.
 */
export function varyReasons(
  ranked: Ranked[],
  alternativeFor: (r: Ranked) => string | undefined,
  maxRepeat = 2,
): Ranked[] {
  const used = new Map<string, number>();
  return ranked.map((r) => {
    let reason = r.reason;
    if ((used.get(reason) ?? 0) >= maxRepeat) {
      const alt = alternativeFor(r);
      if (alt && (used.get(alt) ?? 0) < maxRepeat) reason = alt;
    }
    used.set(reason, (used.get(reason) ?? 0) + 1);
    return reason === r.reason ? r : { ...r, reason };
  });
}

/** Cosine similarity between a title's genres (binary) and the affinity vector. */
export function genreMatch(genreIds: number[], affinity: Map<number, number>): number {
  const genres = canonicalGenres(genreIds);
  if (!genres.length || !affinity.size) return 0;
  let dot = 0;
  let norm = 0;
  for (const v of affinity.values()) norm += v * v;
  for (const g of genres) dot += affinity.get(g) ?? 0;
  return dot / (Math.sqrt(genres.length) * Math.sqrt(norm));
}
