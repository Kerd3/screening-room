/**
 * Demo data so collaborative filtering has something to learn from on a fresh
 * install. All users are synthetic and use reserved example.com addresses.
 *
 *   npm run db:seed
 *
 * With TMDB_READ_TOKEN set: imports about 300 popular titles and creates 40
 * users whose bookmarks and ratings follow genre "taste profiles". Without a
 * token, it creates only the demo login.
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

/** Taste profiles: canonical genre ids each persona leans toward. */
const PERSONAS: { name: string; genres: number[] }[] = [
  { name: "space and action", genres: [878, 28, 12] },
  { name: "crime and drama", genres: [80, 18, 53] },
  { name: "comedy and family", genres: [35, 10751, 16] },
  { name: "horror and thrillers", genres: [27, 53, 9648] },
  { name: "fantasy and adventure", genres: [14, 12, 16] },
  { name: "romance and drama", genres: [10749, 18, 35] },
  { name: "documentary and history", genres: [99, 36, 10752] },
];

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
  for (let i = 0; i < 40; i++) {
    const persona = i % PERSONAS.length;
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
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

  // Each user bookmarks titles in proportion to how well they fit the persona,
  // plus a little noise, then rates about a third of what they saved.
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
  for (const u of users) {
    const taste = PERSONAS[u.persona].genres;
    const fit = (item: MediaItem) => canonicalGenres(item.genreIds).filter((g) => taste.includes(g)).length;
    const target = 15 + Math.floor(rand() * 20);
    const chosen = new Set<number>();
    for (let tries = 0; chosen.size < target && tries < 4000; tries++) {
      const item = pick(catalog);
      const p = fit(item) > 0 ? 0.35 + 0.2 * fit(item) : 0.03;
      if (rand() < p) chosen.add(item.localId);
    }
    const byId = new Map(catalog.map((c) => [c.localId, c]));
    for (const titleId of chosen) {
      const at = daysAgo(Math.floor(rand() * 90));
      await db.bookmark.create({ data: { userId: u.id, titleId, createdAt: at } });
      if (rand() < 0.35) {
        const f = fit(byId.get(titleId)!);
        const score = Math.min(10, Math.max(1, Math.round(5 + f * 1.5 + (rand() * 3 - 1))));
        await db.rating.create({ data: { userId: u.id, titleId, score, createdAt: at, updatedAt: at } });
      }
    }
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
