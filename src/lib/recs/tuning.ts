/**
 * Shared tuning helpers: a paired comparison that decides whether a candidate
 * configuration really beats the current one, or only looked better by chance.
 */
import { evaluate, type CatalogEntry, type Interaction, type Strategy } from "./evaluate";

export interface PairedResult {
  /** Mean per-split NDCG@k difference (candidate minus current). */
  mean: number;
  /** Standard error of that mean. */
  se: number;
  diffs: number[];
  /** True when the mean gain is more than two standard errors above zero. */
  significant: boolean;
}

/**
 * Scores both strategies on each split separately and compares them split by
 * split, which cancels out how easy or hard a particular split happened to be.
 */
export function pairedComparison(
  interactions: Interaction[],
  catalog: CatalogEntry[],
  current: Strategy,
  candidate: Strategy,
  seeds: number[],
  k = 10,
): PairedResult {
  const diffs = seeds.map((seed) => {
    const r = evaluate(interactions, catalog, { k, seeds: [seed], strategies: { current, candidate } }).results;
    return r.find((x) => x.strategy === "candidate")!.ndcg - r.find((x) => x.strategy === "current")!.ndcg;
  });
  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / Math.max(1, diffs.length - 1));
  const se = sd / Math.sqrt(diffs.length);
  return { mean, se, diffs, significant: mean - 2 * se > 0 };
}

export const VALIDATION_SEEDS = [1, 2, 3, 4, 5];
export const TEST_SEEDS = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export const relChange = (a: number, b: number) => `${b >= a ? "+" : ""}${(((b - a) / a) * 100).toFixed(1)}%`;
