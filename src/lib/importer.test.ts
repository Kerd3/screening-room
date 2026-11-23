import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/tmdb", () => ({ tmdb: { get: (...args: unknown[]) => get(...args) } }));
vi.mock("@/lib/recs/profile", () => ({ onSignal: vi.fn() }));

const { matchRow } = await import("./importer");

const movie = (id: number, title: string, date: string) => ({ id, title, release_date: date, genre_ids: [], vote_average: 7, popularity: 1 });

describe("matchRow", () => {
  beforeEach(() => get.mockReset());

  it("matches IMDb ids exactly through /find, preferring the file's media type", async () => {
    get.mockResolvedValueOnce({
      movie_results: [movie(1, "Breaking Bad Movie", "2019-01-01")],
      tv_results: [{ id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20", genre_ids: [] }],
    });
    const m = await matchRow({ imdbId: "tt0903747", title: "Breaking Bad", mediaType: "tv" });
    expect(get).toHaveBeenCalledWith("/find/tt0903747", { external_source: "imdb_id" }, "detail");
    expect(m).toMatchObject({ id: 1396, mediaType: "tv" });
  });

  it("matches Letterboxd rows by title and year", async () => {
    get.mockResolvedValueOnce({ results: [movie(496243, "Parasite", "2019-05-30")], page: 1, total_pages: 1, total_results: 1 });
    const m = await matchRow({ title: "Parasite", year: 2019, mediaType: "movie" });
    expect(get).toHaveBeenCalledWith("/search/movie", { query: "Parasite", primary_release_year: 2019 }, "search");
    expect(m).toMatchObject({ id: 496243, title: "Parasite" });
  });

  it("allows a year either side when the sites disagree, but not more", async () => {
    get
      .mockResolvedValueOnce({ results: [], page: 1, total_pages: 0, total_results: 0 })
      .mockResolvedValueOnce({
        results: [movie(10, "Heat", "1986-01-01"), movie(949, "Heat", "1995-12-15")],
        page: 1,
        total_pages: 1,
        total_results: 2,
      });
    expect(await matchRow({ title: "Heat", year: 1996, mediaType: "movie" })).toMatchObject({ id: 949 });

    get
      .mockResolvedValueOnce({ results: [], page: 1, total_pages: 0, total_results: 0 })
      .mockResolvedValueOnce({ results: [movie(10, "Heat", "1986-01-01")], page: 1, total_pages: 1, total_results: 1 });
    expect(await matchRow({ title: "Heat", year: 1995, mediaType: "movie" })).toBeNull();
  });
});
