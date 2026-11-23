import { describe, expect, it } from "vitest";
import { chunk, parseCsv, parseImport } from "./importCsv";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"Hello, world","Say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["Hello, world", 'Say "hi"'],
    ]);
  });
  it("keeps newlines inside quoted fields and drops blank lines", () => {
    expect(parseCsv('x,y\n"line1\nline2",2\n\n')).toEqual([
      ["x", "y"],
      ["line1\nline2", "2"],
    ]);
  });
  it("strips a byte-order mark", () => {
    expect(parseCsv("﻿Name\nA")[0]).toEqual(["Name"]);
  });
});

describe("parseImport: Letterboxd", () => {
  it("reads watched.csv", () => {
    const p = parseImport(
      "Date,Name,Year,Letterboxd URI\n2024-03-01,Parasite,2019,https://boxd.it/x\n2024-03-02,\"Crouching Tiger, Hidden Dragon\",2000,https://boxd.it/y\n",
    );
    expect(p.source).toBe("letterboxd");
    expect(p.hasRatings).toBe(false);
    expect(p.rows).toEqual([
      { title: "Parasite", year: 2019, mediaType: "movie", rating: undefined, date: "2024-03-01" },
      { title: "Crouching Tiger, Hidden Dragon", year: 2000, mediaType: "movie", rating: undefined, date: "2024-03-02" },
    ]);
  });

  it("converts 0.5-5 stars to 1-10 and prefers the diary's Watched Date", () => {
    const p = parseImport(
      "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-05-10,Heat,1995,u,4.5,,,2024-05-08\n2024-05-11,Cats,2019,u,0.5,,,\n",
    );
    expect(p.hasRatings).toBe(true);
    expect(p.rows[0]).toMatchObject({ title: "Heat", rating: 9, date: "2024-05-08" });
    expect(p.rows[1]).toMatchObject({ title: "Cats", rating: 1, date: "2024-05-11" });
  });
});

describe("parseImport: IMDb", () => {
  const header =
    "Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors";

  it("reads ratings with ids and media types, skipping episodes", () => {
    const p = parseImport(
      [
        header,
        "tt0111161,10,2023-01-02,The Shawshank Redemption,,u,Movie,9.3,142,1994,Drama,1,1994-10-14,Frank Darabont",
        "tt0903747,9,2023-02-03,Breaking Bad,,u,TV Series,9.5,49,2008,Drama,1,2008-01-20,",
        "tt0959621,8,2023-02-04,Pilot,,u,TV Episode,9.0,58,2008,Drama,1,2008-01-20,",
      ].join("\n"),
    );
    expect(p.source).toBe("imdb");
    expect(p.hasRatings).toBe(true);
    expect(p.skipped).toBe(1);
    expect(p.rows).toEqual([
      { imdbId: "tt0111161", title: "The Shawshank Redemption", year: 1994, mediaType: "movie", rating: 10, date: "2023-01-02" },
      { imdbId: "tt0903747", title: "Breaking Bad", year: 2008, mediaType: "tv", rating: 9, date: "2023-02-03" },
    ]);
  });

  it("reads a watchlist (no rating column)", () => {
    const p = parseImport(
      "Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year\n1,tt1375666,2022-07-01,2022-07-01,,Inception,,u,Movie,8.8,148,2010\n",
    );
    expect(p.hasRatings).toBe(false);
    expect(p.rows).toEqual([
      { imdbId: "tt1375666", title: "Inception", year: 2010, mediaType: "movie", rating: undefined, date: "2022-07-01" },
    ]);
  });
});

describe("parseImport: other files", () => {
  it("rejects files from other apps with a helpful message", () => {
    expect(() => parseImport("Title,Year\nHeat,1995")).toThrow(/Letterboxd or IMDb/);
  });
  it("rejects empty files", () => {
    expect(() => parseImport("")).toThrow(/empty/);
  });
});

it("chunk splits into fixed-size batches", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});
