import { describe, expect, it } from "vitest";
import { detectRegion } from "./region";
import { toWatchOptions } from "./tmdb/normalize";

describe("detectRegion", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("prefers Vercel's IP country", () => {
    expect(detectRegion(h({ "x-vercel-ip-country": "ph", "accept-language": "en-GB" }))).toBe("PH");
  });
  it("falls back to the browser language region, then the US", () => {
    expect(detectRegion(h({ "accept-language": "en-GB,en;q=0.9" }))).toBe("GB");
    expect(detectRegion(h({ "accept-language": "fil-PH" }))).toBe("PH");
    expect(detectRegion(h({ "accept-language": "en" }))).toBe("US");
    expect(detectRegion(h({}))).toBe("US");
  });
});

describe("toWatchOptions", () => {
  const p = (id: number, name: string, prio: number) => ({ provider_id: id, provider_name: name, logo_path: `/${id}.png`, display_priority: prio });
  const raw = {
    id: 1,
    results: {
      US: {
        link: "https://www.themoviedb.org/movie/1/watch?locale=US",
        flatrate: [p(2, "Max", 5), p(1, "Netflix", 1)],
        free: [p(3, "Tubi", 9)],
        ads: [p(1, "Netflix", 1)], // also on a free tier: listed once
        rent: [p(10, "Apple TV", 3)],
      },
      PH: { link: "https://example.test", buy: [p(10, "Apple TV", 3)] },
    },
  };

  it("merges subscription, free and ad-supported into Stream, by priority, without duplicates", () => {
    const o = toWatchOptions(raw, "US");
    expect(o.stream.map((s) => s.name)).toEqual(["Netflix", "Max", "Tubi"]);
    expect(o.rent.map((s) => s.name)).toEqual(["Apple TV"]);
    expect(o.buy).toEqual([]);
    expect(o.regions).toEqual(["PH", "US"]);
  });

  it("returns empty groups for a country with no availability", () => {
    const o = toWatchOptions(raw, "DE");
    expect([o.stream, o.rent, o.buy, o.link]).toEqual([[], [], [], null]);
    expect(o.regions).toContain("US");
  });
});
