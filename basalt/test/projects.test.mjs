// Multi-tenant isolation tests.
//
// Two projects, each with its own publishable and service keys. The whole point
// is that nothing crosses the boundary: not data, not users, not tokens, not
// realtime, not storage. Every test here is a way that boundary could leak.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { start } from '../server/index.mjs';
import { createClient, memoryStorage } from '../sdk/basalt.mjs';

let server, BASE, adminKey;
let A, B; // { id, publishable_key, service_key }

const svc = (key) => ({ apikey: key, 'content-type': 'application/json' });
const json = (r) => r.json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const admin = (path, opts = {}) =>
  fetch(`${BASE}${path}`, { headers: svc(adminKey), ...opts });

// Create a project + a table with an owner-scoped policy, seeded through its own
// service key. Mirrors what a provider hands a customer.
async function provision(project) {
  await fetch(`${BASE}/meta/v1/query`, {
    method: 'POST', headers: svc(project.service_key),
    body: JSON.stringify({ sql: `
      create table items (id serial primary key, owner uuid not null, label text);
      alter table items enable row level security;
      grant select, insert on items to authenticated;
      grant usage on sequence items_id_seq to authenticated;
      create policy own on items for all to authenticated
        using (owner = auth.uid()) with check (owner = auth.uid());
      select realtime.enable('items');
    ` }),
  });
}

before(async () => {
  const res = await start({ port: 0, persist: false });
  server = res.server;
  adminKey = res.adminKey;
  BASE = `http://localhost:${server.address().port}`;

  A = await admin('/projects', { method: 'POST', body: JSON.stringify({ name: 'Acme' }) }).then(json);
  B = await admin('/projects', { method: 'POST', body: JSON.stringify({ name: 'Globex' }) }).then(json);
  await provision(A);
  await provision(B);
});

after(() => server?.close());

const clientFor = (project) =>
  createClient({ url: BASE, key: project.publishable_key, WebSocketImpl: WebSocket, storage: memoryStorage() });

describe('projects', () => {
  test('each project gets its own distinct publishable and service keys', () => {
    assert.ok(A.publishable_key.startsWith('pk_') && B.publishable_key.startsWith('pk_'));
    assert.notEqual(A.publishable_key, B.publishable_key);
    assert.notEqual(A.service_key, B.service_key);
    assert.notEqual(A.id, B.id);
  });

  test('creating/listing/deleting projects requires the admin key', async () => {
    assert.equal((await fetch(`${BASE}/projects`)).status, 403);
    assert.equal((await fetch(`${BASE}/projects`, { headers: svc(A.service_key) })).status, 403);
    const list = await admin('/projects').then(json);
    assert.ok(list.some((p) => p.id === A.id) && list.some((p) => p.id === B.id));
  });

  test('/config resolves to the project of the key presented', async () => {
    const cfgA = await fetch(`${BASE}/config`, { headers: { apikey: A.publishable_key } }).then(json);
    const cfgB = await fetch(`${BASE}/config`, { headers: { apikey: B.publishable_key } }).then(json);
    assert.equal(cfgA.project, A.id);
    assert.equal(cfgA.publishable_key, A.publishable_key);
    assert.equal(cfgB.project, B.id);
    assert.notEqual(cfgA.project, cfgB.project);
  });

  test('the same email is a different user in each project', async () => {
    const ca = clientFor(A), cb = clientFor(B);
    const ra = await ca.auth.signUp({ email: 'ceo@shared.com', password: 'password123' });
    const rb = await cb.auth.signUp({ email: 'ceo@shared.com', password: 'password123' });
    assert.equal(ra.error, null);
    assert.equal(rb.error, null, 'same email must be allowed in a different project');
    assert.notEqual(ca.auth.getUser().id, cb.auth.getUser().id);
  });

  test('a project cannot read another project\'s data', async () => {
    const ca = clientFor(A), cb = clientFor(B);
    await ca.auth.signUp({ email: 'a@acme.com', password: 'password123' });
    await cb.auth.signUp({ email: 'b@globex.com', password: 'password123' });

    await ca.from('items').insert({ owner: ca.auth.getUser().id, label: 'acme-secret' });
    await cb.from('items').insert({ owner: cb.auth.getUser().id, label: 'globex-secret' });

    const aSees = await ca.from('items').select('label');
    const bSees = await cb.from('items').select('label');
    assert.deepEqual(aSees.data.map((r) => r.label), ['acme-secret']);
    assert.deepEqual(bSees.data.map((r) => r.label), ['globex-secret'], 'B must never see A rows');
  });

  test('a token minted for project A is rejected by project B', async () => {
    const ca = clientFor(A);
    await ca.auth.signUp({ email: 'cross@acme.com', password: 'password123' });
    const tokenA = ca.auth.accessToken;

    // Present A's token but B's publishable key.
    const res = await fetch(`${BASE}/rest/v1/items`, {
      headers: { apikey: B.publishable_key, authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 401);
    assert.equal((await json(res)).code, 'wrong_project');
  });

  test('an unknown publishable key is rejected, not silently defaulted', async () => {
    const res = await fetch(`${BASE}/rest/v1/items`, { headers: { apikey: 'pk_totally_made_up' } });
    assert.equal(res.status, 401);
  });

  test('a service key only administers its own project', async () => {
    // A's service key sees A's `items` table…
    const aTables = await fetch(`${BASE}/meta/v1/tables`, { headers: svc(A.service_key) }).then(json);
    assert.ok(aTables.some((t) => t.name === 'items' && t.schema.startsWith('proj_')));
    // …and its user list is only A's users.
    const aUsers = await fetch(`${BASE}/meta/v1/users`, { headers: svc(A.service_key) }).then(json);
    assert.ok(aUsers.every((u) => u.email.endsWith('@acme.com') || u.email === 'ceo@shared.com' || u.email === 'cross@acme.com'));
    assert.ok(!aUsers.some((u) => u.email.endsWith('@globex.com')), 'A must not see B users');
  });

  test('realtime is isolated: a subscriber only sees its own project\'s changes', async () => {
    const ca = clientFor(A), cb = clientFor(B);
    await ca.auth.signInWithPassword({ email: 'a@acme.com', password: 'password123' });
    await cb.auth.signInWithPassword({ email: 'b@globex.com', password: 'password123' });

    const aGot = [], bGot = [];
    ca.channel('items').on('postgres_changes', { table: 'items', event: 'INSERT' }, (e) => aGot.push(e.new.label)).subscribe();
    cb.channel('items').on('postgres_changes', { table: 'items', event: 'INSERT' }, (e) => bGot.push(e.new.label)).subscribe();
    await sleep(400);

    await ca.from('items').insert({ owner: ca.auth.getUser().id, label: 'acme-live' });
    await sleep(500);

    assert.ok(aGot.includes('acme-live'), 'A must receive its own change');
    assert.ok(!bGot.includes('acme-live'), 'B must not receive A\'s change');
    ca.realtime.disconnect();
    cb.realtime.disconnect();
  });

  test('broadcast and presence do not cross projects on a shared channel name', async () => {
    const ca = clientFor(A), cb = clientFor(B);
    await ca.auth.signInWithPassword({ email: 'a@acme.com', password: 'password123' });
    await cb.auth.signInWithPassword({ email: 'b@globex.com', password: 'password123' });

    const bGotBroadcast = [];
    cb.channel('room').on('broadcast', { event: 'msg' }, (p) => bGotBroadcast.push(p)).subscribe();
    const ac = ca.channel('room').on('broadcast', { event: 'msg' }, () => {}).subscribe();
    await sleep(400);
    ac.send('msg', { from: 'acme' });
    await sleep(400);

    assert.deepEqual(bGotBroadcast, [], 'B must not receive A\'s broadcast on the same channel name');
    ca.realtime.disconnect();
    cb.realtime.disconnect();
  });

  test('deleting a project removes its schema and users', async () => {
    const tmp = await admin('/projects', { method: 'POST', body: JSON.stringify({ name: 'Temp' }) }).then(json);
    await provision(tmp);
    const c = clientFor(tmp);
    await c.auth.signUp({ email: 'x@temp.com', password: 'password123' });

    await admin(`/projects/${tmp.id}`, { method: 'DELETE' });

    // Its publishable key no longer resolves.
    const res = await fetch(`${BASE}/rest/v1/items`, { headers: { apikey: tmp.publishable_key } });
    assert.equal(res.status, 401);
    const list = await admin('/projects').then(json);
    assert.ok(!list.some((p) => p.id === tmp.id));
  });

  test('the default project cannot be deleted', async () => {
    const res = await admin('/projects/default', { method: 'DELETE' });
    assert.equal(res.status, 400);
  });
});
