/** Removes users created by the Playwright suite (e2e.*@example.com). */
import "dotenv/config";
import { db } from "@/lib/db";
import { rebuildSimilarity } from "@/lib/recs/collaborative";

async function main() {
  const { count } = await db.user.deleteMany({
    where: { email: { startsWith: "e2e.", endsWith: "@example.com" } },
  });
  if (count > 0) await rebuildSimilarity();
  console.log(`Removed ${count} end-to-end test ${count === 1 ? "user" : "users"}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
