/**
 * Quick check: DB connection + tables exist. Run with: npm run check
 */
import "dotenv/config";
import { db } from "./db";
import { tablesExist } from "./migrate";

async function main() {
  console.log("Checking DB connection and tables...");
  try {
    const exist = await tablesExist();
    if (exist) {
      console.log("OK – DB connected, all 4 tables exist.");
    } else {
      console.log("DB connected but required tables are missing. Run: npm run db:setup");
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Check failed:", msg);
    if (msg.toLowerCase().includes("fetch failed")) {
      console.error("(Network error: cannot reach Turso. Check internet, proxy, firewall, or try again.)");
    }
    process.exit(1);
  }
}

main();
