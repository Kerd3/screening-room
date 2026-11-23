/**
 * Parses Letterboxd and IMDb export files in the browser. Only the rows the
 * importer needs are sent to the server, in small batches.
 *
 * Letterboxd (Settings > Import & Export > Export your data):
 *   watched.csv / watchlist.csv: Date, Name, Year, Letterboxd URI
 *   ratings.csv:                 Date, Name, Year, Letterboxd URI, Rating (0.5-5)
 *   diary.csv:                   ... Rating, Rewatch, Tags, Watched Date
 * IMDb (Your ratings / Your watchlist > Export):
 *   ratings.csv:   Const, Your Rating (1-10), Date Rated, Title, ..., Title Type, ..., Year
 *   watchlist.csv: Position, Const, Created, Modified, Description, Title, ..., Title Type, ..., Year
 */

export type ImportSource = "letterboxd" | "imdb";
/** What the file is: watched titles, a watchlist (becomes bookmarks) or ratings. */
export type ImportKind = "watched" | "watchlist" | "ratings";

export interface ImportRow {
  /** IMDb id like "tt0111161" (IMDb files only). */
  imdbId?: string;
  title: string;
  year?: number;
  /** "movie" | "tv" when the file says so (IMDb "Title Type"). */
  mediaType?: "movie" | "tv";
  /** Normalized to 1-10. */
  rating?: number;
  /** ISO date (YYYY-MM-DD) the title was watched, rated or added. */
  date?: string;
}

export interface ParsedImport {
  source: ImportSource;
  /** True when the file has a rating column, which makes it a ratings import. */
  hasRatings: boolean;
  rows: ImportRow[];
  /** Rows that couldn't be read (no title). */
  skipped: number;
}

export const MAX_IMPORT_ROWS = 5000;

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines in quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const IMDB_TV_TYPES = /^(tv ?series|tv ?mini ?series|tvseries|tvminiseries)$/i;
const IMDB_SKIP_TYPES = /^(tv ?episode|video ?game|podcast)/i;

function isoDate(s: string | undefined) {
  const m = s?.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

function num(s: string | undefined) {
  const n = Number(s?.trim());
  return s?.trim() && Number.isFinite(n) ? n : undefined;
}

/** Reads a Letterboxd or IMDb export. Throws a user-facing message for other files. */
export function parseImport(text: string): ParsedImport {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new Error("That file is empty.");
  const cols = header.map((h) => h.trim().toLowerCase());
  const col = (name: string) => cols.indexOf(name);
  const get = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() : undefined);

  let source: ImportSource;
  if (col("letterboxd uri") >= 0) source = "letterboxd";
  else if (col("const") >= 0) source = "imdb";
  else throw new Error("That doesn't look like a Letterboxd or IMDb export. Upload the CSV file exactly as exported.");

  if (body.length > MAX_IMPORT_ROWS) {
    throw new Error(`That file has ${body.length} rows. Split it into files of ${MAX_IMPORT_ROWS} rows or fewer.`);
  }

  const rows: ImportRow[] = [];
  let skipped = 0;

  if (source === "letterboxd") {
    const name = col("name"), year = col("year"), rating = col("rating");
    const watchedDate = col("watched date"), loggedDate = col("date");
    for (const r of body) {
      const title = get(r, name);
      if (!title) {
        skipped++;
        continue;
      }
      const stars = num(get(r, rating));
      rows.push({
        title,
        year: num(get(r, year)),
        mediaType: "movie", // Letterboxd lists films
        rating: stars ? Math.min(10, Math.max(1, Math.round(stars * 2))) : undefined,
        date: isoDate(get(r, watchedDate)) ?? isoDate(get(r, loggedDate)),
      });
    }
    return { source, hasRatings: rating >= 0, rows, skipped };
  }

  const id = col("const"), title = col("title"), year = col("year"), type = col("title type");
  const rating = col("your rating");
  const date = col("date rated") >= 0 ? col("date rated") : col("created");
  for (const r of body) {
    const imdbId = get(r, id);
    const name = get(r, title);
    const titleType = get(r, type) ?? "";
    if (!name || !imdbId?.startsWith("tt") || IMDB_SKIP_TYPES.test(titleType)) {
      skipped++;
      continue;
    }
    const score = num(get(r, rating));
    rows.push({
      imdbId,
      title: name,
      year: num(get(r, year)),
      mediaType: IMDB_TV_TYPES.test(titleType) ? "tv" : "movie",
      rating: score ? Math.min(10, Math.max(1, Math.round(score))) : undefined,
      date: isoDate(get(r, date)),
    });
  }
  return { source, hasRatings: rating >= 0, rows, skipped };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
