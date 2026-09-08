# Arthid

Team chat, projects and meetings in one app, with a Discord bot that reaches the same data
from outside.

**Stack** — Firebase (Auth, Firestore, Storage, Hosting) · Cloud Functions 2nd gen ·
Discord Interactions API · vanilla JS PWA

---

## Layout

```
index.html        The app (chat, projects, meetings)
index2.html       Layout variant
index3.html       Layout variant
auth.html         Sign-in
firebase.js       Client SDK setup and helpers
firestore.rules   Firestore access rules
storage.rules     Storage access rules
sw.js             Service Worker
functions/
  index.js        Discord HTTP interactions endpoint
  discord.js      Ed25519 signature verification, response helpers
  commands.js     Slash command definitions
  arthid.js       Firestore reads/writes the bot needs
  register.js     Registers slash commands with Discord
  test/           Function tests
```

## The Discord bot is interactions-only

Discord POSTs to an HTTPS endpoint; there is no gateway socket to keep alive, so the bot
costs nothing while idle. Every command follows the same path:

1. Verify the Ed25519 signature against the **raw** body
2. Answer `PING` with `PONG` (Discord does this when the URL is saved)
3. Do the Firestore work
4. Reply inside Discord's 3-second window

**Do not defer the reply to buy the 15-minute window.** 2nd-gen functions run on Cloud
Run, which allocates CPU *only during request processing*. The instance is throttled the
moment the response is sent, so the continuation never runs — the user watches "thinking"
forever and nothing appears in the logs, because the code genuinely never executed.
Deferring is only safe with CPU always allocated.

Setup steps are in [`DISCORD_SETUP.md`](./DISCORD_SETUP.md).

## Running it

```bash
# serve the static app
npx serve . -l 8000

# functions
cd functions && npm install
firebase deploy --only functions
firebase deploy --only firestore:rules
```

The Firebase web config in `firebase.js` is a placeholder — drop in your own project's
values. (Firebase web API keys are public by design; access is controlled by
`firestore.rules`, not by hiding the key.)
