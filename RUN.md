# How to run and check this code

## 1. One-time setup

```bash
cd /Users/t.punhongwiset/Documents/Dashboard_WFM
npm install
```

Make sure `.env` has:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

## 2. Create tables (if not done yet)

**Option A – Turso CLI (if installed):**
```bash
npm run db:setup
```

**Option B – Skip migrate and create tables in Turso dashboard:**  
Paste and run `scripts/schema.sql` in Turso → your database → SQL.  
Then in `.env` add: `SKIP_MIGRATE=true`

## 3. Run the app (full pipeline)

```bash
npm start
```

This will:
- Run migrate (or skip if tables exist / `SKIP_MIGRATE=true`)
- Run historical sync once (if not already done)
- Schedule daily sync at 02:00
- Keep the process running

## 4. Run individual checks

| What to check           | Command |
|-------------------------|--------|
| **DB connection + tables** | `npm run check` |
| Database schema         | `npm run migrate` |
| Historical sync only    | `npm run sync:historical` |
| Daily sync once         | `npm run sync:daily` |
| TypeScript compiles     | `npx tsc --noEmit` |

## 5. Quick “smoke” check (no API, no DB)

```bash
npx tsc --noEmit && echo "TypeScript OK"
```

To actually hit the API and DB, run `npm start` or `npm run sync:daily`.

---

## 6. How to check all code is working

Run these in order. If any step fails, fix it before the next.

| Step | Command | What you should see |
|------|--------|----------------------|
| **1** | `npx tsc --noEmit` | No errors (TypeScript compiles). |
| **2** | `npm run check` | `OK – DB connected, all 4 tables exist.` |
| **3** | `npm run sync:historical` | Logs like `[API] workflowId=... page=...`, then `[sync] Historical sync done. repair=... claim=... upserted=... sku_fetched=...` and exit 0. |
| **4** | `npm run sync:daily` | Same style logs, `[sync] Daily sync done.` and exit 0. |
| **5** | `npm start` | Migrate/check, then either “Historical sync already done” or a historical run, then “Daily sync scheduled (cron: 0 2 * * *)”. Process keeps running. |

**Optional – verify data in Turso**

- In Turso dashboard → your database → **Data** (or SQL):
  - `SELECT COUNT(*) FROM tasks;`
  - `SELECT COUNT(*) FROM task_details;`
  - `SELECT * FROM sync_log ORDER BY id DESC LIMIT 5;`
- You should see rows in `tasks` / `task_details` and recent rows in `sync_log` with `status = success`.

If all steps pass and the optional queries show data, the full pipeline (search API → SKU API → Turso, historical + daily) is working.
