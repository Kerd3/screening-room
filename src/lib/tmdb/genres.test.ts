import { describe, expect, it } from "vitest";
import { genresFor } from "./genres";

describe("genresFor", () => {
  it("lists genre filters alphabetically, not by TMDB id", () => {
    for (const type of ["movie", "tv"] as const) {
      const names = genresFor(type).map((g) => g.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
    expect(genresFor("movie")[0].name).toBe("Action");
  });
});
