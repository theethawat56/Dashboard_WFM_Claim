# Deploy Dashboard to Vercel

This guide explains how to deploy the **web dashboard** (Next.js app in `web/`) to Vercel.

---

## Prerequisites

1. **Vercel account** – Sign up at [vercel.com](https://vercel.com) (free tier is enough).
2. **Git repository** – Your code should be in GitHub, GitLab, or Bitbucket (Vercel deploys from Git).

---

## Step 1: Push your code to Git

If the project is not in a Git repo yet:

```bash
cd /path/to/Dashboard_WFM
git init
git add .
git commit -m "Initial commit"
```

Create a new repository on GitHub (or GitLab/Bitbucket), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

**Important:** Do **not** commit `.env` or `web/.env.local` (they should be in `.gitignore`). You will add secrets in Vercel instead.

---

## Step 2: Import project in Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. **Import** your Git repository (GitHub/GitLab/Bitbucket).
3. If prompted to configure:
   - **Framework Preset:** Next.js (should be auto-detected).
   - **Root Directory:** Click **Edit**, set to **`web`** (this is required because the Next.js app lives in the `web/` folder).
   - **Build Command:** `npm run build` (default).
   - **Output Directory:** leave default (`.next`).
   - **Install Command:** `npm install` (default).

4. **Do not deploy yet** – add environment variables first (Step 3).

---

## Step 3: Add environment variables

In the same “Create Project” screen (or later: Project → **Settings** → **Environment Variables**), add:

| Name | Value | Notes |
|------|--------|--------|
| `TURSO_DATABASE_URL` | `libsql://your-db.turso.io` | Your Turso URL (same as in `.env`) |
| `TURSO_AUTH_TOKEN` | `your_turso_token` | Your Turso auth token (same as in `.env`) |
| `NEXT_PUBLIC_APP_TITLE` | `Repair & Claim Dashboard` | Optional; shown in the browser tab |

Use the **exact** values from your local `web/.env.local` or project `.env`.  
For **Environment**, select **Production** (and optionally Preview if you want them in preview deployments).

Then click **Deploy**.

---

## Step 4: Deploy and open the app

- Vercel will build and deploy. When it finishes, you get a URL like `https://your-project.vercel.app`.
- The dashboard is at **`https://your-project.vercel.app/dashboard`** (root `/` redirects to `/dashboard`).

---

## Optional: Deploy from Vercel CLI

If you prefer not to use the Git integration:

1. Install Vercel CLI: `npm i -g vercel`
2. Go to the **web** folder and log in:

   ```bash
   cd web
   vercel login
   ```

3. Run (first time will ask for project setup):

   ```bash
   vercel
   ```

4. Add env vars (one-time):

   ```bash
   vercel env add TURSO_DATABASE_URL
   vercel env add TURSO_AUTH_TOKEN
   ```

   Paste the values when prompted. Then:

   ```bash
   vercel --prod
   ```

With CLI, the “root” is already `web` because you run commands inside it.

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| Build fails: “Missing TURSO_...” | Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Vercel → Settings → Environment Variables, then redeploy. |
| 404 or wrong page | Open `https://your-project.vercel.app/dashboard` (not only the root). |
| Root Directory not set | In Vercel → Settings → General, set **Root Directory** to `web` and redeploy. |
| Data not loading | Check that Turso URL and token are correct and that the token is valid (e.g. from [Turso dashboard](https://turso.tech/app)). |

---

## Summary checklist

- [ ] Code pushed to GitHub/GitLab/Bitbucket (no `.env` committed).
- [ ] New Vercel project created and linked to the repo.
- [ ] **Root Directory** set to **`web`**.
- [ ] `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` set in Vercel.
- [ ] Deploy; then open `https://your-project.vercel.app/dashboard`.

After that, every push to your main branch will trigger a new deployment automatically.
