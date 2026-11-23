import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/lib/tmdb/types";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/tmdb", () => ({ tmdb: {} }));
vi.mock("@/lib/recs/recommend", () => ({ getRecommendations: vi.fn() }));

const { renderDigest, unsubscribeUrl, verifyUnsubscribe } = await import("./digest");

const item = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: 1396,
  mediaType: "tv",
  title: "Breaking Bad",
  overview: "",
  year: 2008,
  releaseDate: "2008-01-20",
  posterPath: "/poster.jpg",
  backdropPath: null,
  genreIds: [18],
  rating: 8.9,
  popularity: 1,
  ...over,
});

describe("renderDigest", () => {
  it("sends nothing when there's nothing new", () => {
    expect(renderDigest({ name: "Sam", alerts: [], picks: [], unseenShares: 0 }, "https://x/u")).toBeNull();
  });

  it("leads with season news and links each title", () => {
    const out = renderDigest(
      {
        name: "Sam",
        alerts: [{ message: "Season 6 announced", item: item() }],
        picks: [{ item: item({ id: 603, mediaType: "movie", title: "The Matrix", year: 1999 }), reason: "You like Sci-Fi" }],
        unseenShares: 2,
      },
      "https://site/api/digest/unsubscribe?u=1&t=abc",
    )!;
    expect(out.subject).toBe("New season news for Breaking Bad");
    expect(out.html).toContain("/title/tv/1396");
    expect(out.html).toContain("/title/movie/603");
    expect(out.html).toContain("You like Sci-Fi");
    expect(out.html).toContain("w154/poster.jpg"); // small poster size, not w780
    expect(out.html).toContain("https://site/api/digest/unsubscribe?u=1&t=abc");
    expect(out.text).toContain("Friends shared 2 title(s)");
  });

  it("escapes names and titles", () => {
    const out = renderDigest(
      { name: "<script>", alerts: [], picks: [{ item: item({ title: 'Tom & "Jerry"' }) }], unseenShares: 0 },
      "u",
    )!;
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("Tom &amp; &quot;Jerry&quot;");
    expect(out.subject).toBe("Your weekly picks from Screening Room");
  });
});

describe("unsubscribe links", () => {
  it("verify for the right user only", () => {
    vi.stubEnv("SESSION_PASSWORD", "x".repeat(32));
    const url = new URL(unsubscribeUrl("user-1"));
    const token = url.searchParams.get("t")!;
    expect(url.searchParams.get("u")).toBe("user-1");
    expect(verifyUnsubscribe("user-1", token)).toBe(true);
    expect(verifyUnsubscribe("user-2", token)).toBe(false);
    expect(verifyUnsubscribe("user-1", token.slice(1))).toBe(false);
    vi.unstubAllEnvs();
  });
});
