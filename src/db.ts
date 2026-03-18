import { createClient, type Client } from "@libsql/client";
import "dotenv/config";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  throw new Error(
    "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment"
  );
}

export const db: Client = createClient({
  url,
  authToken,
});
