#!/bin/bash
# Push this repo to GitHub. Run from project root.
# Usage: ./scripts/push-to-github.sh https://github.com/YOUR_USERNAME/YOUR_REPO.git

set -e
REPO_URL="${1:?Usage: ./scripts/push-to-github.sh https://github.com/USER/REPO.git}"

cd "$(dirname "$0")/.."
if git remote get-url origin 2>/dev/null; then
  echo "Remote 'origin' already exists. Updating URL..."
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi
git push -u origin main
echo "Done. Repo is at: $REPO_URL"
echo "Next: Go to https://vercel.com/new and import this repo. Set Root Directory to 'web' and add env vars."
