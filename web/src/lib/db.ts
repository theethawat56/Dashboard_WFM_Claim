import { createClient, type Client } from "@libsql/client";

let _db: Client | null = null;

export function getDb(): Client {
  if (!_db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) {
      throw new Error(
        "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment"
      );
    }
    _db = createClient({ url, authToken });
  }
  return _db;
}
