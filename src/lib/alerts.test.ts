import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/tmdb", () => ({ tmdb: {} }));

const { diffSnapshot } = await import("./alerts");

describe("season alerts", () => {
  it("alerts when a new season appears", () => {
    expect(
      diffSnapshot("Severance", { seasonCount: 1, nextEpisodeDate: null }, { seasonCount: 2, nextEpisodeDate: null }),
    ).toEqual({ kind: "NEW_SEASON", message: "Severance season 2 is now listed." });
  });

  it("alerts when a new air date is announced", () => {
    const change = diffSnapshot(
      "The Bear",
      { seasonCount: 3, nextEpisodeDate: null },
      { seasonCount: 3, nextEpisodeDate: "2027-06-23" },
    );
    expect(change?.kind).toBe("NEW_EPISODE_DATE");
    expect(change?.message).toContain("June 23, 2027");
  });

  it("stays quiet when nothing changed", () => {
    const same = { seasonCount: 4, nextEpisodeDate: "2027-01-05" };
    expect(diffSnapshot("Andor", same, same)).toBeNull();
  });
});
