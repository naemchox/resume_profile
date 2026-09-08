# Train With Myself

A mobile-first PWA where a "committed self" avatar runs the schedule you said you wanted,
and you race to keep up with it.

**Stack** — React (CDN) + Babel Standalone · no bundler · Service Worker · Supabase ·
Cloudflare Workers · Thai/English i18n

---

## The unusual part: no build step

The whole app is three static files loaded by `train.html`:

| File | Role |
|---|---|
| `train.html` (~700 KB) | All app logic. Loads React + ReactDOM from a CDN and compiles JSX **in the browser** via `<script type="text/babel">`. |
| `train.css` | All styles. |
| `train-i18n.js` | The `STRINGS` table (en + th). Plain `<script>`, runs before the Babel app, exposes `window.STRINGS`. |

There is no npm build, no bundler, no transpile step — the files are served as-is. That
buys instant deploys and zero toolchain rot, and costs a compiler: a JSX syntax error does
not fail a build, it blanks the page. `node --check` cannot help because the JSX is never
valid JS on disk.

Adding a fourth companion file means registering it in **both** `sw.js` (`SHELL`) and
`build-deploy.js` (`ASSETS`), or PWA install and the dist build break.

## Features

- Schedule and habit tracking with a rival avatar that runs ahead on your own plan
- Offline-first: installable PWA, works with no connection
- Full Thai/English localisation
- Multiplayer via Supabase (Row Level Security; the anon key is public by design)
- AI planning through a Supabase Edge Function (`supabase/functions/jek-ai`)
- Desktop build under `desktop/`

## Running locally

```bash
node _serve.js       # http://localhost:8000, maps / -> train.html
node _smoketest.js   # basic smoke pass
```

On `localhost` the Supabase client is disabled on purpose (`_SB_DEV_OFF`): cloud sync
could otherwise pull an older or empty row over real local data. Locally, `localStorage`
is the single source of truth. The deployed app syncs normally.

## Data model

State lives in `localStorage` under `K.*` keys. `SCHEMA_VERSION` + `migrate()` handle
upgrades. Export/import covers the keys listed in `BACKUP_KEYS`.

> A past migration deleted source data before the destination was verified. Migrations now
> verify first, delete second.

## Invariants that each caused a blank page

- **Every hook must be declared before** the `if (!currentUser) return <LoginScreen>`
  early return in `Root()`. Otherwise a fresh login crashes with React error #300.
- A `useEffect` deps array must not reference state declared later in the same component —
  the temporal dead zone blanks the page, and no linter here will catch it.
- **Bump the Service Worker cache version** in `sw.js` (`train-with-myself-vNN`) after any
  change to the three companion files. The SW is network-first for the document but
  stale-while-revalidate for CSS and i18n, so skipping the bump serves stale code for one
  extra load. This is the single most common cause of "my change didn't show up".
- `deploy/` is a stale bundle with an older `SCHEMA_VERSION`. Editing it does nothing.
