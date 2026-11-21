/**
 * Demo data so collaborative filtering has something to learn from on a fresh
 * install. All users are synthetic and use reserved example.com addresses.
 *
 *   npm run db:seed
 *
 * With TMDB_READ_TOKEN set: imports about 370 popular titles and creates 100
 * users whose bookmarks follow popularity, a genre "taste profile" and a few
 * favorites shared within each profile. Without a token, it creates only the
 * demo login.
 *
 * Demo login: demo@example.com / screening-demo
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import { snapshotTitle } from "@/lib/catalog";
import { toPaged } from "@/lib/tmdb/normalize";
import { canonicalGenres } from "@/lib/tmdb/genres";
import { rebuildSimilarity } from "@/lib/recs/collaborative";
import { rebuildAffinity } from "@/lib/recs/profile";
import type { MediaItem, MediaType, TmdbPaged } from "@/lib/tmdb/types";

// Deterministic RNG, so every seed produces the same demo data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261119);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

/**
 * Taste profiles: canonical genre ids each persona leans toward. An empty list
 * is a "mainstream" viewer who simply follows what's popular.
 */
const PERSONAS: { name: string; genres: number[] }[] = [
  { name: "space and action", genres: [878, 28, 12] },
  { name: "crime and drama", genres: [80, 18, 53] },
  { name: "comedy and family", genres: [35, 10751, 16] },
  { name: "horror and thrillers", genres: [27, 53, 9648] },
  { name: "fantasy and adventure", genres: [14, 12, 16] },
  { name: "romance and drama", genres: [10749, 18, 35] },
  { name: "documentary and history", genres: [99, 36, 10752] },
  { name: "mainstream", genres: [] },
];

const SEED_USERS = 100;
/** Titles each persona's community shares (a "canon"), beyond broad genre taste. */
const FAVORITES_PER_PERSONA = 8;

const FIRST = ["Amara", "Lucas", "Mei", "Tomás", "Priya", "Jonah", "Sofia", "Kwame", "Hana", "Mateo", "Leila", "Oskar", "Nadia", "Ravi", "Elena", "Theo", "Yuki", "Marcus", "Ines", "Dev"];
const LAST = ["Okafor", "Ferreira", "Lin", "Navarro", "Raman", "Becker", "Rossi", "Mensah", "Sato", "Alvarez", "Haddad", "Lund", "Petrova", "Iyer", "Costa", "Walsh", "Mori", "Bell", "Duarte", "Kapoor"];

async function importCatalog(): Promise<(MediaItem & { localId: number })[]> {
  const lists: [string, MediaType][] = [
    ["/movie/popular", "movie"],
    ["/movie/top_rated", "movie"],
    ["/tv/popular", "tv"],
    ["/tv/top_rated", "tv"],
    ["/tv/on_the_air", "tv"],
  ];
  const seen = new Map<string, MediaItem>();
  for (const [path, type] of lists) {
    for (let page = 1; page <= 4; page++) {
      const raw = await tmdb.get<TmdbPaged>(path, { page });
      for (const item of toPaged(raw, type).results) seen.set(`${type}:${item.id}`, item);
    }
  }
  const out: (MediaItem & { localId: number })[] = [];
  for (const item of seen.values()) out.push({ ...item, localId: await snapshotTitle(item) });
  return out;
}

async function main() {
  const passwordHash = await bcrypt.hash("screening-demo", 10);
  const demo = await db.user.upsert({
    where: { email: "demo@example.com" },
    create: { email: "demo@example.com", name: "Riley Demo", passwordHash, preference: { create: {} } },
    update: { passwordHash },
  });
  console.log("Demo login: demo@example.com / screening-demo");

  if (!process.env.TMDB_READ_TOKEN) {
    console.log("TMDB_READ_TOKEN is not set: skipped catalog import and synthetic users.");
    return;
  }

  console.log("Importing catalog from TMDB (cached and rate limited)...");
  const catalog = await importCatalog();
  console.log(`  ${catalog.length} titles`);

  // Clean out earlier synthetic users so the seed can be re-run.
  await db.user.deleteMany({ where: { email: { startsWith: "seed." } } });

  const users: { id: string; persona: number }[] = [];
  for (let i = 0; i < SEED_USERS; i++) {
    const persona = i % PERSONAS.length;
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`;
    const u = await db.user.create({
      data: {
        email: `seed.${i}@example.com`,
        name,
        passwordHash,
        preference: { create: { bookmarksPublic: true } },
      },
    });
    users.push({ id: u.id, persona });
  }

  // How users choose titles, built to look like real behaviour:
  //  1. Popular titles get picked more often, with a long tail (weight = popularity^0.6).
  //  2. Each persona's community shares a few specific favorites, so there is
  //     title-level agreement for collaborative filtering to find, not just genre taste.
  //  3. Genre fit decides whether a picked title is kept; mainstream viewers keep
  //     about a third of whatever is popular.
  // Then about a third of saved titles get a rating that reflects the fit.
  const weights = catalog.map((c) => Math.max(1, c.popularity) ** 0.6);
  const cumulative: number[] = [];
  weights.reduce((sum, w, i) => (cumulative[i] = sum + w), 0);
  const totalWeight = cumulative[cumulative.length - 1];
  const pickPopular = () => {
    const r = rand() * totalWeight;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return catalog[lo];
  };

  const fitFor = (taste: number[]) => (item: MediaItem) =>
    canonicalGenres(item.genreIds).filter((g) => taste.includes(g)).length;
  const favorites = PERSONAS.map((p) => {
    const fit = fitFor(p.genres);
    const pool = p.genres.length ? catalog.filter((c) => fit(c) > 0) : catalog;
    const picks = new Set<number>();
    while (picks.size < Math.min(FAVORITES_PER_PERSONA, pool.length)) picks.add(pick(pool).localId);
    return picks;
  });

  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
  const byId = new Map(catalog.map((c) => [c.localId, c]));
  for (const u of users) {
    const taste = PERSONAS[u.persona].genres;
    const fit = fitFor(taste);
    const keepChance = (item: MediaItem) =>
      taste.length === 0 ? 0.35 : fit(item) > 0 ? 0.3 + 0.2 * fit(item) : 0.04;

    const chosen = new Set<number>();
    for (const id of favorites[u.persona]) if (rand() < 0.45) chosen.add(id);
    const target = 15 + Math.floor(rand() * 20);
    for (let tries = 0; chosen.size < target && tries < 4000; tries++) {
      const item = pickPopular();
      if (rand() < keepChance(item)) chosen.add(item.localId);
    }

    const bookmarks: { userId: string; titleId: number; createdAt: Date }[] = [];
    const ratings: { userId: string; titleId: number; score: number; createdAt: Date; updatedAt: Date }[] = [];
    for (const titleId of chosen) {
      const at = daysAgo(Math.floor(rand() * 90));
      bookmarks.push({ userId: u.id, titleId, createdAt: at });
      if (rand() < 0.35) {
        const f = taste.length ? fit(byId.get(titleId)!) : 1;
        const score = Math.min(10, Math.max(1, Math.round(5 + f * 1.5 + (rand() * 3 - 1))));
        ratings.push({ userId: u.id, titleId, score, createdAt: at, updatedAt: at });
      }
    }
    await db.bookmark.createMany({ data: bookmarks });
    await db.rating.createMany({ data: ratings });
  }

  // A few reviews and social connections for the demo account.
  const [a, b, c, d] = users;
  const friendIds = [a.id, b.id, c.id];
  for (const fid of friendIds) {
    await db.friendship.upsert({
      where: { requesterId_addresseeId: { requesterId: fid, addresseeId: demo.id } },
      create: { requesterId: fid, addresseeId: demo.id, status: "ACCEPTED" },
      update: { status: "ACCEPTED" },
    });
  }
  await db.friendship.upsert({
    where: { requesterId_addresseeId: { requesterId: d.id, addresseeId: demo.id } },
    create: { requesterId: d.id, addresseeId: demo.id, status: "PENDING" },
    update: { status: "PENDING" },
  });
  const airing = catalog.filter((t) => t.mediaType === "tv").slice(0, 3);
  for (const [i, t] of airing.entries()) {
    await db.share.create({
      data: {
        fromUserId: friendIds[i],
        toUserId: demo.id,
        titleId: t.localId,
        note: ["Two episodes in and I'm hooked.", "You'd like the second season most.", null][i],
      },
    });
  }

  console.log("Computing genre profiles and item similarity...");
  for (const u of users) await rebuildAffinity(u.id);
  const pairs = await rebuildSimilarity();
  console.log(`  ${pairs} similar-title pairs stored`);
  console.log("Done. Log in as demo@example.com and bookmark a few titles to see recommendations.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
