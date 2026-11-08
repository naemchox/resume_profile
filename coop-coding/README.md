# Co-op Coding

A VS Code extension for editing one folder with other people in real time, where the
files stay **real files on every participant's disk**. Anyone can run their own dev server
or Live Server against their local copy; there is no host session to depend on.

A co-op comes online when the first person joins and goes idle when the last one leaves.

**Stack** — TypeScript (VS Code extension) · Yjs CRDT · Cloudflare Workers + Durable Objects
(SQLite-backed) · Node + `ws` (local dev server) · esbuild

Original Thai notes: [`README.th.md`](./README.th.md)

---

## Features

- **Concurrent editing with CRDT merge** (Yjs) plus remote cursors, selections and names
- **Owner machine is primary** — changes the owner makes outside the co-op (other tools,
  git, the file manager) flow into the room; typing in the room is shown live but only
  written to disk when someone saves
- **Three roles** — owner, editor, viewer; each invite code carries one token and one role
- **Single-string invite codes** (`COOP1-...`) that embed the server address, co-op id and
  token, so joiners configure nothing
- **Rotate a leaked invite** — old holders are rejected immediately
- **Verify command** — compares the local folder against the shared document and can pull
  the co-op version over local files
- **Room sidebar** — current room, participants and the file each is viewing (click to
  follow), plus every room joined on this machine
- **Bring-your-own server** — the extension ships with no server address; a command deploys
  the Worker to the user's own Cloudflare account
- **Abuse limits** enforced in the Worker (see below)

Not synced: `node_modules`, `dist`, `build`, `.env*`, dot-folders, binary files, files over 1 MB.

## Layout

```
worker/                    Production server: Cloudflare Workers + Durable Objects
  src/index.js              Stateless routing, invite/role checks, request limits
  src/coop.js               Durable Object per co-op: Y.Doc, tokens, WebSockets, persistence
  src/limiter.js            Durable Object per IP: fixed-window create limits
  wrangler.jsonc            DO bindings and migrations
  persist-test.mjs          Work survives everyone leaving
  rate-limit-test.mjs       Abuse limits (local only)
server/                    Original Node version, kept for local dev (not what is deployed)
  server.js, coops-store.js, smoke-test.mjs
extension/                 The VS Code extension
  src/extension.ts          Activation, commands, status bar
  src/coop.ts               Core: bootstrap, editor -> co-op, co-op -> editor
  src/presence.ts           Remote cursors, selections, names
  src/workspaceFiles.ts     Which files sync and which do not
  src/invite.ts             Invite encode/decode and server API client
  src/sessionFolder.ts      Where a joiner's files land
  src/hosting.ts            Cloudflare login + deploy of the Worker to the user's account
  src/*-check.ts, testkit/  Tests with a stubbed `vscode` module
tools/coop-fingerprint.mjs Prints a fingerprint of synced files so two people can compare folders
start-server.sh            Runs the Worker locally via `wrangler dev` (port 8787)
open-test-windows.sh       Opens two VS Code windows (Alice / Bob) pointed at the local server
```

## Running locally

```bash
# terminal 1: the same Worker that runs in production, served locally (no Cloudflare login)
./start-server.sh            # ws://localhost:8787

# terminal 2: two VS Code windows preconfigured to use it
./open-test-windows.sh       # `./open-test-windows.sh reset` clears the test profiles
```

In the Alice window: Co-op sidebar (or the `Co-op: offline` status bar item) -> create a
co-op from this folder -> copy the editable invite. In the Bob window: join with invite code
and paste it. Open the same file in both and type.

Extension dev loop:

```bash
cd extension
npm install
npm run build        # or: npm run watch
```

Then launch one of the "Coop: run as Alice / Bob" configurations in `.vscode/launch.json` and reload the Extension Development
Host with Cmd+R after rebuilding.

## Tests

```bash
H=https://your-server.workers.dev      # or http://localhost:8787
W=wss://your-server.workers.dev        # or ws://localhost:8787

HTTP=$H WSURL=$W node server/smoke-test.mjs          # sync + permissions
cd worker && HTTP=$H WSURL=$W node persist-test.mjs   # work survives everyone leaving
cd worker && npm run test:limits                      # abuse limits, local only
cd extension && COOP_SERVER=$W npm run check:invite
cd extension && npm run check:folders                 # no server needed
cd extension && npm run check:verify                  # no server needed
cd extension && COOP_SERVER=$W npm run check:sync     # owner + peer: save, conflict, delete, close
```

The limits test must not be pointed at a deployed Worker: it consumes real quota and leaves
junk co-ops behind.

## Deploying

Each host runs their own server. From the extension, run `Co-op: set up my server
(Cloudflare)` (command id `coop.setupServer`; the title in the current build is Thai). It
runs `wrangler login`, then uploads the bundled Worker to the user's own Cloudflare account
and stores the resulting `wss://...workers.dev` address in the `coop.serverUrl` setting.

To deploy by hand:

```bash
cd worker
npm install
npx wrangler login
npm run deploy
```

Optional Worker vars: `CREATE_PER_HOUR` and `CREATE_PER_DAY` (defaults 20 and 100 per IP).
Set `coop.serverUrl` in VS Code settings to your own `wss://your-server.workers.dev`.

## Constraints / design notes

- **One Durable Object per co-op.** Cloudflare guarantees a single instance per object id, so
  there is no split brain and no sticky routing to maintain.
- **Hibernation is what keeps it on the free tier.** An idle co-op is evicted from memory and
  costs nothing; it wakes on the next message with empty RAM. That forces the Yjs document to
  be written to storage (debounced by 2 seconds to stay inside the write quota), which also
  means a co-op survives everyone leaving. Anything awareness-related that would normally sit
  in a `Map` (client ids) is kept in `ws.serializeAttachment()`, otherwise cursors of departed
  users would linger.
- **Permissions are enforced on the server, not the client**, because the client code is in
  other people's hands. Unauthorized connections are refused at the WebSocket upgrade, so a
  caller without an invite receives no document bytes. Tokens are stored in VS Code
  SecretStorage rather than `settings.json`, since settings live in the folder and can end up
  in git.
- **No server address or credential is baked into the extension.** A default address would
  make its author the operator of strangers' data. Login goes through `wrangler login`
  (Cloudflare's official authorize page) instead of a custom OAuth client, which would need a
  verified domain. The Worker is pre-bundled into one file shipped in the `.vsix`
  (`out/worker/worker.js`), so users do not need `npm install` to deploy it, and it needs no
  `nodejs_compat`.
- **Joiners never write into their own working folder.** On join the co-op wins on name
  collisions, so files are placed under a dedicated `coop session/<original folder name>/`
  directory to avoid overwriting someone's work. Joining reopens VS Code on another folder,
  which restarts the extension host, so the pending invite is parked in `globalState` and
  resumed in the new window.
- **Abuse limits** (Worker only; the Node server has none and can drift from the Worker):
  20 creates/hour and 100/day per IP, 10 failed invite guesses per 10 minutes per IP per
  co-op, 32 WebSockets per co-op, 25 MB per co-op (then read-only), 4 KB request bodies.
  Limiter counters live in storage, not memory, so a slow trickle of requests cannot reset
  them by letting the object hibernate. Client identity uses `CF-Connecting-IP` only; the
  `X-Forwarded-For` fallback is read only when that header is loopback, which happens only
  under `wrangler dev`.
- **Delete/rename and out-of-editor changes.** The extension hooks VS Code's delete and rename
  events and a file-system watcher, so owner-side changes made outside the editor are picked
  up. The Thai notes still list several of these as unfinished, so treat them as having
  changed since that text was written. Listed there as not done: a choice on name collisions
  when a creator rejoins, and pausing sync on branch switch.
