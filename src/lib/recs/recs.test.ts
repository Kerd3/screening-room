import { describe, expect, it } from "vitest";
import { buildUserVectors, computeItemSimilarity, scoreForUser } from "./collaborative";
import { blend, diversify, genreMatch, varyReasons, weightsFor, type Candidate } from "./hybrid";
import { computeAffinity, decay, genresMentioned, topGenres } from "./signals";
import type { MediaItem } from "@/lib/tmdb/types";

const now = new Date("2026-11-19T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("signals", () => {
  it("halves a signal's weight every 30 days", () => {
    expect(decay(now, now)).toBe(1);
    expect(decay(daysAgo(30), now)).toBeCloseTo(0.5);
    expect(decay(daysAgo(60), now)).toBeCloseTo(0.25);
  });

  it("builds genre affinity: bookmarks count, low ratings count against", () => {
    const aff = computeAffinity(
      [
        { kind: "bookmark", at: now, genreIds: [878, 28] }, // sci-fi, action
        { kind: "bookmark", at: now, genreIds: [878] },
        { kind: "rating", at: now, score: 2, genreIds: [27] }, // disliked horror
        { kind: "searchQuery", at: now, query: "best thriller of the decade" },
      ],
      now,
    );
    expect(aff.get(878)).toBe(6);
    expect(aff.get(28)).toBe(3);
    expect(aff.get(27)!).toBeLessThan(0);
    expect(aff.get(53)).toBe(0.5);
    expect(topGenres(aff, 2)).toEqual([878, 28]);
  });

  it("counts watched titles for a genre and 'Not interested' against it, without erasing a favorite", () => {
    const aff = computeAffinity(
      [
        { kind: "watched", at: now, genreIds: [35] }, // comedy
        { kind: "bookmark", at: now, genreIds: [878] }, // sci-fi
        { kind: "dismissed", at: now, genreIds: [878, 27] }, // a sci-fi horror pick
      ],
      now,
    );
    expect(aff.get(35)).toBe(2);
    expect(aff.get(878)).toBe(1.5); // 3 - 1.5: still liked
    expect(aff.get(27)).toBe(-1.5);
    expect(topGenres(aff, 3)).toEqual([35, 878]);
  });

  it("maps TV combined genres onto movie genres", () => {
    const aff = computeAffinity([{ kind: "bookmark", at: now, genreIds: [10765] }], now); // Sci-Fi & Fantasy
    expect([...aff.keys()].sort()).toEqual([14, 878]);
  });

  it("spots genre words in search text", () => {
    expect(genresMentioned("funny comedy specials")).toContain(35);
    expect(genresMentioned("the batman")).toEqual([]);
  });
});

describe("item-item collaborative filtering", () => {
  // Titles: 1 = Alien, 2 = Aliens, 3 = Arrival, 9 = a romcom
  const bookmarks = [
    { userId: "a", titleId: 1 },
    { userId: "a", titleId: 2 },
    { userId: "b", titleId: 1 },
    { userId: "b", titleId: 2 },
    { userId: "b", titleId: 3 },
    { userId: "c", titleId: 1 },
    { userId: "c", titleId: 3 },
    { userId: "d", titleId: 9 },
    { userId: "d", titleId: 1 },
  ];

  it("ignores low ratings when building user vectors", () => {
    const v = buildUserVectors([], [
      { userId: "x", titleId: 5, score: 3 },
      { userId: "x", titleId: 6, score: 9 },
    ]);
    expect([...v.get("x")!.entries()]).toEqual([[6, 0.9]]);
  });

  it("links titles that are saved together, given enough users", () => {
    const rows = computeItemSimilarity(buildUserVectors(bookmarks, []));
    const pair = (a: number, b: number) => rows.find((r) => r.titleAId === a && r.titleBId === b);
    expect(pair(1, 2)?.coCount).toBe(2);
    expect(pair(1, 3)?.coCount).toBe(2);
    expect(pair(1, 9)).toBeUndefined(); // only one user saved both
    expect(pair(1, 2)!.score).toBeGreaterThan(0);
    expect(pair(1, 2)!.score).toBeLessThanOrEqual(1);
  });

  it("recommends co-bookmarked titles the user hasn't saved", () => {
    const rows = computeItemSimilarity(buildUserVectors(bookmarks, []));
    const scores = scoreForUser(new Map([[2, 1]]), rows); // a new user who saved Aliens
    expect([...scores.keys()]).toContain(1);
    expect(scores.has(2)).toBe(false); // never recommends what you already have
    expect(scores.get(1)!.because).toBe(2);
  });
});

const item = (id: number, genreIds: number[], popularity = 10): MediaItem => ({
  id,
  mediaType: "movie",
  title: `Title ${id}`,
  overview: "",
  year: 2020,
  releaseDate: null,
  posterPath: null,
  backdropPath: null,
  genreIds,
  rating: 7,
  popularity,
});

describe("hybrid ranking", () => {
  it("leans on content-based scores at cold start", () => {
    expect(weightsFor(2, true).content).toBeGreaterThan(weightsFor(20, true).content);
    expect(weightsFor(20, false).cf).toBe(0);
  });

  it("ranks by the weighted blend and explains with the strongest part", () => {
    const cands: Candidate[] = [
      { key: "movie:1", item: item(1, [878]), cf: 1, content: 0.2, cfReason: "Popular with people who saved Alien" },
      { key: "movie:2", item: item(2, [878]), cf: 0, content: 0.9, contentReason: "You like Science Fiction" },
    ];
    const ranked = blend(cands, { cf: 0.5, content: 0.35, popularity: 0.15 });
    expect(ranked[0].item.id).toBe(1);
    expect(ranked[0].reason).toMatch(/Alien/);
    expect(ranked[1].reason).toMatch(/Science Fiction/);
  });

  it("caps any one genre at 40% of the shelf when alternatives exist", () => {
    const ranked = [
      ...Array.from({ length: 8 }, (_, i) => ({ item: item(i, [27]), score: 1 - i * 0.01, reason: "" })),
      ...Array.from({ length: 4 }, (_, i) => ({ item: item(100 + i, [35]), score: 0.5, reason: "" })),
    ];
    const picked = diversify(ranked, 10);
    expect(picked).toHaveLength(10);
    expect(picked.slice(0, 8).filter((r) => r.item.genreIds[0] === 27).length).toBe(4);
  });

  it("varies repeated explanations without changing the order", () => {
    const ranked = [1, 2, 3, 4, 5].map((id) => ({ item: item(id, [878]), score: 1 - id / 10, reason: "Popular with people who saved Alien" }));
    const alt = (r: { item: { id: number } }) => (r.item.id === 5 ? undefined : `Because you bookmarked Title ${r.item.id * 10}`);
    const out = varyReasons(ranked, alt, 2);
    expect(out.map((r) => r.item.id)).toEqual([1, 2, 3, 4, 5]); // same ranking
    expect(out.filter((r) => r.reason === "Popular with people who saved Alien")).toHaveLength(3); // 2 + one with no alternative
    expect(out[2].reason).toBe("Because you bookmarked Title 30");
    expect(out[4].reason).toBe("Popular with people who saved Alien");
  });

  it("scores genre overlap with cosine similarity", () => {
    const aff = new Map([
      [878, 3],
      [28, 1],
    ]);
    expect(genreMatch([878], aff)).toBeGreaterThan(genreMatch([28], aff));
    expect(genreMatch([35], aff)).toBe(0);
  });
});
