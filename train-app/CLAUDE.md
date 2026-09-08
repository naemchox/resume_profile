# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Train With Myself" (a.k.a. Ijek) — a mobile-first PWA where a "committed self" avatar runs your schedule so you race to keep up. The app is **three companion files** loaded by `train.html`:

- **`train.html`** (~700KB) — all the app logic. Loads React + ReactDOM from a CDN and compiles JSX **in the browser** via Babel Standalone (`<script type="text/babel">`). This is where you edit logic/components.
- **`train.css`** — all styles (was the inline `<style>`; now `<link>`ed). Edit here for any visual change.
- **`train-i18n.js`** — the `STRINGS` en+th translation table, a plain `<script>` that runs *before* the babel app and exposes `window.STRINGS` (the app does `const STRINGS = window.STRINGS`). Add new UI keys to BOTH `en` and `th` here.

There is still **no build step, no bundler, no npm build script** — just three static files served as-is. If you add another companion file, it must also be added to `sw.js` `SHELL` and `build-deploy.js` `ASSETS`, or the PWA install / dist build breaks.

Not a git repository.

## Critical workflow rules

- **After ANY change to `train.html`, `train.css`, or `train-i18n.js`, bump the service-worker cache version** in `sw.js`: `const CACHE = 'train-with-myself-vNN'` → `vNN+1`. The SW is network-first for the document but stale-while-revalidate for `train.css`/`train-i18n.js`, so without a cache bump a CSS/i18n edit can serve stale for one extra load. Bumping reliably forces fresh code. Forgetting this is the #1 reason a change "doesn't show up."
- **`deploy/` is a separate, STALE bundle** (its `index.html` has an old `SCHEMA_VERSION`). Editing files in `deploy/` does **not** affect the live app. Don't touch it unless you're explicitly redeploying.
- **You cannot `node --check` the JSX** — it's compiled at runtime, so a syntax error just blanks the page (white screen on the splash). Verify edits by careful reading; there's no compiler to catch you. After non-trivial edits, also scan for stray NUL bytes.

## Running locally

- `node _serve.js` — serves the folder at http://localhost:8000 (maps `/` → `train.html`).
- `cloudflared.exe` (+ `config.yml`) — public tunnel when needed.

## Data model

- All state lives in `localStorage` under `K.*` keys. `SCHEMA_VERSION` + `migrate()` handle upgrades; bump/migrate carefully and **verify the destination before deleting any source data** (a past migration destroyed user data).
- Backup export/import covers the keys in `BACKUP_KEYS`.

## React invariants (each caused real blank-page bugs)

- **All hooks must be declared before the `if (!currentUser) return <LoginScreen>` early-return in `Root()`** — otherwise a fresh login crashes with React error #300.
- A new `useEffect`'s deps array must not reference state declared later in the same component (TDZ blanks the page; `node --check` wouldn't catch it even if it could run).

## Style

Match the surrounding code: single-file, dense, with comments that explain *why*. Make one change at a time on this large file and let the user verify in the browser before continuing.
