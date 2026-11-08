# Fundamentals: How Firestore and Supabase Work

A reference for building a backend-as-a-service (BaaS). This document breaks down what each
system actually does, how it does it internally, and what the minimum viable feature set
looks like if you want to build something comparable.

---

## Table of Contents

1. [What a BaaS Actually Is](#1-what-a-baas-actually-is)
2. [Firestore](#2-firestore)
3. [Supabase](#3-supabase)
4. [Side-by-Side Comparison](#4-side-by-side-comparison)
5. [The Core Subsystems You Must Build](#5-the-core-subsystems-you-must-build)
6. [Hard Problems and Where They Bite](#6-hard-problems-and-where-they-bite)

---

## 1. What a BaaS Actually Is

A backend-as-a-service replaces the layer of code most apps write over and over: an HTTP
server that authenticates a request, checks whether the caller may touch a row, reads or
writes a database, and returns JSON.

The insight behind both Firestore and Supabase is the same: **if authorization can be
expressed declaratively and evaluated server-side, then the client can talk to the database
directly.** No hand-written API layer. The security policy *is* the API layer.

Every BaaS is therefore some combination of these subsystems:

| Subsystem | Purpose |
|---|---|
| Data store | Persist and query application data |
| Auth | Establish caller identity, issue verifiable tokens |
| Authorization | Decide, per request, whether identity X may perform action Y on resource Z |
| Realtime | Push data changes to connected clients without polling |
| Storage | Store large binary blobs (files, images) outside the primary DB |
| Serverless functions | Run custom trusted code, on request or on data-change |
| Client SDKs | Make all of the above ergonomic from a browser or mobile app |
| Admin/dashboard | Inspect data, manage users, edit rules |

Firestore and Supabase differ almost entirely in *what they chose for the data store*, and
nearly everything else follows from that one decision.

---

## 2. Firestore

### 2.1 What It Is

Google Cloud Firestore is a distributed, document-oriented NoSQL database with first-class
realtime synchronization and offline support. It descends from Google's Spanner
infrastructure, which gives it strong consistency and horizontal scale but constrains its
query model severely.

### 2.2 Data Model

The hierarchy is strict and alternating:

```
collection → document → subcollection → document → ...
```

```
users/                          (collection)
  user_abc/                     (document)
    name: "Alice"
    createdAt: <timestamp>
    orders/                     (subcollection)
      order_001/                (document)
        total: 4200
        items: [ {...}, {...} ]
```

Key properties:

- A **document** is a map of field → value. Max size **1 MiB**.
- Documents are **schemaless**. Two docs in one collection need not share fields.
- **Subcollections are not part of the parent document.** Deleting a document does *not*
  delete its subcollections. Fetching a document does *not* fetch its subcollections.
- A path uniquely identifies a document: `users/user_abc/orders/order_001`.
- Supported types: string, number, boolean, null, timestamp, geopoint, bytes, array, map,
  and document reference.

### 2.3 The Query Engine

**This is the single most important thing to understand about Firestore.**

> Every query must be servable from an index, and the cost of a query is proportional to
> the size of the result set — never to the size of the collection.

This is the design constraint that makes Firestore scale, and the reason its query language
looks anemic compared to SQL.

**Automatic indexing.** Firestore automatically maintains a single-field ascending index and
a single-field descending index for every field of every document. This is why writes cost
more than you'd expect: one document write with 20 fields fans out to ~40 index writes.

**Composite indexes.** Any query filtering or ordering on more than one field requires a
composite index that you declare ahead of time (in `firestore.indexes.json`). If you run
such a query without the index, Firestore fails the request and helpfully returns a console
URL that pre-fills the index definition.

**What you can do:**

- Equality filters: `where("status", "==", "active")`
- Range filters: `<`, `<=`, `>`, `>=`, on a single field per query (historically; newer
  versions relax this somewhat)
- `in`, `not-in`, `array-contains`, `array-contains-any` (with cardinality caps, e.g. 30)
- `orderBy`, `limit`, `startAt` / `startAfter` / `endBefore` cursors
- Collection group queries: query `orders` across *all* users at once
- Aggregations: `count()`, `sum()`, `average()` (server-side, cheap, added later)

**What you cannot do:**

- **Joins.** None. Denormalize or make N round trips.
- **Full-text search.** Requires exporting to Algolia / Typesense / Elastic.
- Arbitrary `OR` across different fields (only a limited disjunction is supported)
- `LIKE` / substring matching (prefix matching via range trick only)
- Offset-based pagination that is cheap (you pay for skipped documents)

### 2.4 Realtime Listeners

The marquee feature. Instead of `get()`, call `onSnapshot()`:

```js
onSnapshot(query(collection(db, "orders"), where("status", "==", "open")),
  (snapshot) => {
    snapshot.docChanges().forEach(change => {
      // change.type is "added" | "modified" | "removed"
    });
  });
```

**How it works internally:**

1. The client opens a long-lived bidirectional stream to the Firestore frontend (gRPC, or
   WebChannel over HTTP on the web).
2. The client registers a **target**: a serialized query.
3. Firestore's backend registers that target against the index ranges the query touches.
4. When any write commits, the backend determines which live targets are affected by
   consulting those index ranges, and pushes the delta.
5. The client applies the delta to a local view and emits `docChanges()` — the *diff*, not
   the full result set. This is what makes list UIs efficient.
6. Periodically the server sends a **resume token**. If the connection drops, the client
   reconnects with the token and receives only what it missed, rather than re-reading the
   whole query.

**Billing:** you are charged one document read per document delivered — including on the
initial snapshot and on every subsequent change. A listener on a 500-doc query costs 500
reads immediately.

### 2.5 Offline Support and Local Cache

The SDK keeps a local persistence layer (IndexedDB on web, SQLite/LevelDB on mobile).

- Reads are served from cache when offline, and the snapshot is flagged
  `metadata.fromCache = true`.
- Writes go into a **mutation queue**, applied optimistically to the local view. The UI
  updates instantly; `snapshot.metadata.hasPendingWrites` is `true`.
- On reconnect, the queue drains to the server in order. The server's result overwrites the
  optimistic local value.
- Conflict resolution is **last-write-wins** at the field level for `update()`, and
  last-write-wins at the document level for `set()`. There is no merge/CRDT logic. If you
  need conflict-free counters, use `FieldValue.increment()`, which is applied
  server-side as a transform rather than as an absolute value.

### 2.6 Transactions and Atomic Writes

Three mechanisms:

**Batched writes** — up to 500 operations, all-or-nothing, no reads:

```js
const batch = writeBatch(db);
batch.set(ref1, {...});
batch.update(ref2, {...});
batch.delete(ref3);
await batch.commit();
```

**Transactions** — read-then-write with optimistic concurrency:

```js
await runTransaction(db, async (tx) => {
  const snap = await tx.get(counterRef);
  tx.update(counterRef, { count: snap.data().count + 1 });
});
```

The transaction function may be **retried**, so it must be a pure function of its reads.
Firestore tracks the versions of documents read; if any changed before commit, the whole
transaction re-runs.

**Field transforms** — server-side operations that avoid read-modify-write entirely:
`increment()`, `arrayUnion()`, `arrayRemove()`, `serverTimestamp()`, `deleteField()`.

### 2.7 Security Rules

A declarative, sandboxed DSL evaluated on the server for *every* document access. This is
the authorization layer.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;

      match /orders/{orderId} {
        allow read, write: if request.auth.uid == userId;
      }
    }

    match /posts/{postId} {
      allow read: if resource.data.published == true;
      allow create: if request.auth != null
                    && request.resource.data.authorId == request.auth.uid
                    && request.resource.data.title.size() < 200;
    }
  }
}
```

Semantics worth internalizing:

- `request.auth` — decoded JWT claims of the caller (`uid`, `token.email`, custom claims).
- `resource.data` — the document **as it currently exists**.
- `request.resource.data` — the document **as it would exist after the write**. Comparing
  the two is how you enforce immutability of a field.
- `allow` rules are **additive OR** — if any matching rule allows, the access is permitted.
  There is no `deny`.
- Rules **are not filters.** A query is rejected outright unless the rules can prove that
  *every possible document the query could return* is readable, based on the query's own
  constraints. `where("ownerId", "==", request.auth.uid)` is required for a rule keyed on
  `ownerId` — Firestore will not silently drop unreadable docs.
- Rules may perform `get()` and `exists()` lookups on other documents (e.g. a `roles/{uid}`
  doc), but you're limited to ~10 such calls per single-doc request, and each is billed.

### 2.8 Cloud Functions

Trusted server-side code, triggered by:

- **Firestore events**: `onDocumentCreated`, `onDocumentUpdated`, `onDocumentDeleted`,
  `onDocumentWritten`, scoped to a path pattern like `users/{userId}/orders/{orderId}`.
- **Auth events**: user created, user deleted.
- **HTTP**: plain request handler, or `onCall` (which auto-verifies the Firebase ID token
  and hands you `context.auth`).
- **Schedule**: cron.
- **Storage events**: object finalized, deleted.

Critical property: **delivery is at-least-once, and ordering is not guaranteed.** Triggers
can fire twice for one write. Handlers must be idempotent — typically by keying on the
event ID or by making the operation naturally idempotent.

Trigger functions bypass Security Rules entirely (they run with admin credentials).

### 2.9 Everything Else in the Firebase Bundle

- **Firebase Auth** — email/password, phone, OAuth providers, anonymous. Issues a JWT ID
  token, refreshed hourly. Custom claims (max 1000 bytes) are baked into the token and are
  the standard way to do role-based access in Rules.
- **Cloud Storage** — GCS buckets with their own parallel Security Rules language.
- **App Check** — attests that requests originate from your genuine app binary.

### 2.10 Firestore's Cost Model

You pay per **document read**, **document write**, **document delete**, plus storage and
egress. You do not pay for query complexity, because there isn't any.

This inverts normal database intuition. The optimization target is *number of documents
touched*, so idiomatic Firestore heavily denormalizes: you duplicate an author's name into
every post document to avoid a second read, and you maintain aggregate counters via
`increment()` in a Cloud Function rather than running `count()` on every page load.

---

## 3. Supabase

### 3.1 What It Is

Supabase is **not a database**. It is a set of open-source services assembled around a
stock PostgreSQL instance, each of which exposes some Postgres capability over the network
in a way that's safe to call from a browser.

The pitch: everything Firebase gives you, but the data store is a real relational database
you already know, and you can leave whenever you want because it's just Postgres.

### 3.2 Architecture

```
                    ┌──────────────────────────┐
   Client SDK  ───► │  Kong (API gateway)      │
                    └────────────┬─────────────┘
                                 │
      ┌──────────────┬───────────┼────────────┬──────────────┐
      ▼              ▼           ▼            ▼              ▼
  ┌────────┐   ┌──────────┐  ┌────────┐  ┌─────────┐  ┌───────────┐
  │ GoTrue │   │PostgREST │  │Realtime│  │ Storage │  │   Edge    │
  │ (auth) │   │  (REST)  │  │(Elixir)│  │  API    │  │ Functions │
  └───┬────┘   └────┬─────┘  └───┬────┘  └────┬────┘  │  (Deno)   │
      │             │            │            │       └───────────┘
      └─────────────┴────────────┴────────────┘
                          │
                   ┌──────▼───────┐
                   │  PostgreSQL  │
                   │  + RLS       │
                   │  + WAL       │
                   └──────────────┘
```

Each box is a separate open-source project. You can self-host the whole stack with Docker
Compose.

### 3.3 PostgREST: The Auto-Generated API

PostgREST introspects the Postgres catalog and exposes every table, view, and function in
the exposed schema as a REST endpoint. No code generation, no server to write.

```
GET  /rest/v1/orders?status=eq.open&select=id,total,customer:customers(name)&order=total.desc&limit=20
```

That URL compiles to roughly:

```sql
SELECT o.id, o.total, row_to_json(c.*) AS customer
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'open'
ORDER BY o.total DESC
LIMIT 20;
```

The JS client wraps this:

```js
const { data, error } = await supabase
  .from('orders')
  .select('id, total, customer:customers(name)')
  .eq('status', 'open')
  .order('total', { ascending: false })
  .limit(20);
```

Available operators: `eq, neq, gt, gte, lt, lte, like, ilike, is, in, cs` (contains),
`cd` (contained by), `ov` (overlaps), `fts` / `plfts` / `phfts` (full-text search), plus
`and` / `or` / `not` composition.

**Embedded resources** (`customers(name)`) are resolved through declared foreign keys —
this is a real SQL join, which Firestore fundamentally cannot do.

**RPC.** Any Postgres function is callable: `supabase.rpc('calculate_invoice', { order_id })`.
This is the escape hatch for anything the REST grammar can't express — CTEs, window
functions, recursive queries, multi-statement transactions.

### 3.4 Row Level Security

Authorization is not a separate DSL. It's a native Postgres feature.

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read their own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users insert their own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

- `USING` — a predicate appended to the `WHERE` clause of every `SELECT`/`UPDATE`/`DELETE`.
- `WITH CHECK` — a predicate the *new* row must satisfy on `INSERT`/`UPDATE`.
- `auth.uid()` is a SQL helper that reads the `sub` claim out of the request's JWT, which
  PostgREST has set as a session-local GUC (`request.jwt.claims`).

The mechanics: PostgREST verifies the JWT, then opens a transaction as a low-privilege role
(`authenticated` or `anon`), sets `request.jwt.claims`, and runs your query. Postgres applies
the RLS predicates. Nothing the client sends can escape them.

**Crucial contrast with Firestore.** RLS policies **filter**. A `SELECT * FROM orders` with
RLS enabled silently returns only the rows you may see. Firestore Security Rules **reject**:
an unconstrained `collection("orders")` query fails outright. Filtering is more ergonomic;
rejecting is arguably safer, because it forces the client's query to state its scope.

**Performance trap:** RLS predicates run per-row. `auth.uid() = user_id` is fine if
`user_id` is indexed, but a policy containing a correlated subquery over another table
turns a seq-scan-free query into a disaster. Wrapping in `(SELECT auth.uid())` lets Postgres
hoist it out as an InitPlan and evaluate it once instead of per row.

### 3.5 Realtime

Three distinct features share one WebSocket connection to the Elixir Realtime server.

**Postgres Changes.** Realtime connects to Postgres as a **logical replication** subscriber,
reading the WAL through a replication slot. Every committed `INSERT`/`UPDATE`/`DELETE` on a
table in the `supabase_realtime` publication becomes a message. Before forwarding a change
to a subscriber, Realtime re-checks that subscriber's RLS visibility for that row.

```js
supabase.channel('orders-feed')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: 'status=eq.open' },
      payload => console.log(payload.new, payload.old))
  .subscribe();
```

Limitations, and they matter:
- The per-row RLS re-check is the scalability bottleneck. It does not fan out to tens of
  thousands of subscribers on a hot table.
- `filter` supports one simple equality/comparison, not a general query.
- Because the source is the WAL, `old` values on `UPDATE`/`DELETE` require setting
  `REPLICA IDENTITY FULL` on the table (which increases WAL volume).
- You receive events; you do **not** receive an initial snapshot. You must `select()`
  separately and reconcile — unlike Firestore's `onSnapshot`, which unifies both.

**Broadcast.** Ephemeral pub/sub between clients. Doesn't touch the database at all. This is
the right tool for cursors, typing indicators, and any high-frequency signal. Postgres can
also emit into a Broadcast channel via a trigger calling `realtime.send()` — the modern,
scalable replacement for Postgres Changes.

**Presence.** Tracks who is currently subscribed to a channel, synchronized across nodes via
a CRDT. Used for "3 people viewing this document."

### 3.6 Auth (GoTrue)

A standalone auth server writing to the `auth.users` table.

- Email/password, magic links, OTP, phone, ~20 OAuth providers, SAML, anonymous sign-in.
- Issues a short-lived **access token** (a signed JWT, default 1 hour) and a long-lived,
  single-use **refresh token**.
- The JWT carries `sub` (user id), `role`, `email`, `aud`, `exp`, plus `app_metadata`
  (server-controlled — put roles here) and `user_metadata` (user-writable — never trust it
  for authorization).
- MFA (TOTP), and **AAL** (Authenticator Assurance Level) claims you can require in RLS.
- Row-level integration: `auth.uid()`, `auth.jwt()`, `auth.role()` are just SQL functions
  over the session GUC.

Because `auth.users` lives in the same database as your app tables, you can foreign-key to
it directly — a `profiles` table with `id uuid references auth.users(id) on delete cascade`
is the canonical pattern. Firestore cannot express this constraint at all.

### 3.7 Storage

An S3-compatible object store. Object *metadata* lives in the `storage.objects` Postgres
table, which means **file permissions are RLS policies on that table** — the same mental
model as your data.

```sql
CREATE POLICY "users manage their own avatars"
  ON storage.objects FOR ALL
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
```

Supports resumable uploads (TUS), signed URLs, and a CDN-backed image transformation layer.

### 3.8 Edge Functions

Deno-based serverless functions deployed to the edge. TypeScript, Web-standard APIs.

```ts
Deno.serve(async (req) => {
  const { record } = await req.json();
  return new Response(JSON.stringify({ ok: true }));
});
```

Note the difference from Cloud Functions: Edge Functions have **no native database
triggers**. To run code on a data change you write a Postgres trigger that calls the
function over HTTP via the `pg_net` extension, or you enqueue into `pgmq` and drain it. This
is more assembly than Firebase requires, but every piece is inspectable.

### 3.9 The Postgres Extension Surface

The strongest argument for the Supabase model. You inherit:

- **pgvector** — vector similarity search, so embeddings live next to your rows.
- **PostGIS** — real geospatial queries.
- **pg_cron** — scheduled jobs inside the database.
- **pg_net** — async outbound HTTP from SQL.
- **pgmq** — a message queue.
- **pg_stat_statements** — query performance introspection.
- Full-text search (`tsvector`), JSONB with GIN indexes, materialized views, partitioning,
  window functions, CTEs, triggers, and every other thing 30 years of Postgres gives you.

### 3.10 Supabase's Cost Model

You pay for compute (an instance size), storage (GB), bandwidth, and monthly active users.
You do **not** pay per read. A query returning 10,000 rows costs the same as one returning 1
— which is the exact opposite of Firestore's incentive structure.

The consequence: in Supabase your enemy is the query planner. In Firestore your enemy is the
document counter.

---

## 4. Side-by-Side Comparison

| Dimension | Firestore | Supabase |
|---|---|---|
| Data model | Documents in collections, subcollections | Relational tables, rows |
| Schema | None enforced | Enforced, with migrations |
| Query language | Restricted index-only DSL | Full SQL |
| Joins | Impossible | Native |
| Full-text search | External service required | Built in (`tsvector`) |
| Aggregations | `count/sum/avg` only | Anything SQL can express |
| Authorization | Security Rules DSL — **rejects** bad queries | Postgres RLS — **filters** rows |
| Realtime | `onSnapshot`: initial state + diffs, one primitive | WAL → Postgres Changes; plus Broadcast, Presence |
| Realtime scale | Very high; core to the design | The weak point; RLS re-check per row per subscriber |
| Offline | First-class: local cache + optimistic mutation queue | Not built in; bring your own (PowerSync, ElectricSQL, WatermelonDB) |
| Transactions | Optimistic, retry-based, doc-version tracking | Full ACID, all isolation levels |
| Functions | Cloud Functions, native DB triggers, at-least-once | Edge Functions; DB triggers require `pg_net` wiring |
| Scaling | Automatic, effectively unbounded horizontally | Vertical, plus read replicas; you manage it |
| Cost driver | Documents read/written | Compute + storage + MAU |
| Lock-in | High — no export path to an equivalent | Low — it is Postgres; `pg_dump` and walk away |
| Self-host | No | Yes, fully |

**When each wins:**

- Firestore wins for mobile/offline-first apps, chat, collaborative presence, and workloads
  with unpredictable extreme scale and simple access patterns.
- Supabase wins for anything with relational integrity, reporting, analytics, complex
  authorization, vector search, or a team that already knows SQL.

**The reason for the split:** Firestore's constraints are not arbitrary. Disallowing joins
and unindexed queries is precisely what allows any query's cost to be bounded and any
listener's invalidation to be computed cheaply at scale. Supabase trades that guarantee for
expressiveness. You cannot have both in one system, and every design decision below inherits
this tension.

---

## 5. The Core Subsystems You Must Build

If you build a BaaS, this is the minimum surface area. Ordered by dependency.

### 5.1 Storage Engine + Query Layer

Decide first — everything else follows:

- **Wrap Postgres** (the Supabase path). Fastest to a working product. You get transactions,
  indexes, constraints, and a query planner for free. Your work is the *network-facing* layer.
- **Build a document store** (the Firestore path). Enormously more work. You need your own
  index maintenance, your own query planner, your own replication.

For a first version, wrap Postgres. Building a correct distributed document store is a
multi-year project and there is no partial credit on durability.

### 5.2 Auth Service

- User table, password hashing (argon2id or bcrypt — never anything you wrote).
- JWT issuance. Asymmetric signing (ES256/RS256) so the API layer verifies with a public key
  and never holds the private key.
- Short access token (≤1h) + rotating single-use refresh token, with reuse detection: if a
  refresh token is presented twice, revoke the whole family — that's a stolen token.
- OAuth provider flows, email verification, password reset (constant-time, no user
  enumeration through timing or response differences).
- Session revocation. JWTs are stateless, so "log out everywhere" requires either a
  short expiry or a denylist checked on refresh.

### 5.3 Authorization Engine

The heart of the product. Two viable designs:

**Filter-based (RLS-style).** Rewrite every incoming query to append a predicate. If you're
on Postgres, this is free — turn on RLS and set a session variable from the JWT. Ergonomic;
the client writes natural queries. Risk: a missing `ENABLE ROW LEVEL SECURITY` on one table
silently exposes it. Your migration tooling must refuse to ship a public table without a
policy.

**Reject-based (Rules-style).** Evaluate a policy against the request and refuse it if the
policy can't prove safety. Harder to implement (you're essentially proving that a query's
constraints imply the rule's predicate), but it makes accidental exposure structurally
impossible.

Whichever you choose: **the policy must be evaluated in the data path, not before it.**
Authorization that runs in the client SDK, or in an API layer that then queries the DB as
superuser, is not authorization — it is a suggestion.

### 5.4 Realtime Engine

Three parts:

1. **Change capture.** On Postgres: logical replication (`wal2json` / `pgoutput`) via a
   replication slot. Do not use `LISTEN`/`NOTIFY` for this — the payload cap is 8000 bytes
   and it doesn't survive restarts. A replication slot gives you an ordered, durable,
   resumable stream, at the cost that an abandoned slot will fill your disk with retained
   WAL until the server dies. Monitor slot lag as a page-worthy alert.

2. **Subscription matching.** Given a change, which of the N connected subscribers care?
   Naive: evaluate every subscription against every change — O(N) per write. This is where
   Supabase's Postgres Changes hits a wall. Firestore's approach is to index subscriptions by
   the query's index ranges, so a change looks up only the targets whose ranges it falls
   into. Build a subscription index from the start, or accept a low ceiling.

3. **Authorization on the push path.** Every message must be filtered by the recipient's
   permissions. This is the expensive part and the part that is most often gotten wrong.
   The scalable design is to precompute a *channel* (a topic key like `org:123:orders`) that
   the row's authorization implies, authorize the subscription once at subscribe time, and
   then fan out to the topic without re-checking per row.

Also decide: do subscribers receive an **initial snapshot** plus diffs (Firestore), or only
diffs (Supabase)? Snapshot-plus-diffs is far better DX and forces you to solve the
consistency problem — the snapshot and the stream must be taken at the same logical instant,
or the client can miss or double-apply a change. Read the snapshot inside the same
transaction whose LSN starts the stream.

### 5.5 Client SDK

Where the developer experience is actually won or lost. It must handle:

- Token storage, automatic refresh before expiry, and a single in-flight refresh (a naive
  implementation fires ten parallel refreshes and invalidates its own token family).
- WebSocket reconnection with exponential backoff and jitter, and **resumption** — a resume
  token or LSN, so a reconnect isn't a full re-read.
- A local cache, if you want offline. This is the hardest client-side problem: an optimistic
  mutation queue, a local query engine to serve reads against pending writes, and a
  reconciliation strategy for when the server disagrees. Firestore's offline layer is
  probably the single most valuable and least-replicated part of the product.
- Typed queries generated from the schema.

### 5.6 Functions Runtime

Sandboxed execution of user code. The realistic v1 is: run containers, trigger them over
HTTP, and give them a service-role credential that bypasses authorization.

If you offer data-change triggers, be explicit in your docs that delivery is **at-least-once
and unordered**, because making it exactly-once is not something you're going to solve. Give
users an event ID they can deduplicate on.

### 5.7 Dashboard, Migrations, Observability

Unglamorous and non-optional. A table editor, a log viewer, a policy editor with a
"simulate this request as user X" tester (Firestore's Rules Playground is the reference
implementation), migration tooling with a review step, and per-project metrics.

---

## 6. Hard Problems and Where They Bite

Ranked by how much they will hurt.

**1. Authorization on the realtime path.** Easy to check permissions on a request/response
read. Genuinely hard to check them on a push to 50,000 subscribers when a row changes. Every
BaaS has scars here. Design the topic/channel abstraction before you write the fan-out code,
not after.

**2. The snapshot/stream consistency boundary.** A client subscribes. You read current state
and start streaming changes. If a write lands between the read and the stream start, it is
lost forever; if the stream starts first, it may be applied twice. Solve it with an LSN or
document-version watermark, taken inside the read's transaction, and make client-side
application idempotent.

**3. Offline conflict resolution.** Last-write-wins is what Firestore chose and it is the
right default because it is comprehensible. Field-level transforms (`increment`,
`arrayUnion`) exist precisely because LWW destroys counters. If you want more, you are
building CRDTs, and that is a different product.

**4. Multi-tenant noisy neighbors.** One customer's unindexed sequential scan should not
degrade another's. Firestore's design forbids the query outright. Postgres will happily run
it. Either enforce statement timeouts and per-tenant resource limits, or isolate at the
instance level.

**5. Schema evolution against live clients.** Old app versions in the wild query columns you
want to drop. Expand/contract migrations, versioned APIs, or you break users.

**6. Index maintenance cost.** Firestore's automatic indexing is a real product feature and
a real write-amplification cost. If you index everything by default, be honest about it in
your pricing and let users opt fields out.

**7. Replication slot management.** If you build realtime on Postgres logical replication:
an inactive slot retains WAL indefinitely and will fill the disk and take down the primary.
This has taken down production systems. Alert on slot lag from day one.

**8. Getting the client SDK's refresh logic right.** Sounds trivial. It is the source of a
disproportionate number of production incidents in every auth system, because the failure
mode — a thundering herd of parallel refreshes that revoke each other — only appears under
load.

---

## Recommended Reading

- Firestore data model and query limits — `firebase.google.com/docs/firestore`
- Firestore Security Rules language reference
- PostgREST documentation — the API grammar in full
- Postgres Row Level Security — `postgresql.org/docs/current/ddl-rowsecurity.html`
- Postgres logical replication and replication slots
- Supabase self-hosting `docker-compose.yml` — the clearest possible map of the architecture
