// Basalt end-to-end tests.
//
// These exist to prove the security properties, not to exercise happy paths.
// Every test that says "must not" is guarding a way this system could leak data.
//
//   node --test test/

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { start } from '../server/index.mjs';
import * as jwt from '../server/jwt.mjs';

let PORT, BASE, SERVICE_KEY, server;
let alice, bob;

const json = (r) => r.json();
const svcHeaders = () => ({ apikey: SERVICE_KEY, 'content-type': 'application/json' });
const H = (s, extra = {}) => ({
  authorization: `Bearer ${s.access_token}`,
  'content-type': 'application/json',
  prefer: 'return=representation',
  ...extra,
});

const sql = (text) =>
  fetch(`${BASE}/meta/v1/query`, { method: 'POST', headers: svcHeaders(), body: JSON.stringify({ sql: text }) });

const signUp = (email) =>
  fetch(`${BASE}/auth/v1/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  }).then(json);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  const res = await start({ port: 0, persist: false });
  server = res.server;
  PORT = server.address().port;
  BASE = `http://localhost:${PORT}`;
  SERVICE_KEY = res.serviceKey;

  await sql(`
    create table notes (
      id serial primary key,
      owner uuid not null,
      title text not null,
      secret text
    );
    alter table notes enable row level security;
    grant select, insert, update, delete on notes to authenticated;
    grant usage on sequence notes_id_seq to authenticated;
    create policy own on notes for all to authenticated
      using (owner = auth.uid()) with check (owner = auth.uid());
    select realtime.enable('public.notes');

    create table tags (id serial primary key, note_id int references notes(id) on delete cascade, label text);
    alter table tags enable row level security;
    grant select, insert on tags to authenticated;
    grant usage on sequence tags_id_seq to authenticated;
    create policy own_tags on tags for all to authenticated
      using (exists (select 1 from notes n where n.id = note_id and n.owner = auth.uid()))
      with check (exists (select 1 from notes n where n.id = note_id and n.owner = auth.uid()));
  `);

  alice = await signUp('alice@example.com');
  bob = await signUp('bob@example.com');
});

after(() => server?.close());

// -----------------------------------------------------------------------------
describe('row level security', () => {
  test('a user reads only their own rows', async () => {
    await fetch(`${BASE}/rest/v1/notes`, {
      method: 'POST', headers: H(alice),
      body: JSON.stringify({ owner: alice.user.id, title: 'alice-1', secret: 'classified' }),
    });

    const asAlice = await fetch(`${BASE}/rest/v1/notes`, { headers: H(alice) }).then(json);
    assert.equal(asAlice.length, 1);
    assert.equal(asAlice[0].title, 'alice-1');

    const asBob = await fetch(`${BASE}/rest/v1/notes`, { headers: H(bob) }).then(json);
    assert.deepEqual(asBob, [], 'bob must not see alice rows');
  });

  test('WITH CHECK blocks writing a row you would not be allowed to read', async () => {
    const res = await fetch(`${BASE}/rest/v1/notes`, {
      method: 'POST', headers: H(bob),
      body: JSON.stringify({ owner: alice.user.id, title: 'forged' }),
    });
    assert.equal(res.status, 403);
    const body = await json(res);
    assert.match(body.error, /row-level security/i);
  });

  test('a filter naming another user does not widen visibility', async () => {
    // The classic mistake: assuming a WHERE clause is the security boundary.
    const rows = await fetch(`${BASE}/rest/v1/notes?owner=eq.${alice.user.id}`, { headers: H(bob) }).then(json);
    assert.deepEqual(rows, []);
  });

  test('UPDATE cannot reassign ownership away from the caller', async () => {
    const [note] = await fetch(`${BASE}/rest/v1/notes`, {
      method: 'POST', headers: H(bob),
      body: JSON.stringify({ owner: bob.user.id, title: 'bob-note' }),
    }).then(json);

    const res = await fetch(`${BASE}/rest/v1/notes?id=eq.${note.id}`, {
      method: 'PATCH', headers: H(bob), body: JSON.stringify({ owner: alice.user.id }),
    });
    assert.equal(res.status, 403, 'WITH CHECK must reject the new row');
  });

  test('embedded resources are filtered by their own policies', async () => {
    const [aliceNote] = await fetch(`${BASE}/rest/v1/notes?title=eq.alice-1`, { headers: H(alice) }).then(json);
    await fetch(`${BASE}/rest/v1/tags`, {
      method: 'POST', headers: H(alice),
      body: JSON.stringify({ note_id: aliceNote.id, label: 'private-tag' }),
    });

    const aliceView = await fetch(`${BASE}/rest/v1/notes?select=title,tags(label)`, { headers: H(alice) }).then(json);
    assert.equal(aliceView[0].tags[0].label, 'private-tag');

    const bobView = await fetch(`${BASE}/rest/v1/notes?select=title,tags(label)`, { headers: H(bob) }).then(json);
    assert.ok(bobView.every((n) => n.title !== 'alice-1'), 'bob must not reach alice notes or their tags');
  });

  test('unfiltered DELETE is refused without explicit intent', async () => {
    const res = await fetch(`${BASE}/rest/v1/notes`, { method: 'DELETE', headers: H(bob) });
    assert.equal(res.status, 400);
    assert.match((await json(res)).error, /unfiltered delete refused/);
  });
});

// -----------------------------------------------------------------------------
describe('sql injection', () => {
  test('an identifier that is not in the catalog is rejected, not executed', async () => {
    const res = await fetch(`${BASE}/rest/v1/notes?select=${encodeURIComponent('id;drop table notes--')}`, { headers: H(alice) });
    assert.equal(res.status, 400);

    const still = await fetch(`${BASE}/rest/v1/notes`, { headers: H(alice) });
    assert.equal(still.status, 200, 'notes table must still exist');
  });

  test('a hostile filter value is bound, not interpolated', async () => {
    const evil = encodeURIComponent(`'; drop table notes; --`);
    const res = await fetch(`${BASE}/rest/v1/notes?title=eq.${evil}`, { headers: H(alice) });
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), []);

    const still = await fetch(`${BASE}/rest/v1/notes`, { headers: H(alice) });
    assert.equal(still.status, 200, 'notes table must still exist');
  });

  test('an unknown operator is rejected', async () => {
    const res = await fetch(`${BASE}/rest/v1/notes?title=exec.whatever`, { headers: H(alice) });
    assert.equal(res.status, 400);
    assert.match((await json(res)).error, /unknown operator/);
  });

  test('an unknown order column is rejected', async () => {
    const res = await fetch(`${BASE}/rest/v1/notes?order=${encodeURIComponent('id; drop table notes')}`, { headers: H(alice) });
    assert.equal(res.status, 400);
  });
});

// -----------------------------------------------------------------------------
describe('jwt', () => {
  test('alg=none is rejected', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: alice.user.id, role: 'authenticated', exp: 9e9 })}.`;
    const res = await fetch(`${BASE}/rest/v1/notes`, { headers: { authorization: `Bearer ${forged}` } });
    assert.equal(res.status, 401);
  });

  test('a tampered payload fails signature verification', async () => {
    const [h, , s] = alice.access_token.split('.');
    const evil = Buffer.from(JSON.stringify({ sub: bob.user.id, role: 'authenticated', exp: 9e9 })).toString('base64url');
    const res = await fetch(`${BASE}/rest/v1/notes`, { headers: { authorization: `Bearer ${h}.${evil}.${s}` } });
    assert.equal(res.status, 401);
  });

  test('a validly-signed token cannot escalate itself to service_role', async () => {
    // Signed with the *real* private key — the only defence is the clamp in
    // identityFromRequest. If this test fails, any user is a superuser.
    const escalated = jwt.sign({ sub: alice.user.id, email: 'alice@example.com', role: 'service_role' }, 600);
    const res = await fetch(`${BASE}/meta/v1/tables`, { headers: { authorization: `Bearer ${escalated}` } });
    assert.equal(res.status, 403, 'a JWT must never yield service_role');

    // And it must be treated as anon, not authenticated, for data access too.
    const rows = await fetch(`${BASE}/rest/v1/notes`, { headers: { authorization: `Bearer ${escalated}` } });
    assert.notEqual(rows.status, 200);
  });

  test('an expired token is rejected', async () => {
    const expired = jwt.sign({ sub: alice.user.id, role: 'authenticated' }, -10);
    const res = await fetch(`${BASE}/rest/v1/notes`, { headers: { authorization: `Bearer ${expired}` } });
    assert.equal(res.status, 401);
  });
});

// -----------------------------------------------------------------------------
describe('refresh token rotation', () => {
  const refresh = (token) =>
    fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: token }),
    });

  test('rotating returns a new token and invalidates the old one', async () => {
    const user = await signUp('rotate@example.com');
    const first = await refresh(user.refresh_token).then(json);
    assert.ok(first.refresh_token);
    assert.notEqual(first.refresh_token, user.refresh_token);

    const second = await refresh(first.refresh_token).then(json);
    assert.ok(second.access_token);
  });

  test('reusing a spent token revokes the entire family', async () => {
    const user = await signUp('reuse@example.com');
    const rotated = await refresh(user.refresh_token).then(json); // original now spent

    // A thief replays the original.
    const replay = await refresh(user.refresh_token);
    assert.equal(replay.status, 401);
    assert.equal((await json(replay)).code, 'refresh_token_reused');

    // The legitimate client's freshly-rotated token is now dead too. This is
    // the point: we cannot tell thief from victim, so we end the session.
    const victim = await refresh(rotated.refresh_token);
    assert.equal(victim.status, 401, 'the whole family must be revoked');
  });

  test('global sign-out revokes every session for the user', async () => {
    const user = await signUp('global@example.com');
    const other = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'global@example.com', password: 'password123' }),
    }).then(json);

    await fetch(`${BASE}/auth/v1/logout`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: user.refresh_token, scope: 'global' }),
    });

    assert.equal((await refresh(user.refresh_token)).status, 401);
    assert.equal((await refresh(other.refresh_token)).status, 401, 'the other session must die too');
  });

  test('sign-in does not leak which emails exist', async () => {
    const bad = (email) =>
      fetch(`${BASE}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      });
    const known = await bad('alice@example.com');
    const unknown = await bad('nobody@example.com');
    assert.equal(known.status, unknown.status);
    assert.deepEqual(await json(known), await json(unknown));
  });
});

// -----------------------------------------------------------------------------
describe('realtime', () => {
  function connect(session) {
    const ws = new WebSocket(`ws://localhost:${PORT}/realtime/v1?token=${session.access_token}`);
    const events = [];
    let onSubscribed, onFailed;
    // Reject on `error`, never just wait for `subscribed`. A subscribe that
    // fails server-side would otherwise leave this promise pending and the test
    // would hang rather than fail — which is how a real bug hid here once.
    const subscribed = new Promise((res, rej) => { onSubscribed = res; onFailed = rej; });
    subscribed.catch(() => {}); // avoid unhandled rejection when a test expects the error

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'change') events.push(msg.payload);
      if (msg.type === 'subscribed') onSubscribed(msg);
      if (msg.type === 'error') onFailed(new Error(msg.message));
    });
    const open = new Promise((r) => ws.on('open', r));
    return { ws, events, open, subscribed,
      subscribe: (config) => ws.send(JSON.stringify({ type: 'subscribe', channel: 'notes', config })) };
  }

  test('subscribers receive only rows their policies permit — including DELETE', async () => {
    const a = connect(alice); const b = connect(bob);
    await Promise.all([a.open, b.open]);
    const cfg = { postgres_changes: { schema: 'public', table: 'notes', event: '*' } };
    a.subscribe(cfg); b.subscribe(cfg);
    await Promise.all([a.subscribed, b.subscribed]);

    const [note] = await fetch(`${BASE}/rest/v1/notes`, {
      method: 'POST', headers: H(alice),
      body: JSON.stringify({ owner: alice.user.id, title: 'rt-note', secret: 'do-not-leak' }),
    }).then(json);
    await sleep(250);

    await fetch(`${BASE}/rest/v1/notes?id=eq.${note.id}`, {
      method: 'PATCH', headers: H(alice), body: JSON.stringify({ title: 'rt-note-v2' }),
    });
    await sleep(250);

    // The DELETE is the interesting one: the row is gone, so it cannot be
    // re-selected to authorize. It is checked against the policy expression.
    await fetch(`${BASE}/rest/v1/notes?id=eq.${note.id}`, { method: 'DELETE', headers: H(alice) });
    await sleep(400);

    assert.deepEqual(a.events.map((e) => e.eventType), ['INSERT', 'UPDATE', 'DELETE']);
    assert.equal(a.events[2].old.secret, 'do-not-leak');
    assert.deepEqual(b.events, [], 'bob must receive nothing, especially not the DELETE payload');

    a.ws.close(); b.ws.close();
  });

  test('snapshot and stream share a watermark: no gap, no duplicate', async () => {
    const carol = await signUp('carol@example.com');
    const mk = (t) => fetch(`${BASE}/rest/v1/notes`, {
      method: 'POST', headers: H(carol), body: JSON.stringify({ owner: carol.user.id, title: t }),
    }).then(json);

    await mk('pre-1'); await mk('pre-2');
    await sleep(150);

    const c = connect(carol);
    await c.open;
    c.subscribe({ postgres_changes: { schema: 'public', table: 'notes', event: '*', snapshot: true } });
    const sub = await c.subscribed;

    const snapshotTitles = sub.snapshot.map((r) => r.title);
    assert.deepEqual(snapshotTitles.sort(), ['pre-1', 'pre-2'], 'snapshot holds pre-existing rows only');

    await mk('post-1');
    await sleep(400);

    const streamed = c.events.map((e) => e.new.title);
    assert.deepEqual(streamed, ['post-1'], 'the stream carries exactly what the snapshot missed');
    assert.equal(streamed.filter((t) => snapshotTitles.includes(t)).length, 0, 'no row appears twice');

    c.ws.close();
  });

  test('subscribing to a table with no read policy is refused, not silently empty', async () => {
    await sql(`create table locked (id serial primary key, v text);
               alter table locked enable row level security;
               grant select on locked to authenticated;
               select realtime.enable('public.locked');`);

    const c = connect(bob);
    await c.open;
    c.subscribe({ postgres_changes: { schema: 'public', table: 'locked', event: '*' } });
    await assert.rejects(() => c.subscribed, /no read policy/);
    c.ws.close();
  });

  test('resuming with `since` replays only missed, authorized changes', async () => {
    const dave = await signUp('dave@example.com');
    const mk = (t) => fetch(`${BASE}/rest/v1/notes`, {
      method: 'POST', headers: H(dave), body: JSON.stringify({ owner: dave.user.id, title: t }),
    }).then(json);

    const c1 = connect(dave);
    await c1.open;
    c1.subscribe({ postgres_changes: { schema: 'public', table: 'notes', event: '*' } });
    await c1.subscribed;
    await mk('resume-1');
    await sleep(300);
    const watermark = c1.events.at(-1).commit_id;
    c1.ws.close();

    // Offline. Two writes land, plus one from another user we must not receive.
    await mk('resume-2');
    await fetch(`${BASE}/rest/v1/notes`, {
      method: 'POST', headers: H(alice), body: JSON.stringify({ owner: alice.user.id, title: 'alice-during-gap' }),
    });
    await sleep(200);

    const c2 = connect(dave);
    await c2.open;
    c2.subscribe({ postgres_changes: { schema: 'public', table: 'notes', event: '*', since: watermark } });
    await c2.subscribed;
    await sleep(400);

    const titles = c2.events.map((e) => e.new.title);
    assert.ok(titles.includes('resume-2'), 'missed change must be replayed');
    assert.ok(!titles.includes('alice-during-gap'), 'replay must still enforce RLS');
    assert.ok(!titles.includes('resume-1'), 'already-seen change must not repeat');
    c2.ws.close();
  });

  test('broadcast reaches other subscribers without touching the database', async () => {
    const a = connect(alice); const b = connect(bob);
    await Promise.all([a.open, b.open]);
    const got = new Promise((r) => b.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'broadcast') r(m);
    }));
    a.ws.send(JSON.stringify({ type: 'subscribe', channel: 'room', config: { broadcast: {} } }));
    b.ws.send(JSON.stringify({ type: 'subscribe', channel: 'room', config: { broadcast: {} } }));
    await sleep(150);
    a.ws.send(JSON.stringify({ type: 'broadcast', channel: 'room', event: 'cursor', payload: { x: 10 } }));

    const msg = await got;
    assert.equal(msg.event, 'cursor');
    assert.deepEqual(msg.payload, { x: 10 });
    a.ws.close(); b.ws.close();
  });
});

// -----------------------------------------------------------------------------
describe('meta', () => {
  test('the meta API is unreachable without the service key', async () => {
    assert.equal((await fetch(`${BASE}/meta/v1/tables`)).status, 403);
    assert.equal((await fetch(`${BASE}/meta/v1/tables`, { headers: H(alice) })).status, 403);
    assert.equal((await fetch(`${BASE}/meta/v1/tables`, { headers: { apikey: SERVICE_KEY } })).status, 200);
  });

  test('the simulator reports RLS filtering as an allowed empty result', async () => {
    const res = await fetch(`${BASE}/meta/v1/simulate`, {
      method: 'POST', headers: svcHeaders(),
      body: JSON.stringify({ sql: 'select * from notes', role: 'authenticated', claims: { sub: bob.user.id, role: 'authenticated' } }),
    }).then(json);
    assert.equal(res.allowed, true);
    assert.ok(res.rows.every((r) => r.owner === bob.user.id), 'simulator must apply the same policies');
  });

  test('the simulator rolls back writes', async () => {
    const before = await fetch(`${BASE}/rest/v1/notes?owner=eq.${alice.user.id}`, { headers: H(alice) }).then(json);
    await fetch(`${BASE}/meta/v1/simulate`, {
      method: 'POST', headers: svcHeaders(),
      body: JSON.stringify({
        sql: `insert into notes (owner, title) values ('${alice.user.id}', 'simulated') returning *`,
        role: 'authenticated', claims: { sub: alice.user.id, role: 'authenticated' },
      }),
    });
    const after = await fetch(`${BASE}/rest/v1/notes?owner=eq.${alice.user.id}`, { headers: H(alice) }).then(json);
    assert.equal(after.length, before.length, 'a simulated insert must not persist');
  });
});

// -----------------------------------------------------------------------------
describe('storage', () => {
  test('objects are governed by policies on their metadata row', async () => {
    await fetch(`${BASE}/storage/v1/bucket`, {
      method: 'POST', headers: svcHeaders(), body: JSON.stringify({ id: 'private', public: false }),
    });

    const up = await fetch(`${BASE}/storage/v1/object/private/alice.txt`, {
      method: 'POST',
      headers: { authorization: `Bearer ${alice.access_token}`, 'content-type': 'text/plain' },
      body: 'alice private data',
    });
    assert.equal(up.status, 200);

    const own = await fetch(`${BASE}/storage/v1/object/private/alice.txt`, {
      headers: { authorization: `Bearer ${alice.access_token}` },
    });
    assert.equal(own.status, 200);
    assert.equal(await own.text(), 'alice private data');

    // 404 rather than 403: we must not confirm the object exists.
    const stolen = await fetch(`${BASE}/storage/v1/object/private/alice.txt`, {
      headers: { authorization: `Bearer ${bob.access_token}` },
    });
    assert.equal(stolen.status, 404);
  });

  test('a signed url grants access, and a tampered one does not', async () => {
    const { signedUrl } = await fetch(`${BASE}/storage/v1/object/signed-url`, {
      method: 'POST', headers: H(alice),
      body: JSON.stringify({ bucket: 'private', name: 'alice.txt', expiresIn: 60 }),
    }).then(json);

    const ok = await fetch(BASE + signedUrl);
    assert.equal(ok.status, 200);

    const tampered = signedUrl.replace(/sig=./, 'sig=X');
    assert.equal((await fetch(BASE + tampered)).status, 401);

    const expired = signedUrl.replace(/exp=\d+/, 'exp=1');
    assert.equal((await fetch(BASE + expired)).status, 401);
  });
});
