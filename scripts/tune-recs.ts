/**
 * Tunes the hybrid recommender's blend weights and genre cap with a grid search.
 *
 *   npm run recs:tune             print the search results
 *   npm run recs:tune -- --write  also save docs/recommendation-tuning.md
 *
 * Every candidate is scored on validation splits (seeds 1-5); the best one by
 * NDCG@10 is then re-scored with the current production settings on separate
 * test splits (seeds 101-110). Only the test numbers count as the improvement,
 * because the validation numbers were used to choose.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { titleToMediaItem } from "@/lib/catalog";
import { db } from "@/lib/db";
import { evaluate, makeHybrid, STRATEGIES, type Interaction, type Strategy } from "@/lib/recs/evaluate";
import { DIVERSITY_SHARE, WARM_WEIGHTS, type Weights } from "@/lib/recs/hybrid";

const STEP = 0.05;
const SHARES = [0.3, 0.4, 0.5, 1];
const VALIDATION_SEEDS = [1, 2, 3, 4, 5];
const TEST_SEEDS = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];

const label = (w: Weights, share: number) =>
  `cf ${w.cf.toFixed(2)} / content ${w.content.toFixed(2)} / popularity ${w.popularity.toFixed(2)} / cap ${share >= 1 ? "off" : share}`;

async function main() {
  const [bookmarks, ratings, titles] = await Promise.all([
    db.bookmark.findMany({ select: { userId: true, titleId: true, createdAt: true } }),
    db.rating.findMany({ select: { userId: true, titleId: true, score: true, updatedAt: true } }),
    db.title.findMany(),
  ]);
  const interactions: Interaction[] = [
    ...bookmarks.map((b) => ({ userId: b.userId, titleId: b.titleId, kind: "bookmark" as const, at: b.createdAt })),
    ...ratings.map((r) => ({ userId: r.userId, titleId: r.titleId, kind: "rating" as const, score: r.score, at: r.updatedAt })),
  ];
  const catalog = titles.map((t) => ({ titleId: t.id, item: titleToMediaItem(t) }));

  // Every weight blend on a 0.05 grid that sums to 1, times each genre-cap setting.
  const steps = Math.round(1 / STEP);
  const candidates: Record<string, Strategy> = {};
  const configs = new Map<string, { warm: Weights; share: number }>();
  for (let a = 0; a <= steps; a++) {
    for (let b = 0; a + b <= steps; b++) {
      const warm = { cf: a / steps, content: b / steps, popularity: (steps - a - b) / steps };
      for (const share of SHARES) {
        const name = label(warm, share);
        candidates[name] = makeHybrid({ warm, diversityShare: share });
        configs.set(name, { warm, share });
      }
    }
  }
  const current = label(WARM_WEIGHTS, DIVERSITY_SHARE);
  candidates[current] ??= makeHybrid();
  configs.set(current, { warm: WARM_WEIGHTS, share: DIVERSITY_SHARE });

  console.log(`Searching ${Object.keys(candidates).length} configurations on ${VALIDATION_SEEDS.length} validation splits...`);
  const t0 = performance.now();
  const validation = evaluate(interactions, catalog, { k: 10, seeds: VALIDATION_SEEDS, strategies: candidates });
  const ranked = [...validation.results].sort((x, y) => y.ndcg - x.ndcg);
  console.log(`Done in ${Math.round((performance.now() - t0) / 1000)} s.\n`);

  const best = ranked[0];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const top = ranked.slice(0, 8).map((r, i) => `| ${i + 1} | ${r.strategy} | ${r.ndcg.toFixed(3)} | ${pct(r.recall)} | ${pct(r.coverage)} |`);
  const currentRow = validation.results.find((r) => r.strategy === current)!;
  const currentRank = ranked.findIndex((r) => r.strategy === current) + 1;
  const searchTable = [
    "| Rank | Configuration | NDCG@10 | Recall@10 | Coverage |",
    "|---|---|---|---|---|",
    ...top,
    `| ${currentRank} | ${current} (current) | ${currentRow.ndcg.toFixed(3)} | ${pct(currentRow.recall)} | ${pct(currentRow.coverage)} |`,
  ].join("\n");
  console.log(`Validation (seeds ${VALIDATION_SEEDS.join(", ")}):\n\n${searchTable}\n`);

  // Confirm on unseen splits: the tuned config vs the current one and the baselines.
  const bestConfig = configs.get(best.strategy)!;
  const confirm = evaluate(interactions, catalog, {
    k: 10,
    seeds: TEST_SEEDS,
    strategies: {
      popularity: STRATEGIES.popularity,
      collaborative: STRATEGIES.collaborative,
      "current production": makeHybrid(),
      tuned: makeHybrid({ warm: bestConfig.warm, diversityShare: bestConfig.share }),
    },
  });
  const testTable = [
    "| Strategy | Precision@10 | Recall@10 | NDCG@10 | Hit rate@10 | Coverage |",
    "|---|---|---|---|---|---|",
    ...confirm.results.map(
      (r) => `| ${r.strategy} | ${pct(r.precision)} | ${pct(r.recall)} | ${r.ndcg.toFixed(3)} | ${pct(r.hitRate)} | ${pct(r.coverage)} |`,
    ),
  ].join("\n");
  const cur = confirm.results.find((r) => r.strategy === "current production")!;
  const tuned = confirm.results.find((r) => r.strategy === "tuned")!;
  const change = (a: number, b: number) => `${b >= a ? "+" : ""}${(((b - a) / a) * 100).toFixed(1)}%`;

  // Paired comparison: score both on each test split separately, then look at
  // the per-split difference. Ship only if the gain is clearly above the noise
  // (mean difference more than two standard errors above zero).
  const diffs = TEST_SEEDS.map((seed) => {
    const r = evaluate(interactions, catalog, {
      k: 10,
      seeds: [seed],
      strategies: {
        current: makeHybrid(),
        tuned: makeHybrid({ warm: bestConfig.warm, diversityShare: bestConfig.share }),
      },
    }).results;
    return r.find((x) => x.strategy === "tuned")!.ndcg - r.find((x) => x.strategy === "current")!.ndcg;
  });
  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - mean) ** 2, 0) / (diffs.length - 1));
  const se = sd / Math.sqrt(diffs.length);
  const significant = mean - 2 * se > 0;
  const isCurrent = best.strategy === current;

  const verdict =
    `Tuned vs current on held-out test splits: NDCG@10 ${change(cur.ndcg, tuned.ndcg)}, ` +
    `recall@10 ${change(cur.recall, tuned.recall)}, coverage ${pct(cur.coverage)} -> ${pct(tuned.coverage)}. ` +
    `Paired NDCG difference per split: ${mean >= 0 ? "+" : ""}${mean.toFixed(4)} ± ${(2 * se).toFixed(4)} (2 standard errors). ` +
    (isCurrent
      ? "The current configuration is already the best: keep it."
      : significant
        ? `Recommendation: switch to WARM_WEIGHTS = ${JSON.stringify(bestConfig.warm)}, DIVERSITY_SHARE = ${bestConfig.share}.`
        : "Recommendation: keep the current configuration. The validation winner doesn't beat it by more than the noise on unseen splits.");
  console.log(`Test (seeds ${TEST_SEEDS[0]}-${TEST_SEEDS.at(-1)}, not used for choosing):\n\n${testTable}\n\n${verdict}`);

  if (process.argv.includes("--write")) {
    fs.mkdirSync("docs", { recursive: true });
    const file = path.join("docs", "recommendation-tuning.md");
    fs.writeFileSync(
      file,
      `# Recommendation tuning\n\nGenerated by \`npm run recs:tune -- --write\` on ${new Date().toISOString().slice(0, 10)} ` +
        `(${confirm.usersEvaluated} users, ${confirm.catalogSize} titles, ${confirm.interactions} bookmarks and ratings).\n\n` +
        `Grid search over every cf/content/popularity blend in steps of ${STEP} that sums to 1, ` +
        `with genre caps of ${SHARES.map((s) => (s >= 1 ? "off" : s)).join(", ")} (${Object.keys(candidates).length} configurations). ` +
        `Ranked by NDCG@10 on validation splits, then confirmed on separate test splits.\n\n` +
        `## Validation (used to choose)\n\n${searchTable}\n\n## Test (not used to choose)\n\n${testTable}\n\n${verdict}\n`,
    );
    console.log(`Wrote ${file}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
