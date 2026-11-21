/** Recomputes every user's genre profile and the item-similarity table. */
import "dotenv/config";
import { db } from "@/lib/db";
import { rebuildSimilarity } from "@/lib/recs/collaborative";
import { rebuildAffinity } from "@/lib/recs/profile";

async function main() {
  const users = await db.user.findMany({ select: { id: true } });
  for (const u of users) await rebuildAffinity(u.id);
  const pairs = await rebuildSimilarity();
  console.log(`Rebuilt ${users.length} profiles and ${pairs} similar-title pairs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
