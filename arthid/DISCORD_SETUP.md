# Arthid × Discord — setup

The bot is an **HTTP interactions endpoint**, not a gateway client. Discord POSTs
to a Cloud Function, it verifies the signature and replies. Nothing stays
running, so it costs nothing while idle.

Firestore stays the source of truth. The bot is a second client on the same
data as the web app, via the Admin SDK.

```
Discord  ──POST──▶  Cloud Function (us-east1)  ──▶  Firestore (us-east1)
                    verify Ed25519 → defer → work → PATCH reply
```

---

## 1. Create the Discord application

At <https://discord.com/developers/applications> → **New Application**.

From **General Information**, copy:

| Value | Where it goes |
|---|---|
| **Application ID** | `DISCORD_APP_ID` |
| **Public Key** | `DISCORD_PUBLIC_KEY` |

Live values for this install — the bot is **Project bot**:

| | |
|---|---|
| Application ID | `1538448623405375579` |
| Endpoint URL | `https://us-east1-arthid-0417.cloudfunctions.net/discord` |
| Server | **Startup** · `1538458135419686933` |

The public key lives in `functions/.env` (gitignored) and the bot token in
Secret Manager as `DISCORD_BOT_TOKEN`. Neither belongs in this file.

Then **Bot** → **Reset Token** → copy it. That's `DISCORD_BOT_TOKEN`, and it is
a real secret — it must never end up in this repo or in a client bundle.

You do **not** need any Privileged Gateway Intents. This bot never connects to
the gateway.

## 2. Invite the bot

**OAuth2 → URL Generator**, tick:

- Scopes: `bot`, `applications.commands`
- Bot permissions: `Send Messages`, `Embed Links`

Open the generated URL and add it to your server.

## 2.5 Google account

`arthid-0417` (project number `629924908533`) is owned by
**bigodummy1234@gmail.com** — the same account as the git remote. It was moved
there from wannuwat2001@gmail.com by granting Owner and removing the old
member; the project itself never moved, so the project id, API key, Auth uids
and all data are unchanged.

The Firebase CLI default for this directory is already set:

```bash
firebase login:use bigodummy1234@gmail.com    # already done
```

Open the Firebase Console signed in as that account, or the project won't
appear.

## 3. Blaze plan — done

Cloud Functions cannot deploy or make outbound calls to `discord.com` on the
free Spark plan, so Blaze is required rather than optional. This project is
already on it. Worth setting a budget alert if you haven't:
<https://console.cloud.google.com/billing/budgets?project=arthid-0417>

## 4. Configure and deploy

From the repo root:

```bash
# Non-secret params — the app id and public key are both visible in the
# Discord portal, so .env is the right home for them. It is gitignored anyway.
cat > functions/.env <<'ENV'
DISCORD_APP_ID=<your application id>
DISCORD_PUBLIC_KEY=<your public key>
ENV

# The bot token is a real secret and goes to Secret Manager, never to .env.
# This prompts for the value — paste it at the prompt so it stays out of
# your shell history.
firebase functions:secrets:set DISCORD_BOT_TOKEN

firebase deploy --only functions
```

The first `secrets:set` also enables the Secret Manager API, which is off by
default on a new project — a deploy attempted before it will fail with a 403
naming `secretmanager.googleapis.com`.

`functions/.env` is gitignored. Deploy prints the endpoint URL, something like:

```
https://discord-xxxxxxxx-as.a.run.app
```

## 5. Point Discord at it

Back in the developer portal → **General Information** →
**Interactions Endpoint URL** → paste that URL → **Save**.

Discord immediately sends a signed `PING`. If it saves, verification works.
If it refuses, the cause is almost always one of:

- `DISCORD_PUBLIC_KEY` doesn't match the app
- the function isn't deployed yet
- something re-serialised the request body before verification (this code
  verifies `req.rawBody`, which is the whole point)

## 6. Register the slash commands

```bash
cd functions
DISCORD_APP_ID=1538448623405375579 \
DISCORD_GUILD_ID=1538458135419686933 \
DISCORD_BOT_TOKEN="$(firebase functions:secrets:access DISCORD_BOT_TOKEN)" \
npm run register
```

Reading the token straight out of Secret Manager keeps it out of your shell
history. Note the bot must already be in the guild with the
`applications.commands` scope, or this returns `403 Missing Access` — a plain
`bot`-scope invite is not enough.

With `DISCORD_GUILD_ID` the commands appear **instantly** in that one server —
use this while setting up. Drop it to register globally, which works
everywhere but takes up to an hour to propagate.

Re-run this whenever a command's name, description or options change; Discord
caches the schema and won't notice edits on its own.

---

## Using it

```
/link account key:<your Primary Key>    ← from the Arthid app, once per person
/bind                                   ← lists your chats; run again with a chatId
/bind chat:grp_abc_def                  ← ties THIS channel to that Arthid chat

/todo list                              ← each task is a BUTTON; click to tick
/todo add text:ออกแบบโลโก้              ← returns the clickable list too
/todo done task:โลโก้                   ← partial text matches, if you prefer typing
/todo edit                              ← เลือกงานจากลิสต์ แล้วแก้ในฟอร์มที่เติมค่าเดิมไว้
/todo edit task:โลโก้                   ← หรือระบุชื่อ ฟอร์มเด้งขึ้นมาเลย

/project list
/project new title:เว็บใหม่ emoji:🎨
/project show project:เว็บ
/project edit                           ← เลือกจากลิสต์ → ฟอร์ม: ชื่อ อีโมจิ คำอธิบาย เดดไลน์ สถานะ
/project edit project:เว็บ              ← ชื่อไม่ซ้ำ = เปิดฟอร์มทันที, ซ้ำ = ให้เลือกจากลิสต์
/project remove                         ← ไม่ต้องพิมพ์: เลือกจากลิสต์ได้หลายอันพร้อมกัน
/project remove project:เว็บ            ← หรือพิมพ์ชื่อถ้าเร็วกว่า
/todo remove                            ← เลือกจากลิสต์เช่นกัน

/schedule add title:ส่งงานลูกค้า        ← เว้น when ไว้ = เปิดฟอร์ม ช่องวันเวลาเติมเทมเพลตมาให้
/schedule add title:ส่งงานลูกค้า when:20/08/2569 14:00
/schedule list                          ← นับถอยหลังสดๆ "อีก 3 วัน"
/schedule edit                          ← เลือกจากลิสต์ → ฟอร์มที่เติมวันเวลาเดิมไว้
/schedule edit event:ลูกค้า when:20/08/2569 16:00   ← ระบุ field = แก้ตรงๆ ไม่ต้องเปิดฟอร์ม
/schedule remove                        ← เลือกจากลิสต์ได้หลายอัน

/poll new question:ไปกินข้าวที่ไหน option1:ส้มตำ option2:ก๋วยเตี๋ยว
/poll vote poll:กินข้าว choice:2
/poll list
```

`/link` and `/bind` reply ephemerally — only you see them — because one carries
a Primary Key and the other lists your chats.

### Editing

Every `edit` subcommand opens a **modal** — Discord's only real form — prefilled
with the current values, so fixing a typo is not the same as retyping the whole
thing. Leave the name blank and you get a single-select list of what there is to
edit; the pick opens the form and the form's result replaces the list.

Two Discord limits shape this: a modal holds at most **5 text inputs** (exactly
what `/project edit` uses), and it must be the *first* response to an
interaction, so it cannot be preceded by a "thinking…" defer. A modal also
cannot reject its own submission — an unreadable date comes back as a private
message and you run the command again.

Editing a project's deadline keeps its `/schedule` entry in step: adding one
creates the entry, moving it moves the entry, and clearing the field deletes the
entry while leaving the project alone. `/schedule edit` mirrors in the other
direction.

## Data it adds

| Path | Purpose |
|---|---|
| `discordLinks/{discordUserId}` | `{ uid, primaryKey, linkedAt }` |
| `discordChannels/{channelId}` | `{ chatId, guildId, boundByUid, boundAt }` |
| `discordPending/{discordUserId}` | a multi-select awaiting its confirm button |

Neither has a `match` block in `firestore.rules`, so client access is denied by
default. Only the Admin SDK touches them, which is correct — nothing in the web
app needs to read them.

## Tests

```bash
cd functions && npm test
```

160 assertions covering Ed25519 verification against a generated keypair
(including tampered body, wrong timestamp, wrong key and malformed hex),
option and modal parsing, and every command handler — including the pick →
form → save edit flows — against an in-memory Firestore. No emulator or Java
needed.

## Region

The function runs in **us-east1 because that is where Firestore lives**, not
because of where anyone sits. The request path is Discord → function →
Firestore; no human is in it. Running it in asia-southeast1 "near Thailand"
put every Firestore read across the Pacific at ~250ms a round trip and pushed
commands past Discord's 3-second limit — commands took 1.5–3.9s and failed.

A Firestore database's location is fixed at creation, so if you ever move
regions, the function follows the database.

## Dates

Every date box in the bot asks for the same shape: **`DD/MM/YYYY HH:mm`**, e.g.
`20/08/2569 14:00`. Day-first, because that is how Thai dates are written and
because `03/04` is unreadable unless the template says which half is the day.
The time is optional (defaults to 09:00) and Buddhist-era years are converted
automatically — anything past 2400 can only be BE.

The template is put in front of the user, not just documented here:

| Where a date is typed | How the template gets there |
| --- | --- |
| `/schedule add when:` · `/schedule edit when:` · `/project new deadline:` | **autocomplete** — rows appear under the box as you type: quick picks (วันนี้ / พรุ่งนี้ / สัปดาห์หน้า) when it is empty, a ✅ echo of the full date once it parses, and completions of a half-typed one (`20` → 20th of this month and next) |
| `/schedule add` with `when` left blank | opens a **form** whose วันเวลา box is prefilled with tomorrow 09:00 in the template shape — edit the digits rather than reproduce the format |
| `/schedule edit` form · `/project edit` form | same box: the template is in the label *and* the placeholder, prefilled with the current date when there is one |

Reading is kept in the same shape as writing: modal prefills and the date shown
under each row of a picker all use `DD/MM/YYYY HH:mm`, so nothing the user reads
teaches a format the boxes then reject.

Parsing is deliberately looser than the template — `/`, `-` and `.` all separate
a date, `:` or `.` a time, a trailing `น.` is ignored, and a leading 4-digit
group means ISO order (`2026-08-20 14:00`). Pasting from a phone calendar works;
only genuinely ambiguous input is refused.

Input is read as **Asia/Bangkok** and stored as a UTC epoch. Thailand has never
observed DST, so a fixed +7 offset is correct rather than a shortcut; anywhere
with DST would need a real timezone database.

Countdowns use Discord's `<t:SECONDS:R>` markdown, which renders in each
viewer's own timezone and stays live — it does not go stale the way a
server-rendered "in 3 days" would the moment it is posted.

Impossible dates are rejected, not rolled over: `2026-02-30` is an error, not
2 March.

## Known limits

- **Membership is re-checked on every command**, not trusted from the bind, so
  leaving a group takes effect immediately. But `allowedRoles` on a project is
  still a client-side display filter — the bot shows every project in the bound
  chat to every member of that chat.
- **Project attachments list by name only.** The bytes never left the device
  that uploaded them (see the Firestore migration commit), so there's nothing
  to link to.
- **Concurrent votes on one poll can race** — the whole options array is
  written back. Fine until polls are actually contended.
- **Pickers cap at 25 items** (a Discord select-menu limit). With more than
  that, the first 25 are offered and the count is stated; name-typing still
  reaches the rest.
- **`/project remove` deletes for everyone**, not just you, and takes the
  project's comments with it. Any member of the bound chat can run it — the
  same as in the web app, and the same as the Firestore rules allow. It
  confirms first, and refuses to guess when a name matches more than one
  project.
- **The planner shows at most 25 clickable tasks** — Discord allows 5 action
  rows of 5 buttons. Beyond that the extras are listed in a plain embed and
  have to be ticked with `/todo done`.
- **Group chats have no name in Firestore**; the web app keeps group names
  client-side, so `/bind` shows groups as "Group · N members".
