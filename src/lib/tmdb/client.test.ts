import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { TieredCache } from "./cache";
import { createTmdbClient, TmdbConfigError, TmdbError } from "./client";
import { TokenBucket } from "./rateLimiter";
import { toPaged } from "./normalize";
import type { TmdbPaged } from "./types";

const API = "https://api.themoviedb.org/3";
let hits = 0;

const server = setupServer(
  http.get(`${API}/trending/all/week`, ({ request }) => {
    hits++;
    expect(request.headers.get("authorization")).toBe("Bearer test-token");
    return HttpResponse.json({
      page: 1,
      total_pages: 900,
      total_results: 2,
      results: [
        { id: 1, media_type: "movie", title: "Film", release_date: "2024-05-01", genre_ids: [28] },
        { id: 2, media_type: "tv", name: "Series", first_air_date: "2019-01-01", genre_ids: [18] },
        { id: 3, media_type: "person", name: "Somebody" },
      ],
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  hits = 0;
});
afterAll(() => server.close());

const makeClient = (token = "test-token") =>
  createTmdbClient({
    token: () => token || undefined,
    cache: new TieredCache(null),
    limiter: new TokenBucket(1000),
  });

describe("tmdb client", () => {
  it("fetches, normalizes and caches", async () => {
    const tmdb = makeClient();
    const raw = await tmdb.get<TmdbPaged>("/trending/all/week");
    await tmdb.get<TmdbPaged>("/trending/all/week");
    expect(hits).toBe(1);

    const paged = toPaged(raw);
    expect(paged.totalPages).toBe(500); // clamped to TMDB's page limit
    expect(paged.results.map((r) => [r.mediaType, r.title, r.year])).toEqual([
      ["movie", "Film", 2024],
      ["tv", "Series", 2019],
    ]);
  });

  it("retries after a 429 and records it", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/movie/popular`, () => {
        calls++;
        if (calls === 1) return new HttpResponse(null, { status: 429, headers: { "Retry-After": "0" } });
        return HttpResponse.json({ page: 1, total_pages: 1, total_results: 0, results: [] });
      }),
    );
    const tmdb = makeClient();
    await tmdb.get("/movie/popular");
    expect(calls).toBe(2);
    expect(tmdb.runtime.rateLimited429).toBe(1);
    expect(tmdb.runtime.retries).toBe(1);
  });

  it("does not retry a 404", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/movie/999`, () => {
        calls++;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    await expect(makeClient().get("/movie/999", {}, "detail")).rejects.toBeInstanceOf(TmdbError);
    expect(calls).toBe(1);
  });

  it("fails clearly when no token is configured", async () => {
    await expect(makeClient("").get("/trending/all/week")).rejects.toBeInstanceOf(
      TmdbConfigError,
    );
  });
});
