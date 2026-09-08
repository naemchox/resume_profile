# PubChat

A mobile-first web chat app for pubs. People physically near each other can find one
another, "catch" someone with a chat-ball minigame, talk in real time, and use an in-chat
compass to actually meet up.

**Stack** — Firebase (Auth, Firestore, Hosting) · Cloud Functions · vanilla JS in a single
HTML file

---

## Features

- **Proximity discovery** — only people nearby appear
- **Chat-ball minigame** — throw a ball to start a conversation instead of a cold DM
- **Real-time chat** backed by Firestore
- **In-chat compass** — points at the person you are talking to, so you can find them in
  a crowded room
- **Stranger Mode** — matches you with a random person on site
- **Members club + ranking** — see [`RANKING-SPEC.md`](./RANKING-SPEC.md)

Location and the phone compass require **HTTPS** (or `localhost`), which is why this
deploys to Firebase Hosting.

## Layout

```
talk.html                  The whole app, ~3,400 lines in one file
talk-v3.1-lean.html        Stripped variant
talk-v3.2-club.html        Members-club variant
design-club.html           Design exploration
public/index.html          Build output (firebase.json copies talk.html here on predeploy)
firestore.rules            Live rules
firestore.rules.hardened   Tightened rules, staged for rollout
functions/                 Cloud Functions + selftest.mjs
docs/, references/         Notes and design references
```

## Running locally

```bash
npx serve . -l 8788      # or: python3 -m http.server 8788
# open http://localhost:8788/
```

No build step — Babel runs in the browser.

## Deploying

```bash
firebase deploy --only hosting          # predeploy copies talk.html -> public/index.html
firebase deploy --only firestore:rules
```

## Editing `talk.html`

It is one 3,400-line file. Change one thing at a time, and syntax-check before committing
by pulling the `<script type="module">` block into a `.mjs` and running `node --check` on
it — the browser will not tell you, it will just render nothing.

Full setup walkthrough: [`README-SETUP.md`](./README-SETUP.md) ·
back-end details: [`BACKEND-SETUP.md`](./BACKEND-SETUP.md)

The Firebase web config is a placeholder — supply your own project's values.
