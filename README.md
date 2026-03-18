# Dashboard WFM — Task Data Pipeline

Fetches repair and claim task data from the Dataslot search API and stores it in a Turso (libSQL) database. Supports historical (one-time) and daily incremental syncs.

## Tech stack

- **Runtime:** Node.js (TypeScript)
- **HTTP:** native `fetch`
- **Database:** Turso via `@libsql/client`
- **Scheduler:** node-cron
- **Config:** dotenv

## Setup

1. Copy env and install deps:

   ```bash
   cp .env.example .env
   npm install
   ```

2. Set in `.env`:
   - `TURSO_DATABASE_URL` — Turso database URL
   - `TURSO_AUTH_TOKEN` — Turso auth token  
   **How to get URL and token:** see [docs/TURSO_SETUP.md](docs/TURSO_SETUP.md).

3. Create tables (pick one):

   - **Auto via Turso CLI:** `npm run db:setup` (requires [Turso CLI](https://docs.turso.tech/cli#installation) and `turso auth login`). If you see "database ... not found", run `turso db list` and set `TURSO_DB_NAME` in `.env` to the exact name shown.
   - **Or run migration from app:** `npm run migrate` (may fail with 400 on some Turso setups).
   - **Or manually:** Turso dashboard → your database → SQL → paste and run `scripts/schema.sql`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run pipeline: migrate, historical sync (if not done), then schedule daily sync at 02:00 |
| `npm run migrate` | Apply schema via app (may 400 on Turso) |
| `npm run db:setup` | Create tables in Turso via CLI (pipe `scripts/schema.sql` into `turso db shell`) |
| `npm run sync:historical` | Force full historical sync (bypasses “already done” check) |
| `npm run sync:daily` | Run daily sync once (current month only) |

## Sync behaviour

- **Historical:** Fetches all pages for both workflows, keeps tasks with `timestamp >= Jan 1 last year` (UTC). Skipped on startup if a successful historical run exists; use `FORCE_HISTORICAL=true` to re-run.
- **Daily:** Fetches pages until results are older than the first day of the current month, keeps tasks with `timestamp >= first day of current month`. Stops pagination early when sorted-by-desc results are below cutoff.

## Workflows

- **Repair:** `workflowId = ulMEhA` → `task_type = "repair"`
- **Claim:** `workflowId = OC8LiE` → `task_type = "claim"`

## Database

- **tasks:** id, task_number, task_type, workflow_id, status, company, timestamp (Unix ms), flags (is_reclaim, is_unfixed), parent_ids (JSON).
- **task_details:** task_id, customer/product/shipping fields, ref_numbers (JSON).
- **sync_log:** Each run logs sync_type, started_at, finished_at, counts, status, error_message.
- **auto_sync_state:** Key-value metadata for the pipeline (e.g. last run flags); `updated_at` auto-set.

All timestamps in DB are stored as INTEGER Unix milliseconds. No ORM; raw parameterized libSQL only.

## Troubleshooting: HTTP 400 on migrate

If `npm run migrate` or `npm start` fails with `Server returned HTTP status 400`:

**Option A — Auto-create tables with Turso CLI (recommended)**  
If you have the [Turso CLI](https://docs.turso.tech/cli#installation) and are logged in (`turso auth login`):

```bash
npm run db:setup
```

This pipes `scripts/schema.sql` into `turso db shell`. Set `TURSO_DB_NAME` in `.env` if the name cannot be derived from `TURSO_DATABASE_URL`. Then run `npm start`.

**Option B — Create tables manually in dashboard**  
1. Open [Turso dashboard](https://turso.tech/app) → your database → **SQL**.
2. Paste the full contents of `scripts/schema.sql` and run it.
3. Run `npm start` again. The app will detect existing tables and skip migration.

**Option C — Use SKIP_MIGRATE after tables exist**  
If tables are already created and you want to avoid the 400 message on every start:

- In `.env` add: `SKIP_MIGRATE=true`
- Start the app: `npm start`

**If you need DDL from the app** — Use a token with write access (`turso db tokens create <db-name>`) and the primary database URL (not a replica).
