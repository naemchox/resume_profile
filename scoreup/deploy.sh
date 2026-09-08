#!/bin/bash
# ⚠️ STALE COPY — this folder (/Users/jek/ScoreUp) is NOT the source of truth anymore.
# The live app is developed in /Users/jek/scoreup_new (verified 2026-07-24). Deploy from there:
#     bash /Users/jek/scoreup_new/deploy.sh
# This guard prevents accidentally shipping the old code to scoreup-toeic.netlify.app.
echo "❌ STALE FOLDER. Deploy from /Users/jek/scoreup_new/deploy.sh instead."
echo "   (Remove these 6 lines if you really mean to deploy this old copy.)"
exit 1
# Deploy ScoreUp → https://scoreup-toeic.netlify.app
# Usage:  bash deploy.sh   (run from anywhere — paths resolve relative to this script)
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DIST="$SRC/../ScoreUp-dist"
rm -rf "$DIST" && mkdir -p "$DIST"
cp -R "$SRC"/scoreup.html "$SRC"/sw.js "$SRC"/questions.js "$SRC"/exam.js "$SRC"/vocab-bank.js "$SRC"/learn.js \
      "$SRC"/manifest.json "$SRC"/icon.svg "$SRC"/emoji "$SRC"/images "$SRC"/audio "$DIST"/ 2>/dev/null || true
cp "$SRC"/scoreup.html "$DIST"/index.html   # root URL opens the app directly
echo "Deploying to Netlify…"
# use the global netlify CLI if installed, otherwise fall back to npx
if command -v netlify >/dev/null 2>&1; then NETLIFY=netlify; else NETLIFY="npx --yes netlify-cli"; fi
# pin the site ID so a fresh dist (no .netlify link) still deploys to scoreup-toeic, not a random new URL
$NETLIFY deploy --prod --dir="$DIST" --site 3a1e9943-a7bd-4d8a-874b-09b81798760f
echo "✅ Live: https://scoreup-toeic.netlify.app  (remember to bump CACHE in sw.js before deploying)"
