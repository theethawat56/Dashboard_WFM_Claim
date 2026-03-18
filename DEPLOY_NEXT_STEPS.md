# Deploy to Vercel — Your next steps

Git is ready and the first commit is done. Follow these steps to get the dashboard live on Vercel.

---

## Step 1: Create a GitHub repository

1. Open **https://github.com/new**
2. **Repository name:** e.g. `Dashboard_WFM` (or any name you like)
3. Choose **Private** or **Public**
4. **Do not** add a README, .gitignore, or license (the project already has them)
5. Click **Create repository**

---

## Step 2: Push your code to GitHub

In Terminal, from your project folder, run (replace with **your** repo URL from Step 1):

```bash
cd /Users/t.punhongwiset/Documents/Dashboard_WFM
./scripts/push-to-github.sh https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
```

Or manually:

```bash
cd /Users/t.punhongwiset/Documents/Dashboard_WFM
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Use your GitHub username and the repo name you created. If it asks for login, use a Personal Access Token or GitHub CLI (`gh auth login`).

---

## Step 3: Deploy on Vercel

1. Go to **https://vercel.com/new**
2. Click **Import** and select the GitHub repository you just pushed
3. **Root Directory:** click **Edit** and type: **`web`** then **Continue**
4. **Environment Variables:** add these (use the same values as in your `.env`):

   | Name                  | Value (paste from your .env) |
   |-----------------------|-------------------------------|
   | `TURSO_DATABASE_URL`  | `libsql://wfm-theethawat56...` |
   | `TURSO_AUTH_TOKEN`    | `eyJhbGciOi...` (your token)   |

   Optional: `NEXT_PUBLIC_APP_TITLE` = `Repair & Claim Dashboard`

5. Click **Deploy**
6. When it finishes, open your app at: **https://your-project.vercel.app/dashboard**

---

## Done

- **Dashboard URL:** `https://YOUR_PROJECT.vercel.app/dashboard`
- Future pushes to `main` will trigger a new deployment automatically.

For more detail or troubleshooting, see **docs/VERCEL_DEPLOY.md**.
