# Ticket System by New-Gen

An internal ticket tracker for a small software team: create tasks, move them across a board,
comment, and see per-person workload. It has no server of its own. The page is a single static
HTML file, the API is a Google Apps Script web app, and the database is a Google Sheet.

New-Gen is the author's own company.

**Stack** — Vanilla JS single-page app (`index.html`, hosted on Netlify) · Google Apps Script
(V8) web app · Google Sheets as the database · canvas-confetti (CDN)

---

## Features

- Task CRUD with ids like `TIK-012`, categories (Bug, Feature, Support, Internal),
  priorities (Low to Critical) and statuses (Backlog, To Do, In Progress, Review, Done)
- Views: all tasks, drag-and-drop board, team summary; filter by person
- Comment thread per task plus an automatic activity log of field changes
- Keyboard shortcuts (`C` create, `/` search, `M` my tasks, `1`/`2`/`3` views, `R` refresh),
  light and dark theme, deep links such as `#TIK-012`
- Team passcode plus pick-your-name login; new members can register themselves from the page
- Confetti when a task moves to Done (skipped under `prefers-reduced-motion`)
- Auto-sync every 60 seconds

## Layout

```
index.html          The whole frontend (~1,100 lines): UI, state, API client
Code.gs             Apps Script backend: doGet/doPost, actions, sheet helpers
appsscript.json     Manifest (Asia/Bangkok, V8, web app runs as the deployer, anonymous access)
.claspignore        Limits `clasp push` to Code.gs + appsscript.json
SETUP.md            Thai setup and admin guide
TIcket_System.md    Original Thai plan / roadmap
```

Sheet tabs created by `setup()`: `Tasks`, `Users`, `Comments`. Columns are read by header name,
so their order can change but they must not be renamed.

API actions (one POST endpoint, JSON body): `login`, `register`, `list`, `comments`,
`createTask`, `updateTask`, `deleteTask`, `addComment`.

## Setup

1. Create a Google Sheet. In `Code.gs` set `SHEET_ID` (placeholder
   `REPLACE_WITH_YOUR_SHEET_ID`) to its id.
2. In the sheet: Extensions -> Apps Script, paste `Code.gs`, run `setup()` once and grant
   permissions. The execution log prints a generated team passcode, and the three tabs are
   created.
3. Deploy -> New deployment -> Web app, execute as **Me**, access **Anyone**. Copy the `/exec`
   URL.
4. In `index.html`, set `DEFAULT_API_URL` near the top to that URL (or leave it empty and
   users paste it on the login screen).
5. Publish `index.html` alone to Netlify (drag a folder containing only that file to Netlify
   Drop). Share the site link and the passcode with the team.

To update the backend later, use Deploy -> Manage deployments -> New version so the URL stays
the same. The passcode is the `TEAM_PASSCODE` script property; changing it logs everyone out.
`clasp push` also works if you add your own `.clasp.json`; it is not included here.

Optional notification hooks (LINE/Telegram) were in the original plan but are not implemented
in `Code.gs`.

## Constraints / design notes

- **Concurrency on a spreadsheet.** All writes run inside `LockService` (15 s wait, then a
  `BUSY` error). `updateTask` carries the `UpdatedAt` the client last saw; if the row has
  changed, the server returns `CONFLICT` with the current task instead of overwriting, and the
  client reloads.
- **Task ids survive deletes.** The last number is kept in a script property
  (`LAST_TASK_NUM`), so deleting the newest ticket cannot cause an id to be reused.
- **Server-side validation.** Status, priority and category are checked against allow-lists,
  titles are capped at 200 characters, and only an explicit list of fields is editable.
  Values starting with `=`, `+`, `-` or `@` are prefixed with an apostrophe so Sheets does not
  evaluate them as formulas.
- **Auth is deliberately light.** A shared team passcode gates the API and the user must exist
  in the `Users` tab, but there is no per-person credential, so any team member can choose any
  name. Fine for a trusted small team, not a security boundary.
- **Latency and scale.** Apps Script responses take about 1 to 3 seconds. The notes size it for
  roughly 20 people and low thousands of tasks.
