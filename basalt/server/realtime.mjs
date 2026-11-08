// Realtime engine.
//
// Three primitives share one WebSocket, mirroring the shape fundamental.md
// describes: postgres_changes (durable, authorized), broadcast (ephemeral,
// cheap), presence (who is here).
//
// -----------------------------------------------------------------------------
// The two hard problems, and how they are solved here
// -----------------------------------------------------------------------------
//
// (1) AUTHORIZING A ROW THAT NO LONGER EXISTS.
//     A DELETE removes the row, so "re-select it as the subscriber" cannot work.
//     Supabase's answer is REPLICA IDENTITY FULL plus a bespoke check. Ours is
//     to pull the policy's own USING expression out of pg_policies and evaluate
//     it against a *synthetic* record reconstructed from the changelog payload
//     via jsonb_populate_record. The predicate, the claims, and the role are all
//     identical to a real SELECT — so INSERT, UPDATE and DELETE authorize
//     through one code path, and a subscriber can never see a deleted row they
//     could not have selected while it lived.
//
// (2) THE SNAPSHOT / STREAM BOUNDARY.
//     A subscriber reads current state, then starts streaming. A write landing
//     between the two is either lost forever or applied twice. We take the
//     snapshot and the changelog watermark inside ONE transaction, then stream
//     strictly `id > watermark`. No gap, no duplicate.
//
//     CAVEAT, stated plainly: this relies on changelog ids being assigned in
//     commit order. PGlite runs a single backend and serializes transactions, so
//     that holds here. On a concurrent Postgres, bigserial ids are assigned at
//     INSERT time, not COMMIT time — txn A can take id=5, txn B take id=6, and B
//     commit first. A reader that watermarks at 6 would skip 5 forever. Porting
//     this to real Postgres requires ordering by commit LSN (a replication slot)
//     rather than by sequence. See README.

import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { db, q, asRole, asSuperuser, selectPredicate, getTable } from './db.mjs';
import { resolveIdentity } from './auth.mjs';
import * as jwt from './jwt.mjs';

const DRAIN_BATCH = 500;
const POLL_MS = 1000;      // safety net: NOTIFY is best-effort, the changelog is not
const RETENTION_MS = 5 * 60 * 1000;

/** @type {Map<string, Conn>} */
const conns = new Map();
let lastId = 0;
let draining = false;

class Conn {
  constructor(ws, identity) {
    this.id = randomUUID();
    this.ws = ws;
    this.identity = identity;         // { role, claims, userId }
    this.channels = new Map();        // name -> { type, config }
    this.alive = true;
  }
  send(msg) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
  get claimsKey() {
    return `${this.identity.role}:${JSON.stringify(this.identity.claims)}`;
  }
}

// -----------------------------------------------------------------------------
// Authorization
// -----------------------------------------------------------------------------

/**
 * Given one table and a set of candidate records, return the indices of those
 * visible to `role` under `claims`.
 *
 * One round trip per (table, identity) per drain batch, not per row — the naive
 * shape is O(rows x subscribers) queries and is exactly where Supabase's
 * postgres_changes hits its ceiling.
 */
async function visibleIndices(schema, table, role, claims, records) {
  if (!records.length) return new Set();

  const tbl = getTable(schema, table);
  if (!tbl) return new Set();

  const predicate = await selectPredicate(schema, table, role);
  if (predicate === 'true') return new Set(records.map((_, i) => i));
  if (predicate === 'false') return new Set();

  // `service_role` has BYPASSRLS, so it never reaches the predicate path.
  const rows = await asRole(role, claims, async (tx) => {
    const res = await tx.query(
      `select u.ord - 1 as idx
         from unnest($1::jsonb[]) with ordinality u(rec, ord)
         cross join lateral jsonb_populate_record(null::${q(schema)}.${q(table)}, u.rec) as ${q(table)}
        where ${predicate}`,
      [records.map((r) => JSON.stringify(r))],
    );
    return res.rows;
  });
  return new Set(rows.map((r) => Number(r.idx)));
}

/** Cheap client-side prefilter, e.g. `status=eq.open`. Reduces fan-out before authorization. */
function matchesFilter(filter, record) {
  if (!filter) return true;
  const eq = filter.indexOf('=');
  if (eq === -1) return true;
  const col = filter.slice(0, eq);
  const rest = filter.slice(eq + 1);
  const dot = rest.indexOf('.');
  if (dot === -1) return true;
  const op = rest.slice(0, dot);
  const val = rest.slice(dot + 1);
  const actual = record?.[col];
  if (actual === undefined) return false;
  switch (op) {
    case 'eq':  return String(actual) === val;
    case 'neq': return String(actual) !== val;
    case 'gt':  return Number(actual) >  Number(val);
    case 'gte': return Number(actual) >= Number(val);
    case 'lt':  return Number(actual) <  Number(val);
    case 'lte': return Number(actual) <= Number(val);
    case 'in':  return val.replace(/^\(|\)$/g, '').split(',').includes(String(actual));
    default:    return true;
  }
}

// -----------------------------------------------------------------------------
// Changelog reader
// -----------------------------------------------------------------------------

async function drain() {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const { rows } = await asSuperuser((tx) =>
        tx.query(
          `select id, schema_name, table_name, op, record, old_record, committed_at
             from realtime.changelog where id > $1 order by id asc limit ${DRAIN_BATCH}`,
          [lastId],
        ),
      );
      if (!rows.length) break;
      await dispatch(rows);
      lastId = Number(rows.at(-1).id);
      if (rows.length < DRAIN_BATCH) break;
    }
  } catch (err) {
    console.error('[realtime] drain failed:', err.message);
  } finally {
    draining = false;
  }
}

async function dispatch(changes) {
  // Group the work by (table, identity) so authorization is one query per group.
  // key -> { schema, table, role, claims, conns:Set, items:[{change, sub, chan}] }
  const groups = new Map();

  for (const change of changes) {
    const payload = change.op === 'DELETE' ? change.old_record : change.record;
    for (const conn of conns.values()) {
      for (const [chanName, chan] of conn.channels) {
        if (chan.type !== 'postgres_changes') continue;
        const c = chan.config;
        if (c.schema !== change.schema_name) continue;
        if (c.table && c.table !== change.table_name) continue;
        if (c.event && c.event !== '*' && c.event !== change.op) continue;
        if (!matchesFilter(c.filter, payload)) continue;
        // Never replay what the subscriber already had at snapshot time.
        if (chan.watermark != null && Number(change.id) <= chan.watermark) continue;

        const key = `${change.schema_name}.${change.table_name}|${conn.claimsKey}`;
        if (!groups.has(key)) {
          groups.set(key, {
            schema: change.schema_name,
            table: change.table_name,
            role: conn.identity.role,
            claims: conn.identity.claims,
            items: [],
          });
        }
        groups.get(key).items.push({ change, payload, conn, chanName });
      }
    }
  }

  for (const g of groups.values()) {
    let visible;
    try {
      visible = await visibleIndices(g.schema, g.table, g.role, g.claims, g.items.map((i) => i.payload));
    } catch (err) {
      console.error(`[realtime] authorization failed for ${g.schema}.${g.table}:`, err.message);
      continue; // fail closed: deliver nothing
    }
    g.items.forEach((item, i) => {
      if (!visible.has(i)) return;
      item.conn.send({
        type: 'change',
        channel: item.chanName,
        payload: {
          commit_id: Number(item.change.id),
          schema: item.change.schema_name,
          table: item.change.table_name,
          eventType: item.change.op,
          new: item.change.record,
          old: item.change.old_record,
          committed_at: item.change.committed_at,
        },
      });
    });
  }
}

/** Replay missed changes for a reconnecting subscriber, authorized the same way. */
async function replay(conn, chanName, chan, since) {
  const c = chan.config;
  const { rows } = await asSuperuser((tx) =>
    tx.query(
      `select id, schema_name, table_name, op, record, old_record, committed_at
         from realtime.changelog
        where id > $1 and schema_name = $2 and ($3::text is null or table_name = $3)
        order by id asc limit ${DRAIN_BATCH}`,
      [since, c.schema, c.table ?? null],
    ),
  );
  const relevant = rows.filter((r) => {
    const p = r.op === 'DELETE' ? r.old_record : r.record;
    if (c.event && c.event !== '*' && c.event !== r.op) return false;
    return matchesFilter(c.filter, p);
  });
  if (!relevant.length) return;

  const byTable = new Map();
  for (const r of relevant) {
    const k = `${r.schema_name}.${r.table_name}`;
    if (!byTable.has(k)) byTable.set(k, []);
    byTable.get(k).push(r);
  }
  for (const [k, rs] of byTable) {
    const [schema, table] = k.split('.');
    const payloads = rs.map((r) => (r.op === 'DELETE' ? r.old_record : r.record));
    const visible = await visibleIndices(schema, table, conn.identity.role, conn.identity.claims, payloads);
    rs.forEach((r, i) => {
      if (!visible.has(i)) return;
      conn.send({
        type: 'change',
        channel: chanName,
        replayed: true,
        payload: {
          commit_id: Number(r.id), schema: r.schema_name, table: r.table_name,
          eventType: r.op, new: r.record, old: r.old_record, committed_at: r.committed_at,
        },
      });
    });
  }
}

// -----------------------------------------------------------------------------
// Broadcast + presence
// -----------------------------------------------------------------------------
// Broadcast and presence are addressed by channel NAME, not by schema, so they
// must be scoped to the project explicitly — otherwise two tenants that both use
// a channel called "typing:general" would leak into each other.
function relayBroadcast(from, channel, event, payload) {
  for (const conn of conns.values()) {
    if (conn.identity.projectId !== from.identity.projectId) continue;
    const chan = conn.channels.get(channel);
    if (!chan || chan.type !== 'broadcast') continue;
    if (conn.id === from.id && !chan.config.self) continue;
    conn.send({ type: 'broadcast', channel, event, payload });
  }
}

function presenceState(channel, projectId) {
  const state = {};
  for (const conn of conns.values()) {
    if (conn.identity.projectId !== projectId) continue;
    const chan = conn.channels.get(channel);
    if (chan?.type === 'presence' && chan.state !== undefined) {
      state[conn.id] = { user_id: conn.identity.userId, state: chan.state };
    }
  }
  return state;
}

function syncPresence(channel, projectId) {
  const state = presenceState(channel, projectId);
  for (const conn of conns.values()) {
    if (conn.identity.projectId !== projectId) continue;
    if (conn.channels.get(channel)?.type === 'presence') {
      conn.send({ type: 'presence_state', channel, state });
    }
  }
}

// -----------------------------------------------------------------------------
// Server
// -----------------------------------------------------------------------------
export function attachRealtime(httpServer, { path = '/realtime/v1' } = {}) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) return; // let other upgrade handlers try

    let identity;
    try {
      const token = url.searchParams.get('token') || '';
      const apikey = url.searchParams.get('apikey') || '';
      // The identity carries the project + schema; a socket is bound to one project.
      identity = resolveIdentity({ headers: { authorization: token ? `Bearer ${token}` : '', apikey } });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, identity));
  });

  wss.on('connection', (ws, req, identity) => {
    const conn = new Conn(ws, identity);
    conns.set(conn.id, conn);
    conn.send({ type: 'connected', socket_id: conn.id, role: identity.role, user_id: identity.userId });

    ws.on('pong', () => { conn.alive = true; });

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return conn.send({ type: 'error', message: 'invalid json' }); }
      try {
        await handleMessage(conn, msg);
      } catch (err) {
        conn.send({ type: 'error', ref: msg.ref, channel: msg.channel, message: err.message });
      }
    });

    ws.on('close', () => {
      const presenceChannels = [...conn.channels.entries()]
        .filter(([, c]) => c.type === 'presence').map(([n]) => n);
      const projectId = conn.identity.projectId;
      conns.delete(conn.id);
      presenceChannels.forEach((ch) => syncPresence(ch, projectId));
    });
  });

  // Drop dead sockets so presence does not accumulate ghosts.
  const heartbeat = setInterval(() => {
    for (const conn of conns.values()) {
      if (!conn.alive) { conn.ws.terminate(); continue; }
      conn.alive = false;
      conn.ws.ping();
    }
  }, 30_000);
  heartbeat.unref?.();

  return wss;
}

async function handleMessage(conn, msg) {
  switch (msg.type) {
    case 'heartbeat':
      return conn.send({ type: 'heartbeat_ack', ref: msg.ref });

    case 'auth': {
      // Upgrade an anon socket to authenticated in place (e.g. after sign-in).
      // The token must belong to the SAME project this socket connected to.
      const claims = jwt.verify(msg.token);
      if ((claims.project ?? 'default') !== conn.identity.projectId) {
        throw new Error('token does not belong to this project');
      }
      conn.identity = { ...conn.identity, role: 'authenticated', claims: { ...claims, role: 'authenticated' }, userId: claims.sub };
      return conn.send({ type: 'auth_ok', ref: msg.ref, user_id: conn.identity.userId });
    }

    case 'subscribe': {
      const { channel, config = {} } = msg;
      if (!channel) throw new Error('channel required');
      const kind = config.postgres_changes ? 'postgres_changes'
                 : config.presence ? 'presence' : 'broadcast';

      if (kind === 'postgres_changes') {
        // The schema is forced to the socket's project — a client cannot ask to
        // watch another tenant's tables by naming their schema.
        const c = { event: '*', ...config.postgres_changes, schema: conn.identity.schema };
        const tbl = getTable(c.schema, c.table);
        if (!tbl) throw new Error(`unknown table ${c.schema}.${c.table}`);

        // Refuse the subscription outright when RLS denies everything, rather
        // than accepting it and silently never delivering.
        const pred = await selectPredicate(c.schema, c.table, conn.identity.role);
        if (pred === 'false') throw new Error(`no read policy on ${c.schema}.${c.table} for role ${conn.identity.role}`);

        if (c.since != null) {
          conn.channels.set(channel, { type: kind, config: c, watermark: Number(c.since) });
          conn.send({ type: 'subscribed', ref: msg.ref, channel, watermark: Number(c.since), resumed: true });
          await replay(conn, channel, conn.channels.get(channel), Number(c.since));
          return;
        }

        // Snapshot + watermark in ONE transaction. See header note (2).
        //
        // REPEATABLE READ is load-bearing: under the default READ COMMITTED, the
        // two statements below take separate snapshots, and a row committing
        // between them would land in the snapshot AND carry an id above the
        // watermark — delivered twice.
        //
        // realtime.watermark() is SECURITY DEFINER; the subscriber cannot read
        // realtime.changelog directly (it holds every table's changes) but can
        // read its high-water mark from inside its own transaction.
        let snapshot = null, watermark = 0;
        if (c.snapshot) {
          const result = await asRole(conn.identity.role, conn.identity.claims, async (tx) => {
            const wm = await tx.query(`select realtime.watermark() as wm`);
            const rows = await tx.query(`select * from ${q(c.schema)}.${q(c.table)} limit 1000`);
            return { wm: Number(wm.rows[0].wm), rows: rows.rows };
          }, { isolation: 'repeatable read' });
          snapshot = result.rows;
          watermark = result.wm;
        } else {
          watermark = lastId;
        }

        conn.channels.set(channel, { type: kind, config: c, watermark });
        return conn.send({ type: 'subscribed', ref: msg.ref, channel, watermark, snapshot });
      }

      if (kind === 'presence') {
        conn.channels.set(channel, { type: 'presence', config: config.presence, state: config.presence.state ?? {} });
        conn.send({ type: 'subscribed', ref: msg.ref, channel });
        return syncPresence(channel, conn.identity.projectId);
      }

      conn.channels.set(channel, { type: 'broadcast', config: { self: false, ...config.broadcast } });
      return conn.send({ type: 'subscribed', ref: msg.ref, channel });
    }

    case 'unsubscribe': {
      const chan = conn.channels.get(msg.channel);
      conn.channels.delete(msg.channel);
      if (chan?.type === 'presence') syncPresence(msg.channel, conn.identity.projectId);
      return conn.send({ type: 'unsubscribed', ref: msg.ref, channel: msg.channel });
    }

    case 'broadcast': {
      if (!conn.channels.has(msg.channel)) throw new Error('not subscribed to channel');
      return relayBroadcast(conn, msg.channel, msg.event, msg.payload);
    }

    case 'presence': {
      const chan = conn.channels.get(msg.channel);
      if (!chan || chan.type !== 'presence') throw new Error('not a presence channel');
      chan.state = msg.state;
      return syncPresence(msg.channel, conn.identity.projectId);
    }

    default:
      throw new Error(`unknown message type "${msg.type}"`);
  }
}

/** Start the changelog reader. NOTIFY wakes it; the poll covers dropped notifies. */
export async function startChangeReader() {
  const { rows } = await asSuperuser((tx) => tx.query(`select coalesce(max(id), 0)::bigint as id from realtime.changelog`));
  lastId = Number(rows[0].id);

  await db.listen('basalt_changes', () => { drain(); });

  const poll = setInterval(drain, POLL_MS);
  poll.unref?.();

  // The changelog is a buffer, not an archive. Trim it, or it grows forever.
  const gc = setInterval(async () => {
    try {
      await asSuperuser((tx) =>
        tx.query(`delete from realtime.changelog where committed_at < now() - interval '${RETENTION_MS} milliseconds'`),
      );
    } catch { /* non-fatal */ }
  }, 60_000);
  gc.unref?.();
}

export function connectionCount() { return conns.size; }
