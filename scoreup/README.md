# ScoreUp — TOEIC self-study PWA

Single-file TOEIC practice app (Thai/EN). Live: **https://scoreup-jek2026.netlify.app**

## Run locally
```bash
python3 -m http.server 8077
# open http://localhost:8077/scoreup.html
```
> If the server is down, the PWA service worker serves a **stale cached** copy offline — so "my edits don't show" usually means the server isn't running, or you need a hard refresh ×2 for the new service worker to activate.

## Structure (important)
- `scoreup.html` — the whole app (HTML + CSS + JS in one file).
- **`questions.js` / `exam.js` / `vocab-bank.js`** — question data loaded via `<script src>` (`window.QUESTIONS` / `window.EXAM_BANK` / `window.VOCAB_BANK`). The app **breaks without these** — keep them.
- `emoji/` `images/` `audio/` — assets. `sw.js` — service worker (offline cache).
- `google-sheet-logger.gs` — optional Google Apps Script backend for the group leaderboard + prep-test logging (dormant until `PREP_SHEET_URL` is set in `scoreup.html`). Contains a shared SECRET — **keep this repo private.**

## Editing
Bump the `CACHE` version in **`sw.js`** (e.g. `scoreup-v196` → `v197`) on every change, or browsers keep serving the old cached version.

## Deploy
```bash
bash deploy.sh   # needs netlify-cli + login (netlify login)
```
Deploys to the pinned Netlify site `scoreup-jek2026`. The script copies prod files to `../ScoreUp-dist`, makes `index.html` = `scoreup.html`, then `netlify deploy --prod`.

## Clone on another PC
```bash
git clone <this-repo-url> ScoreUp
cd ScoreUp
python3 -m http.server 8077
```
For deploying from the new PC: `npm i -g netlify-cli && netlify login` first.
