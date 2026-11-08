# Stock LINE Bot

A LINE bot that pushes Thai and US stock prices on a schedule, combined into one message per
user. Multiple people can use it, each with their own watchlist and interval, and the bot
divides LINE's free push quota between them.

**Stack** — TypeScript · Cloudflare Workers (cron trigger) · Workers KV · LINE Messaging API
· Yahoo Finance (unofficial chart endpoint, roughly 15 minutes delayed)

Original Thai notes: [`README.th.md`](./README.th.md)

---

## Features

- Cron fires every 5 minutes; the code decides whether each user is due
- Pushes only when a watched market is open and a symbol has a **new** price since the last
  push, so holidays, lunch breaks and nights cost no quota
- Checks the remaining LINE quota before each push and stops when it is exhausted
  (the `price` command is a reply, which does not count toward the quota)
- Per-user watchlists (max 20 symbols), interval, pause and resume
- First user to message the bot becomes the owner and gets the total quota and a user list
- Thai tickers can be typed without `.BK`; `PTT` resolves to `PTT.BK`, then falls back to `PTT`
- Chat commands (the bot's UI is Thai): add/remove symbols, list, interval, price, pause/start,
  quota, users (owner only), help

## Layout

```
src/index.ts      Worker entry: /webhook, /quote?s=SYMBOL (Yahoo check), scheduled handler
src/webhook.ts    LINE signature check and chat command handling
src/schedule.ts   Interval logic, quota sharing, push decision
src/yahoo.ts      Yahoo Finance fetch and symbol resolution
src/line.ts       LINE reply / push / quota calls (token "dry" logs instead of sending)
src/flex.ts       Flex message for the price summary
src/state.ts      KV load/save for owner metadata and per-user state
src/types.ts      Shared types
wrangler.toml     Cron trigger and KV binding
```

KV keys: `meta` (owner, users receiving pushes, waiting users) and `user:<userId>` (watchlist,
interval, paused flag, last-seen price times). A legacy single `state` key is migrated to
this layout automatically.

## Setup

1. In the LINE Developers console, create a Messaging API channel. Copy the **Channel secret**
   and issue a long-lived **Channel access token**. In LINE OA Manager, turn off auto-reply and
   greeting messages so the bot does not answer twice.
2. Create the KV namespace and put its id in `wrangler.toml` (the placeholder is
   `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`):
   ```bash
   npm install
   npx wrangler login
   npx wrangler kv namespace create STATE
   ```
3. Set secrets and deploy:
   ```bash
   npx wrangler secret put LINE_CHANNEL_SECRET
   npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
   npm run deploy
   ```
4. In the LINE console set the webhook URL to `https://your-server.workers.dev/webhook`,
   verify it, and enable "Use webhook". Add the bot as a friend and send the help command;
   the first sender becomes the owner.

## Running locally

Create `.dev.vars`:

```
LINE_CHANNEL_SECRET=testsecret
LINE_CHANNEL_ACCESS_TOKEN=dry
```

`dry` makes the bot print outgoing LINE calls to the log instead of sending them.

```bash
npm run dev                          # wrangler dev --test-scheduled
curl "localhost:8787/__scheduled"    # simulate the cron
npm run typecheck
```

The simulated cron uses the real clock, and `?time=` has no effect; to test a specific time,
temporarily change `now` in `runSchedule`. Use `npx wrangler tail` to read production logs.

## Constraints / design notes

- **The free quota is 300 pushes/month** on LINE OA in Thailand. The bot budgets 90% of it
  (270) and splits that evenly across users who are currently receiving (not paused, with at
  least one symbol). At most 2 users get automatic pushes (`MAX_PUSH_USERS` in
  `src/schedule.ts`); others can use every command but get no scheduled pushes. A user who
  blocks the bot frees a slot for a waiting one.
- **Intervals stretch automatically.** If a user's chosen interval would exceed their share,
  the effective interval moves up a fixed ladder (15, 30, 45, 60, 90, 120, 180, 240, 360, 480,
  720, 1440 minutes). Every step divides 1440, so due times stay aligned to the same minutes
  each day. Estimates assume about 22 trading days, 270 SET minutes and 390 US minutes per day.
  Example from the notes: Thai + US symbols fit hourly for one user and every 3 hours for two.
- **Bangkok time is computed as UTC+7** directly; Thailand has no DST.
- **Prices are fetched once per run** for the union of all due users' symbols, then fanned out.
- **Yahoo Finance is an unofficial API** and may change or block requests; the `/quote`
  endpoint exists to check that Yahoo is still reachable from Cloudflare.
- **Webhook requests are verified** against `x-line-signature` using the channel secret.
- To reset ownership and the user list:
  `npx wrangler kv key delete --binding STATE meta --remote` (per-user data stays under
  `user:<id>`).
