import { describe, expect, it } from "vitest";
import {
  evaluate,
  hitRateAtK,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  splitByUser,
  type CatalogEntry,
  type Interaction,
} from "./evaluate";
import type { MediaItem } from "@/lib/tmdb/types";

const at = new Date("2026-11-01T00:00:00Z");
const bm = (userId: string, titleId: number): Interaction => ({ userId, titleId, kind: "bookmark", at });
const rate = (userId: string, titleId: number, score: number): Interaction => ({ userId, titleId, kind: "rating", score, at });

describe("ranking metrics", () => {
  const relevant = new Set([3, 7]);

  it("precision and recall count hits in the top k", () => {
    expect(precisionAtK([3, 1, 2, 7, 5], relevant, 5)).toBeCloseTo(2 / 5);
    expect(recallAtK([3, 1, 2, 7, 5], relevant, 5)).toBe(1);
    expect(recallAtK([3, 1, 2, 4, 5], relevant, 5)).toBe(0.5);
    expect(precisionAtK([3, 1, 2, 7, 5], relevant, 2)).toBe(0.5); // only the top 2 count
  });

  it("hit rate is 1 when at least one hidden title is recommended", () => {
    expect(hitRateAtK([9, 7], relevant, 2)).toBe(1);
    expect(hitRateAtK([9, 8], relevant, 2)).toBe(0);
  });

  it("NDCG is 1 for a perfect ranking and lower when hits sit further down", () => {
    expect(ndcgAtK([3, 7, 1], relevant, 3)).toBeCloseTo(1);
    const late = ndcgAtK([1, 2, 3], relevant, 3);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(ndcgAtK([3, 1, 2], relevant, 3));
    expect(ndcgAtK([1, 2], relevant, 2)).toBe(0);
  });
});

describe("hold-out split", () => {
  const interactions = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => bm("alice", t)),
    rate("alice", 1, 9), // also rated a bookmarked title
    rate("alice", 50, 3), // disliked: never a test target
    bm("bob", 1),
    bm("bob", 2), // too few positives to evaluate
  ];

  it("hides about 20% of each eligible user's liked titles", () => {
    const { test } = splitByUser(interactions, { seed: 1 });
    expect(test.get("alice")?.size).toBe(2);
    expect(test.has("bob")).toBe(false);
  });

  it("removes every interaction with a hidden title from training", () => {
    const { train, test } = splitByUser(interactions, { seed: 3 });
    const hidden = test.get("alice")!;
    expect(train.some((i) => i.userId === "alice" && hidden.has(i.titleId))).toBe(false);
    expect(train.some((i) => i.userId === "alice" && i.titleId === 50)).toBe(true);
  });

  it("is reproducible for a seed and independent of input order", () => {
    const a = splitByUser(interactions, { seed: 42 }).test.get("alice");
    const b = splitByUser([...interactions].reverse(), { seed: 42 }).test.get("alice");
    expect([...a!].sort()).toEqual([...b!].sort());
  });
});

describe("evaluate", () => {
  const item = (id: number, genreIds: number[], popularity: number): CatalogEntry => ({
    titleId: id,
    item: {
      id,
      mediaType: "movie",
      title: `T${id}`,
      overview: "",
      year: 2020,
      releaseDate: null,
      posterPath: null,
      backdropPath: null,
      genreIds,
      rating: 7,
      popularity,
    } satisfies MediaItem,
  });

  // Sci-fi titles 1-10, comedies 11-20; comedies are more "popular".
  const catalog = [
    ...Array.from({ length: 10 }, (_, i) => item(i + 1, [878], 10)),
    ...Array.from({ length: 10 }, (_, i) => item(i + 11, [35], 100)),
  ];
  // Twelve sci-fi fans who each saved 8 of the 10 sci-fi titles.
  const interactions = Array.from({ length: 12 }, (_, u) =>
    Array.from({ length: 8 }, (_, j) => bm(`fan${u}`, ((u + j) % 10) + 1)),
  ).flat();

  it("taste-aware strategies beat popularity when taste is consistent", () => {
    const report = evaluate(interactions, catalog, { k: 5, seeds: [1, 2] });
    const recall = Object.fromEntries(report.results.map((r) => [r.strategy, r.recall]));
    expect(report.usersEvaluated).toBe(12);
    expect(recall["content-based"]).toBeGreaterThan(recall.popularity);
    expect(recall.collaborative).toBeGreaterThan(recall.popularity);
    expect(recall.hybrid).toBeGreaterThan(recall.popularity);
    expect(recall.popularity).toBe(0); // only recommends comedies
  });
});
