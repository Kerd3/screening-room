/** Checks all bookmarked series for new seasons (same job as POST /api/cron/check-seasons). */
import "dotenv/config";
import { checkSeasons } from "@/lib/alerts";
import { db } from "@/lib/db";

checkSeasons()
  .then((r) => console.log(`Checked ${r.checked} series, created ${r.alertsCreated} alerts.`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
