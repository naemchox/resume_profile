# Basalt

A working backend-as-a-service, built to the design in [`fundamental.md`](./fundamental.md).

Postgres with row-level security, an auto-generated REST API, JWT auth with refresh-token
rotation, an authorized realtime change stream, policy-governed file storage, and an admin
dashboard.

Zero infrastructure. `npm run setup && npm start`. No Docker, no database to install —
Postgres 18 runs in-process via [PGlite](https://pglite.dev) (WebAssembly).

```
npm run setup     # installs deps and builds the Studio
npm start         # http://localhost:5252
npm test          # 49 tests, mostly adversarial
```

On first run the server prints three keys, and there is a **default project** whose data lives
in the `public` schema:

- a **service key** (`sk_…`, stored `0600` in `.data/service-key`) — bypasses RLS, for the
  Studio and server-side code. Never ship it.
- a **publishable key** (`pk_…`, in `.data/publishable-key`) — the project's public
  identifier, like Firebase's `apiKey`. Safe to ship in client apps; it grants no authority
  of its own. Security lives in the rules.
- an **admin key** (`ak_…`, `0600` in `.data/admin-key`) — provider-level, manages projects.

Paste the service key into the Studio to administer a project. Client apps connect with the
publishable key (or fetch it from the public `/config` endpoint).

## Multiple projects — each with its own keys

Basalt is multi-tenant. **Each project is an isolated tenant** — its own Postgres schema, its
own users, and its own publishable + service keys. A request routes to a project by the key it
presents; nothing crosses the boundary.

```
POST /projects            # admin key → { id, publishable_key, service_key, schema }
GET  /projects            # list all
DELETE /projects/<id>     # drop its schema, data, and users
```

Or use **Studio → Projects** (unlock with the admin key) to create a project, copy its
publishable key, and hand it to a customer. The isolation guarantees, each covered by a test in
`test/projects.test.mjs`:

- a project's key can only read that project's data;
- the same email is a **different user** in each project;
- a token minted for project A is **rejected** by project B (`wrong_project`);
- realtime, presence, and broadcast never cross projects — even on an identical channel name;
- a service key administers only its own project's tables, policies, and users.

The `public`-schema **default project** keeps the existing keys, so everything below (Studio,
chat, harness, all prior tests) runs against it unchanged.

## Build an app on it — like Firebase

A client app connects with a config and never writes backend code; your **rules** decide what
each request may do. The included **`chat.html`** is a full realtime chat — rooms, live
messages, presence, typing — built exactly this way:

```
node chat-setup.mjs                 # the provider sets the rules once (uses the service key)
open http://localhost:5252/chat.html
```

```js
// the entire connection — this is all a customer's app needs
const cfg = await (await fetch('/config')).json();
const basalt = createClient({ url: cfg.url, key: cfg.publishable_key });

// send data → it's stored → everyone sees it live
await basalt.from('messages').insert({ room_id, body, author_id: user.id, author_email: user.email });
basalt.channel('msgs:general')
  .on('postgres_changes', { table: 'messages', event: 'INSERT' }, e => render(e.new))
  .subscribe();
```

The one rule doing the work — set once in `chat-setup.mjs`, enforced by Postgres on every
insert, so a client cannot forge who a message came from:

```sql
create policy "post as yourself" on messages
  for insert to authenticated
  with check (author_id = auth.uid() and author_email = auth.email());
```

`chat.html`'s "How this works" panel shows the whole integration; there is **zero** backend
code behind it.

---

## Why this shape

`fundamental.md` argues that a BaaS is possible because **authorization can be expressed
declaratively and evaluated server-side, so the client can talk to the database directly.**
The security policy *is* the API layer.

It also recommends: *build on Postgres for v1; writing a correct distributed document store
is a multi-year project and there is no partial credit on durability.* This follows that
advice.

Everything below flows from one rule:

> Every request that carries user identity goes through `asRole()` — the only place a JWT
> becomes a database identity, and the only place RLS is engaged. A bug in the query
> compiler cannot leak another tenant's rows, because the query compiler is not what
> enforces access.

---

## Architecture

```
                        ┌───────────────────────┐
  SDK / Studio  ──────► │  server/index.mjs     │  routing, CORS, PG-error → HTTP
                        └───────────┬───────────┘
        ┌──────────────┬────────────┼────────────┬───────────────┐
        ▼              ▼            ▼            ▼               ▼
   ┌─────────┐  ┌────────────┐ ┌──────────┐ ┌─────────┐  ┌────────────┐
   │ auth    │  │ rest       │ │ realtime │ │ storage │  │ meta       │
   │ ES256   │  │ query      │ │ WS +     │ │ blobs + │  │ introspect │
   │ scrypt  │  │ compiler   │ │ changelog│ │ RLS     │  │ simulator  │
   └────┬────┘  └─────┬──────┘ └────┬─────┘ └────┬────┘  └─────┬──────┘
        └─────────────┴─────────────┼────────────┴─────────────┘
                                    ▼
                        ┌───────────────────────┐
                        │  db.mjs :: asRole()   │  SET LOCAL ROLE + JWT claims GUC
                        └───────────┬───────────┘
                                    ▼
                        ┌───────────────────────┐
                        │  PGlite (Postgres 18) │  RLS · triggers · changelog
                        └───────────────────────┘
```

Three roles, exactly as Supabase models them:

| Role | RLS | Reachable by |
|---|---|---|
| `anon` | applies | any caller with no token |
| `authenticated` | applies | a caller with a valid JWT |
| `service_role` | **BYPASSRLS** | a byte-equal service key only — never a JWT |

---

## The API

```js
import { createClient } from './sdk/basalt.mjs';
const basalt = createClient('http://localhost:5252', ANON_KEY);

await basalt.auth.signUp({ email, password });

// SQL joins, which Firestore fundamentally cannot do
const { data } = await basalt
  .from('posts')
  .select('id, title, author:users(email), comments(body)')
  .eq('published', true)
  .order('created_at', { ascending: false })
  .limit(20);

// Snapshot + stream, atomically. See "the snapshot boundary" below.
basalt.channel('posts')
  .on('postgres_changes', { table: 'posts', event: '*' }, (e) => render(e))
  .withSnapshot()
  .subscribe();

await basalt.storage.from('avatars').upload('me.png', file);
```

Endpoints: `/auth/v1`, `/rest/v1`, `/realtime/v1`, `/storage/v1`, `/meta/v1`.

---

## The three problems `fundamental.md` said would hurt

### 1. Authorizing a row that no longer exists

Re-selecting a changed row to check "may this subscriber see it?" works for INSERT and
UPDATE. It cannot work for DELETE — the row is gone. Supabase's answer is
`REPLICA IDENTITY FULL` plus a bespoke check.

Basalt pulls the policy's own `USING` expression out of `pg_policies` and evaluates it
against a **synthetic record** rebuilt from the changelog payload:

```sql
select u.ord - 1 as idx
  from unnest($1::jsonb[]) with ordinality u(rec, ord)
  cross join lateral jsonb_populate_record(null::public.posts, u.rec) as posts
 where (author_id = auth.uid()) or (published)   -- the real policy text
```

Same predicate, same claims, same role — so INSERT, UPDATE and DELETE authorize through one
code path, and a deleted row is only ever delivered to someone who could have selected it
while it lived. Permissive policies are OR'd, restrictive AND'd, RLS-off means visible,
RLS-on-with-no-policy means denied. Exactly Postgres' own semantics.

One query per `(table, identity)` per batch, not per row — the naive shape is
`O(rows × subscribers)` round trips and is precisely where Supabase's `postgres_changes`
hits its ceiling.

### 2. The snapshot / stream boundary

A subscriber reads current state, then starts streaming. A write landing between the two is
lost forever, or applied twice.

The snapshot and the changelog watermark are taken in **one transaction**, at
`REPEATABLE READ`, and the stream then delivers strictly `id > watermark`.

`REPEATABLE READ` is load-bearing. Under the default `READ COMMITTED` the two statements
take separate snapshots, and a row committing between them lands in the snapshot *and*
carries an id above the watermark — a duplicate.

The subscriber reads the watermark through a `SECURITY DEFINER` function rather than
selecting from `realtime.changelog`, which holds every table's changes unfiltered.

### 3. Refresh-token reuse

Refresh tokens are single-use and grouped into families. Presenting a spent token means two
parties hold it; we cannot tell thief from victim, so the whole family is revoked.

**The subtle part:** the revoke must run in its own committed transaction. Revoking inside
the detection transaction and then throwing rolls the revoke back. The caller still receives
a 401, so the bug is invisible from outside — while the stolen token stays live. This was a
real bug in this codebase, caught by the test that asserts the *victim's* token also dies.

---

## Choices, and the reasoning

**Change capture is a durable changelog, not `LISTEN/NOTIFY`.** `fundamental.md` warns off
NOTIFY: 8000-byte payload cap, no durability. Both are real (verified). So a trigger writes
the full change into `realtime.changelog` — ordered, durable, resumable by watermark — and
`pg_notify` carries **only the row id** as a wakeup nudge. A dropped notification costs
nothing; a 1s poll catches up. The trigger is `SECURITY DEFINER`, or `authenticated` (who
has no INSERT on the changelog) could not write to its own tables.

**ES256, not HS256.** The auth service holds the private key; everything else verifies with
the public key, served at `/auth/v1/jwks`. The algorithm is **pinned**, never read from the
token header — trusting `alg` is the classic JWT vulnerability, and there is a test for it.

**scrypt, not bcrypt.** `pgcrypto` is unavailable in PGlite. Node's built-in scrypt is
memory-hard and needs no native dependency. Sign-in runs a dummy hash on unknown emails so
timing cannot enumerate users.

**A token can never name itself `service_role`.** `identityFromRequest` clamps a verified
JWT's role to `anon | authenticated`. The service key is compared as a shared secret *before*
any token parsing. There is a test that signs a `service_role` token with the real private
key and asserts it is refused.

**The query compiler validates identifiers against the catalog and binds every value.**
An unknown column is a 400, never a query. `?title=eq.'; drop table posts--` is a bound
parameter that matches nothing.

**Unfiltered UPDATE/DELETE is refused** unless you send `Prefer: allow-unfiltered`. RLS still
protects other tenants, but nothing stops you from rewriting every row you *do* own.

---

## Studio

Dark-first admin dashboard (React 19 + Tailwind 4). Built on the shadcn/ui token contract —
CSS-variable theme tokens plus `cn()` — so components from
[21st.dev](https://21st.dev) drop in unmodified.

- **Overview** — flags any table with RLS disabled, because one missing
  `ENABLE ROW LEVEL SECURITY` is a data breach.
- **Projects** — the provider control plane: create a tenant, copy its publishable key.
- **Database** — a Firestore-style console, mapping the relational model onto Firestore's shape:
  - **Data** tab — a three-column miller-columns browser: **collections** (tables) →
    **documents** (rows) → **fields** (columns). Add a collection, add/edit/delete a document,
    add a field — the same navigation as Firestore's data viewer.
  - **Rules** tab — the RLS policies rendered as `create policy` SQL in an editor, with a
    **Publish** button, and a **Rules Playground** that runs a query as any role and user
    (writes roll back). This is the clearest way to internalize that **RLS filters where
    Firestore Rules reject**: a query that returns zero rows was *allowed*, not denied.
- **Realtime inspector** — the live changelog, connected as `service_role`.
- **SQL editor**, **Auth users**, **Storage browser**.

Text passes 4.5:1 contrast in both themes; `prefers-reduced-motion` is respected; the grid
scrolls inside its own container so the page never scrolls sideways.

---

## Tests

```
npm test     # 49 passing
```

They exist to prove the security properties, not to exercise happy paths. Cross-tenant reads,
`WITH CHECK` on ownership transfer, embedded resources filtered by *their own* policies,
`alg=none`, tampered payloads, role escalation, refresh reuse burning the family, global
sign-out, user enumeration by timing, realtime delivering DELETE to exactly one of two
subscribers, snapshot/stream no-gap-no-duplicate, resume-with-`since` still enforcing RLS,
signed-URL tampering, and the simulator rolling back.

`test/sdk.test.mjs` drives the SDK against a live server, because three bugs — a null body on
GET, a `localStorage` global that exists but does not work, and two clients sharing one
session store — were invisible to server-side tests. It also fires five concurrent refreshes
and asserts the session survives.

---

## What this is not

**Honest limits, stated plainly.**

- **Changelog ids are assumed to be assigned in commit order.** PGlite runs a single backend
  and serializes transactions, so this holds here. On a concurrent Postgres it does **not**:
  `bigserial` ids are assigned at INSERT time, not COMMIT time, so txn A can take id 5, txn B
  take id 6, and B commit first. A reader watermarking at 6 would skip 5 forever. Porting to
  real Postgres means ordering by commit LSN — a logical replication slot — not by sequence.
  This is the single change that matters most, and `fundamental.md` §6.7 warns that an
  abandoned slot will fill the disk and take the primary down. Alert on slot lag from day one.
- **Single-node, single-writer.** PGlite serializes transactions. Throughput is a laptop's,
  not a cluster's.
- **Realtime authorization is the RLS re-check design**, batched per `(table, identity)`. It
  does not fan out to tens of thousands of subscribers on a hot table. The scalable answer is
  the topic/channel abstraction described in `fundamental.md` §5.4 — authorize once at
  subscribe time against a precomputed topic key, then broadcast without re-checking.
- **No offline layer.** Firestore's local cache and optimistic mutation queue is the single
  most valuable and least-replicated part of that product, and it is not here.
- **`anon` gets `403 permission denied`, not `[]`,** when a table has no GRANT — Postgres
  checks GRANT before RLS. Stricter than Supabase's silent empty array, and arguably better.
- Storage blobs are on local disk. No CDN, no image transforms, no resumable uploads.
- No email delivery, so no magic links, password reset, or verification flow.
- Migrations are "run SQL in the Studio." There is no versioned migration tool.

---

## Layout

```
sql/bootstrap.sql   roles, projects control plane, auth schema, changelog, storage
server/
  db.mjs            asRole() · catalog allowlist · projects registry · policy reconstruction
  projects.mjs      create/list/delete tenants (schema + keys per project)
  auth.mjs          resolveIdentity (routes by key to a project) · rotation with reuse detection
  jwt.mjs           ES256, algorithm pinned
  password.mjs      scrypt + timing-equalized failure
  rest.mjs          PostgREST-style compiler (identifiers validated, values bound)
  realtime.mjs      WS · changelog reader · per-subscriber authorization
  storage.mjs       blobs, RLS on metadata, signed URLs
  meta.mjs          introspection · SQL runner · policy simulator
  index.mjs         HTTP router
sdk/basalt.mjs      client: createClient({url,key}), single-flight refresh, realtime
studio/             React 19 + Tailwind 4 admin dashboard (incl. Projects view)
chat.html           example customer app — realtime chat (rooms, presence, typing)
chat-setup.mjs      one-time rules/schema setup for the chat (provider runs it)
test/               49 adversarial tests (server + SDK + multi-tenant isolation)
```
