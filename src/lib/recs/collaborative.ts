/**
 * Item-item collaborative filtering over implicit feedback.
 *
 * Each user is a sparse vector over titles: a bookmark counts 1, and a rating
 * of 6 or more counts score/10. Lower ratings are left out, because "watched and
 * disliked" isn't evidence that two titles go together. Similarity between two
 * titles is the cosine of their user vectors, kept only when at least
 * MIN_CO_COUNT users share both.
 */

export type UserVectors = Map<string, Map<number, number>>; // userId -> titleId -> weight

export const MIN_CO_COUNT = 2;
export const NEIGHBORS_PER_ITEM = 30;
const MAX_ITEMS_PER_USER = 300; // bounds the O(k^2) pair loop for heavy users

export interface SimilarityRow {
  titleAId: number;
  titleBId: number; // titleAId < titleBId
  score: number;
  coCount: number;
}

export function buildUserVectors(
  bookmarks: { userId: string; titleId: number }[],
  ratings: { userId: string; titleId: number; score: number }[],
): UserVectors {
  const users: UserVectors = new Map();
  const put = (u: string, t: number, w: number) => {
    let v = users.get(u);
    if (!v) users.set(u, (v = new Map()));
    v.set(t, Math.max(v.get(t) ?? 0, w));
  };
  for (const b of bookmarks) put(b.userId, b.titleId, 1);
  for (const r of ratings) if (r.score >= 6) put(r.userId, r.titleId, r.score / 10);
  return users;
}

export function computeItemSimilarity(users: UserVectors): SimilarityRow[] {
  const norms = new Map<number, number>(); // titleId -> sum of squared weights
  const dots = new Map<string, { dot: number; co: number }>();

  for (const vec of users.values()) {
    const items = [...vec.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_ITEMS_PER_USER);
    for (const [t, w] of items) norms.set(t, (norms.get(t) ?? 0) + w * w);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const [a, wa] = items[i][0] < items[j][0] ? items[i] : items[j];
        const [b, wb] = items[i][0] < items[j][0] ? items[j] : items[i];
        const key = `${a}:${b}`;
        const cell = dots.get(key) ?? { dot: 0, co: 0 };
        cell.dot += wa * wb;
        cell.co += 1;
        dots.set(key, cell);
      }
    }
  }

  const rows: SimilarityRow[] = [];
  for (const [key, { dot, co }] of dots) {
    if (co < MIN_CO_COUNT) continue;
    const [a, b] = key.split(":").map(Number);
    const score = dot / Math.sqrt(norms.get(a)! * norms.get(b)!);
    rows.push({ titleAId: a, titleBId: b, score, coCount: co });
  }
  return keepTopNeighbors(rows, NEIGHBORS_PER_ITEM);
}

/** Keeps a pair if it ranks in the top N for either of its two titles. */
function keepTopNeighbors(rows: SimilarityRow[], n: number) {
  const byItem = new Map<number, SimilarityRow[]>();
  for (const r of rows) {
    for (const id of [r.titleAId, r.titleBId]) {
      const list = byItem.get(id) ?? [];
      list.push(r);
      byItem.set(id, list);
    }
  }
  const keep = new Set<SimilarityRow>();
  for (const list of byItem.values()) {
    list.sort((x, y) => y.score - x.score || y.coCount - x.coCount);
    for (const r of list.slice(0, n)) keep.add(r);
  }
  return [...keep];
}

/**
 * Scores unseen titles for one user: the similarity-weighted sum over the
 * titles they already like, so a title close to several favorites outranks one
 * close to a single favorite. Callers normalize to 0..1. Also returns the
 * strongest "because" title for an explanation.
 */
export function scoreForUser(
  userItems: Map<number, number>,
  neighbors: SimilarityRow[],
): Map<number, { score: number; because: number }> {
  const acc = new Map<number, { sum: number; because: number; best: number }>();
  for (const r of neighbors) {
    for (const [mine, other] of [
      [r.titleAId, r.titleBId],
      [r.titleBId, r.titleAId],
    ]) {
      const w = userItems.get(mine);
      if (w === undefined || userItems.has(other)) continue;
      const cell = acc.get(other) ?? { sum: 0, because: mine, best: 0 };
      // Weighting by co-count damps pairs supported by only a couple of users.
      const contribution = w * r.score * Math.min(1, r.coCount / 5);
      cell.sum += contribution;
      if (contribution > cell.best) {
        cell.best = contribution;
        cell.because = mine;
      }
      acc.set(other, cell);
    }
  }
  const out = new Map<number, { score: number; because: number }>();
  for (const [t, c] of acc) out.set(t, { score: c.sum, because: c.because });
  return out;
}

// ---- persistence (server only) -------------------------------------------

const g = globalThis as unknown as { __simRebuild?: { running: boolean; lastRun: number } };
const state = (g.__simRebuild ??= { running: false, lastRun: 0 });

/**
 * Throttled rebuild for request handlers (run it inside next/server `after()`
 * so it finishes after the response on serverless). Skips if one is already
 * running here or ran in the last 30 seconds; the next signal picks up the slack.
 */
export async function maybeRebuildSimilarity(minIntervalMs = 30_000) {
  if (state.running || Date.now() - state.lastRun < minIntervalMs) return;
  state.running = true;
  try {
    await rebuildSimilarity();
  } catch (e) {
    console.error("similarity rebuild failed", e);
  } finally {
    state.running = false;
    state.lastRun = Date.now();
  }
}

export async function rebuildSimilarity() {
  const { db } = await import("@/lib/db");
  const [bookmarks, ratings] = await Promise.all([
    db.bookmark.findMany({ select: { userId: true, titleId: true } }),
    db.rating.findMany({ select: { userId: true, titleId: true, score: true } }),
  ]);
  const rows = computeItemSimilarity(buildUserVectors(bookmarks, ratings));
  const computedAt = new Date();
  await db.$transaction(
    async (tx) => {
      await tx.itemSimilarity.deleteMany();
      for (let i = 0; i < rows.length; i += 1000) {
        await tx.itemSimilarity.createMany({
          data: rows.slice(i, i + 1000).map((r) => ({ ...r, computedAt })),
        });
      }
    },
    { timeout: 60_000, maxWait: 10_000 }, // a remote database needs more than the 5s default
  );
  return rows.length;
}
