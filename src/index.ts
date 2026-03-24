import "dotenv/config";
import cron from "node-cron";
import { migrate, tablesExist } from "./migrate";
import {
  runHistoricalSync,
  runDailySync,
  hasSuccessfulHistoricalSync,
  getLastDailySyncTime,
} from "./sync";

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 8 * * *";
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || "Asia/Bangkok";
const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function formatBangkokTime(date: Date): string {
  return date.toLocaleString("en-GB", { timeZone: CRON_TIMEZONE });
}

async function shouldRunMissedSync(): Promise<boolean> {
  const last = await getLastDailySyncTime();
  if (!last) return true;

  const lastDate = new Date(last);
  const now = new Date();
  const diffHours = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
  return diffHours >= 24;
}

async function safeDailySync(): Promise<void> {
  const start = new Date();
  console.log(`[cron] Running daily sync at ${formatBangkokTime(start)}...`);
  try {
    await runDailySync();
    console.log(`[cron] Daily sync completed successfully.`);
  } catch (err) {
    console.error("[cron] Daily sync error:", err);
  }
}

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

  // Run a missed daily sync if the last one was >24 hours ago (or never ran)
  const missed = await shouldRunMissedSync();
  if (missed) {
    console.log("[startup] Last daily sync is stale or missing — running now...");
    await safeDailySync();
  } else {
    const last = await getLastDailySyncTime();
    console.log(`[startup] Last successful daily sync: ${last} — no catch-up needed.`);
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[cron] Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}". Exiting.`);
    process.exit(1);
  }

  cron.schedule(CRON_SCHEDULE, () => void safeDailySync(), {
    timezone: CRON_TIMEZONE,
  });

  console.log(
    `Pipeline started. Daily sync scheduled (cron: ${CRON_SCHEDULE}, timezone: ${CRON_TIMEZONE}).`
  );
  console.log(`Current server time (${CRON_TIMEZONE}): ${formatBangkokTime(new Date())}`);

  // Heartbeat: log every hour so you can verify the process is alive
  setInterval(() => {
    console.log(`[heartbeat] Process alive at ${formatBangkokTime(new Date())}`);
  }, HEARTBEAT_INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
