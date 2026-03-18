#!/usr/bin/env node
/**
 * Create all tables in Turso by piping scripts/schema.sql into `turso db shell`.
 * Requires: Turso CLI installed and logged in (turso auth login).
 * Optional: TURSO_DB_NAME in .env, or we derive from TURSO_DATABASE_URL.
 */
require("dotenv").config();
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function getDbName() {
  const fromEnv = process.env.TURSO_DB_NAME;
  if (fromEnv) return fromEnv.trim();
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error("Missing TURSO_DATABASE_URL or TURSO_DB_NAME in .env");
    process.exit(1);
  }
  try {
    const u = new URL(url.replace(/^libsql:\/\//, "https://"));
    const host = u.hostname || "";
    const firstLabel = host.split(".")[0];
    if (firstLabel) return firstLabel;
  } catch (_) {}
  console.error("Could not derive database name from TURSO_DATABASE_URL. Set TURSO_DB_NAME in .env");
  process.exit(1);
}

function runTursoList(tursoBin) {
  try {
    return execSync(`"${tursoBin}" db list`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (_) {
    return null;
  }
}

const schemaPath = path.join(__dirname, "schema.sql");
if (!fs.existsSync(schemaPath)) {
  console.error("Not found:", schemaPath);
  process.exit(1);
}

function findTursoBinary() {
  const envPath = process.env.TURSO_CLI_PATH || process.env.TURSO_PATH;
  if (envPath) {
    const p = path.resolve(envPath.trim());
    if (fs.existsSync(p)) return p;
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = [
    path.join(home, ".turso", "turso"),
    path.join(home, ".turso", "bin", "turso"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "turso";
}

const dbName = getDbName();
const tursoBin = findTursoBinary();
console.log("Creating tables in Turso database:", dbName);

const child = spawn(tursoBin, ["db", "shell", dbName], {
  stdio: ["pipe", "inherit", "pipe"],
});
const schema = fs.readFileSync(schemaPath, "utf8");
child.stdin.write(schema);
child.stdin.end();

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  process.stderr.write(chunk);
});

child.on("close", (code) => {
  if (code === 0) {
    console.log("Tables created successfully.");
  } else {
    const notFound = /not found|database .* not found/i.test(stderr);
    if (notFound) {
      console.error("\nDatabase name '" + dbName + "' not found in this Turso account.");
      console.error("Your databases (turso db list):");
      const listOut = runTursoList(tursoBin);
      if (listOut) {
        console.error(listOut);
      } else {
        console.error("  Run in terminal: turso db list");
      }
      console.error("\n→ Copy the exact database name from the list above and add to .env:");
      console.error("   TURSO_DB_NAME=<exact-name-from-list>");
      console.error("   Then run: npm run db:setup");
    }
    process.exit(code ?? 1);
  }
});
child.on("error", (err) => {
  console.error("Failed to run Turso CLI:", err.message);
  if (err.code === "ENOENT") {
    console.error("Turso not found. Install from: https://docs.turso.tech/cli/introduction");
    console.error("Or set TURSO_CLI_PATH in .env to the full path of the turso binary (e.g. " + path.join(process.env.HOME || "~", ".turso", "turso") + ")");
  }
  process.exit(1);
});
