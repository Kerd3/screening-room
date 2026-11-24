import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/tmdb", () => ({ tmdb: {} }));

const { HANDLE_PATTERN, loadPublicProfile, makeHandle } = await import("./publicProfile");

describe("makeHandle", () => {
  it("turns a display name into a readable, valid address", () => {
    const h = makeHandle("Riley Demo");
    expect(h).toMatch(/^riley-demo-[0-9a-f]{4}$/);
    expect(HANDLE_PATTERN.test(h)).toBe(true);
  });
  it("strips accents and symbols, and falls back for names with no letters", () => {
    expect(makeHandle("José Ñúñez!!")).toMatch(/^jose-nunez-[0-9a-f]{4}$/);
    expect(makeHandle("🎬🎬")).toMatch(/^viewer-[0-9a-f]{4}$/);
  });
  it("adds a different suffix each time", () => {
    expect(new Set(Array.from({ length: 20 }, () => makeHandle("Sam"))).size).toBeGreaterThan(15);
  });
});

it("rejects malformed handles without touching the database", async () => {
  await expect(loadPublicProfile("../etc/passwd")).resolves.toBeNull();
  await expect(loadPublicProfile("AB")).resolves.toBeNull();
});
