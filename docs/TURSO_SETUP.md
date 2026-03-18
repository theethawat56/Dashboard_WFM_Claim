# How to get Turso database URL and token

You need **two values** in `.env`:

- `TURSO_DATABASE_URL` — your database connection URL  
- `TURSO_AUTH_TOKEN` — a token that allows the app to connect

---

## Option 1: You already have a Turso database

If someone gave you a URL and token (or you created a database in the [Turso dashboard](https://turso.tech/app)):

1. Open your project `.env` file.
2. Set:
   ```env
   TURSO_DATABASE_URL=libsql://your-db-name-your-org.region.turso.io
   TURSO_AUTH_TOKEN=eyJ...your-token-here...
   ```
3. Save the file. The app uses these when you run `npm start` or `npm run check`.

**Create a new token (dashboard):**

1. Go to [Turso dashboard](https://turso.tech/app) → your database.
2. Open **Settings** or **Connect**.
3. Create a new token (read/write) and copy it into `TURSO_AUTH_TOKEN` in `.env`.

---

## Option 2: Create a new database with Turso CLI

Use this if you don’t have a database yet.

### 1. Install Turso CLI

**macOS (Homebrew):**
```bash
brew install tursodatabase/tap/turso
```

**macOS / Linux (install script):**
```bash
curl -sSfL https://get.tur.so/install.sh | bash
```

Then open a **new terminal** or run:
```bash
source ~/.zshrc
```

### 2. Log in

```bash
turso auth login
```

Sign in in the browser when prompted.

### 3. Create a database

```bash
turso db create dashboard-wfm --region sin
```

Use any name (e.g. `dashboard-wfm`) and a [region](https://docs.turso.tech/reference/turso-cli#database-regions) near you (e.g. `sin`, `nrt`, `iad`).

### 4. Get the URL and token

**Database URL:**
```bash
turso db show dashboard-wfm --url
```

Copy the output (e.g. `libsql://dashboard-wfm-username.region.turso.io`) into `.env` as `TURSO_DATABASE_URL`.

**Auth token (read/write):**
```bash
turso db tokens create dashboard-wfm
```

Copy the token (starts with `eyJ...`) into `.env` as `TURSO_AUTH_TOKEN`.

### 5. Set `.env`

Your `.env` should look like:

```env
TURSO_DATABASE_URL=libsql://dashboard-wfm-yourorg.region.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

For `npm run db:setup` you can also set the database name (same name you used in `turso db create`):

```env
TURSO_DB_NAME=dashboard-wfm
```

---

## Summary

| Step | Command or action |
|------|-------------------|
| Install CLI | `brew install tursodatabase/tap/turso` or `curl -sSfL https://get.tur.so/install.sh \| bash` |
| Log in | `turso auth login` |
| Create DB | `turso db create dashboard-wfm --region sin` |
| Get URL | `turso db show dashboard-wfm --url` → put in `TURSO_DATABASE_URL` |
| Create token | `turso db tokens create dashboard-wfm` → put in `TURSO_AUTH_TOKEN` |
| Optional (for db:setup) | `TURSO_DB_NAME=dashboard-wfm` (exact name from `turso db list`) |

Never commit `.env` or share your token. Use `.env.example` (without real values) for documentation.
