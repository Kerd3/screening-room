/**
 * Offline evaluation of the recommender with a hold-out test.
 *
 * For every user with enough positive signals, a random 20% of the titles they
 * liked (bookmarked, or rated 6 or higher) is hidden. Each strategy is trained
 * only on what's left, ranks the local catalog, and is scored on how many
 * hidden titles appear in its top k. Several random splits are averaged.
 *
 * The strategies reuse the production scoring functions, so this measures the
 * real ranking logic. One difference: production also pulls candidates from
 * TMDB, while offline evaluation ranks the local catalog only, so no network
 * calls are made and results are reproducible.
 */
import {
  buildUserVectors,
  CF_PARAMS,
  computeItemSimilarity,
  scoreForUser,
  type CfParams,
  type SimilarityRow,
} from "./collaborative";
import {
  blend,
  DIVERSITY_SHARE,
  diversify,
  genreMatch,
  normalize,
  WARM_WEIGHTS,
  weightsFor,
  type Candidate,
  type Weights,
} from "./hybrid";
import { computeAffinity, type Signal } from "./signals";
import type { MediaItem } from "@/lib/tmdb/types";

export interface Interaction {
  userId: string;
  titleId: number;
  kind: "bookmark" | "rating";
  score?: number;
  at: Date;
}

export interface CatalogEntry {
  titleId: number;
  item: MediaItem;
}

export const isPositive = (i: Interaction) => i.kind === "bookmark" || (i.score ?? 0) >= 6;

/** Small deterministic RNG so every run with the same seed gives the same split. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Split {
  train: Interaction[];
  /** userId -> titles hidden from training that the user actually liked */
  test: Map<string, Set<number>>;
}

/**
 * Hides a fraction of each user's liked titles. Every interaction with a
 * hidden title (its bookmark and its rating) leaves the training set, so
 * nothing leaks. Users with fewer than `minPositives` liked titles are kept
 * entirely in training and not evaluated.
 */
export function splitByUser(
  interactions: Interaction[],
  { testFraction = 0.2, minPositives = 5, seed = 1 } = {},
): Split {
  const rand = mulberry32(seed);
  const liked = new Map<string, Set<number>>();
  for (const i of interactions) {
    if (!isPositive(i)) continue;
    let s = liked.get(i.userId);
    if (!s) liked.set(i.userId, (s = new Set()));
    s.add(i.titleId);
  }

  const test = new Map<string, Set<number>>();
  // Sorted users and titles keep the split independent of database row order.
  for (const userId of [...liked.keys()].sort()) {
    const titles = [...liked.get(userId)!].sort((a, b) => a - b);
    if (titles.length < minPositives) continue;
    const k = Math.max(1, Math.round(titles.length * testFraction));
    test.set(userId, new Set(shuffle(titles, rand).slice(0, k)));
  }

  const train = interactions.filter((i) => !test.get(i.userId)?.has(i.titleId));
  return { train, test };
}

// ---- metrics (binary relevance) ------------------------------------------

const hits = (recs: number[], relevant: Set<number>, k: number) =>
  recs.slice(0, k).filter((r) => relevant.has(r)).length;

export const precisionAtK = (recs: number[], relevant: Set<number>, k: number) => hits(recs, relevant, k) / k;

export const recallAtK = (recs: number[], relevant: Set<number>, k: number) =>
  relevant.size ? hits(recs, relevant, k) / relevant.size : 0;

export const hitRateAtK = (recs: number[], relevant: Set<number>, k: number) =>
  hits(recs, relevant, k) > 0 ? 1 : 0;

/** Normalized discounted cumulative gain: rewards putting hits near the top. */
export function ndcgAtK(recs: number[], relevant: Set<number>, k: number) {
  let dcg = 0;
  recs.slice(0, k).forEach((r, i) => {
    if (relevant.has(r)) dcg += 1 / Math.log2(i + 2);
  });
  let ideal = 0;
  for (let i = 0; i < Math.min(k, relevant.size); i++) ideal += 1 / Math.log2(i + 2);
  return ideal ? dcg / ideal : 0;
}

// ---- strategies ------------------------------------------------------------

export interface UserContext {
  userId: string;
  /** titleId -> implicit weight (bookmark 1, rating >= 6 counts score/10) */
  liked: Map<number, number>;
  /** everything the user interacted with in training (never recommended back) */
  seen: Set<number>;
  affinity: Map<number, number>;
  signalCount: number;
}

export interface SharedContext {
  catalog: CatalogEntry[];
  /** Item-similarity table for the given collaborative settings (memoized per split). */
  similarityFor: (params?: CfParams) => SimilarityRow[];
  rand: () => number;
}

export type Strategy = (user: UserContext, shared: SharedContext, k: number) => number[];

const byPopularity = (a: CatalogEntry, b: CatalogEntry) => b.item.popularity - a.item.popularity;
const unseen = (user: UserContext, shared: SharedContext) => shared.catalog.filter((c) => !user.seen.has(c.titleId));

function cfScores(user: UserContext, shared: SharedContext, params: CfParams = CF_PARAMS) {
  return scoreForUser(user.liked, shared.similarityFor(params), params);
}

/**
 * Ranks with the production blend. Defaults to the production weights, genre
 * cap and collaborative settings; the tuners pass alternatives.
 * diversityShare 1 means no cap.
 */
export function makeHybrid({
  warm = WARM_WEIGHTS,
  diversityShare = DIVERSITY_SHARE,
  cf: cfParams = CF_PARAMS,
}: { warm?: Weights; diversityShare?: number; cf?: CfParams } = {}): Strategy {
  return (user, shared, k) => {
    const cf = cfScores(user, shared, cfParams);
    const norm = normalize([...cf.values()].map((s) => s.score));
    const candidates: Candidate[] = unseen(user, shared).map((c) => ({
      key: String(c.titleId),
      item: { ...c.item, id: c.titleId },
      cf: norm(cf.get(c.titleId)?.score ?? 0),
      content: Math.max(0, genreMatch(c.item.genreIds, user.affinity)),
    }));
    const ranked = blend(candidates, weightsFor(user.signalCount, cf.size > 0, warm));
    return diversify(ranked, k, diversityShare).map((r) => r.item.id);
  };
}

export const STRATEGIES: Record<string, Strategy> = {
  /** Lower bound: any useful strategy must beat this. */
  random: (user, shared, k) => shuffle(unseen(user, shared), shared.rand).slice(0, k).map((c) => c.titleId),
  /** The most common baseline: the same popular titles for everyone. */
  popularity: (user, shared, k) => unseen(user, shared).sort(byPopularity).slice(0, k).map((c) => c.titleId),
  /** Genre profile only. */
  "content-based": (user, shared, k) =>
    unseen(user, shared)
      .map((c) => ({ c, s: genreMatch(c.item.genreIds, user.affinity) }))
      .sort((a, b) => b.s - a.s || byPopularity(a.c, b.c))
      .slice(0, k)
      .map((x) => x.c.titleId),
  /** Item-item collaborative filtering; padded with popular titles when it has too few. */
  collaborative: (user, shared, k) => {
    const cf = cfScores(user, shared);
    const ranked = [...cf.entries()].sort((a, b) => b[1].score - a[1].score).map(([t]) => t);
    const pad = unseen(user, shared).sort(byPopularity).map((c) => c.titleId);
    return [...new Set([...ranked, ...pad])].filter((t) => !user.seen.has(t)).slice(0, k);
  },
  hybrid: makeHybrid({ diversityShare: 1 }),
  "hybrid + diversity (production)": makeHybrid(),
};

// ---- harness -------------------------------------------------------------

export interface StrategyResult {
  strategy: string;
  precision: number;
  recall: number;
  ndcg: number;
  hitRate: number;
  /** Share of the catalog that appears in anyone's top k. */
  coverage: number;
}

export interface EvaluationReport {
  k: number;
  seeds: number[];
  usersEvaluated: number;
  catalogSize: number;
  interactions: number;
  results: StrategyResult[];
}

function buildUsers(train: Interaction[], catalog: Map<number, CatalogEntry>): Map<string, UserContext> {
  const signals = new Map<string, Signal[]>();
  const users = new Map<string, UserContext>();
  for (const i of train) {
    let u = users.get(i.userId);
    if (!u) {
      u = { userId: i.userId, liked: new Map(), seen: new Set(), affinity: new Map(), signalCount: 0 };
      users.set(i.userId, u);
    }
    u.seen.add(i.titleId);
    u.signalCount++;
    if (isPositive(i)) {
      const w = i.kind === "bookmark" ? 1 : (i.score ?? 0) / 10;
      u.liked.set(i.titleId, Math.max(u.liked.get(i.titleId) ?? 0, w));
    }
    const genreIds = catalog.get(i.titleId)?.item.genreIds ?? [];
    const list = signals.get(i.userId) ?? [];
    list.push(i.kind === "bookmark" ? { kind: "bookmark", at: i.at, genreIds } : { kind: "rating", at: i.at, genreIds, score: i.score });
    signals.set(i.userId, list);
  }
  for (const [id, u] of users) u.affinity = computeAffinity(signals.get(id) ?? []);
  return users;
}

export function evaluate(
  interactions: Interaction[],
  catalogList: CatalogEntry[],
  { k = 10, seeds = [1, 2, 3, 4, 5], strategies = STRATEGIES } = {},
): EvaluationReport {
  const catalog = new Map(catalogList.map((c) => [c.titleId, c]));
  const totals = new Map<string, { p: number; r: number; n: number; h: number; count: number; recommended: Set<number> }>();
  let usersEvaluated = 0;

  for (const seed of seeds) {
    const { train, test } = splitByUser(interactions, { seed });
    usersEvaluated = test.size;
    const bookmarks = train.filter((i) => i.kind === "bookmark").map(({ userId, titleId }) => ({ userId, titleId }));
    const ratings = train
      .filter((i) => i.kind === "rating")
      .map(({ userId, titleId, score }) => ({ userId, titleId, score: score ?? 0 }));
    const vectors = buildUserVectors(bookmarks, ratings);
    const tables = new Map<string, SimilarityRow[]>();
    const shared: SharedContext = {
      catalog: catalogList,
      similarityFor: (p = CF_PARAMS) => {
        const key = `${p.minCoCount}:${p.neighbors}:${p.shrinkage}`;
        let rows = tables.get(key);
        if (!rows) tables.set(key, (rows = computeItemSimilarity(vectors, p)));
        return rows;
      },
      rand: mulberry32(seed * 7919),
    };
    const users = buildUsers(train, catalog);

    for (const [name, strategy] of Object.entries(strategies)) {
      const t = totals.get(name) ?? { p: 0, r: 0, n: 0, h: 0, count: 0, recommended: new Set<number>() };
      for (const [userId, relevant] of test) {
        const user = users.get(userId);
        if (!user) continue;
        const recs = strategy(user, shared, k);
        recs.forEach((r) => t.recommended.add(r));
        t.p += precisionAtK(recs, relevant, k);
        t.r += recallAtK(recs, relevant, k);
        t.n += ndcgAtK(recs, relevant, k);
        t.h += hitRateAtK(recs, relevant, k);
        t.count++;
      }
      totals.set(name, t);
    }
  }

  const results = [...totals.entries()].map(([strategy, t]) => ({
    strategy,
    precision: t.p / t.count,
    recall: t.r / t.count,
    ndcg: t.n / t.count,
    hitRate: t.h / t.count,
    coverage: t.recommended.size / catalogList.length,
  }));
  return { k, seeds, usersEvaluated, catalogSize: catalogList.length, interactions: interactions.length, results };
}

export function toMarkdownTable(report: EvaluationReport) {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const k = report.k;
  const rows = report.results.map(
    (r) => `| ${r.strategy} | ${pct(r.precision)} | ${pct(r.recall)} | ${r.ndcg.toFixed(3)} | ${pct(r.hitRate)} | ${pct(r.coverage)} |`,
  );
  return [
    `| Strategy | Precision@${k} | Recall@${k} | NDCG@${k} | Hit rate@${k} | Catalog coverage |`,
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}
