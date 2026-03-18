import "dotenv/config";
import cron from "node-cron";
import { migrate, tablesExist } from "./migrate";
import { runHistoricalSync, runDailySync, hasSuccessfulHistoricalSync } from "./sync";

async function main(): Promise<void> {
  const skipMigrate = process.env.SKIP_MIGRATE === "true";
  if (skipMigrate) {
    const exist = await tablesExist();
    if (!exist) {
      console.error(
        "SKIP_MIGRATE is set but required tables are missing. Create them first (see scripts/schema.sql), or unset SKIP_MIGRATE."
      );
      process.exit(1);
    }
    console.log("[migrate] Skipped (SKIP_MIGRATE=true).");
  } else {
    await migrate();
  }

  const hasHistorical = await hasSuccessfulHistoricalSync();
  if (hasHistorical) {
    console.log("Historical sync already done, skipping.");
  } else {
    await runHistoricalSync();
  }

  cron.schedule("0 2 * * *", async () => {
    console.log("[cron] Running daily sync...");
    try {
      await runDailySync();
    } catch (err) {
      console.error("[cron] Daily sync error:", err);
    }
  });

  console.log("Pipeline started. Daily sync scheduled (cron: 0 2 * * * — 02:00 every day).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
