// SDK tests.
//
// Each of these covers a bug that actually shipped into this file and was only
// caught by driving the SDK against a live server. Unit-testing the server alone
// would have missed all of them.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { start } from '../server/index.mjs';
import { createClient, memoryStorage } from '../sdk/basalt.mjs';

let server, BASE, serviceKey, publishableKey;

const client = () => createClient(BASE, 'anon', { WebSocketImpl: WebSocket, storage: memoryStorage() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  const res = await start({ port: 0, persist: false });
  server = res.server;
  serviceKey = res.serviceKey;
  publishableKey = res.publishableKey;
  BASE = `http://localhost:${server.address().port}`;

  await fetch(`${BASE}/meta/v1/query`, {
    method: 'POST',
    headers: { apikey: serviceKey, 'content-type': 'application/json' },
    body: JSON.stringify({ sql: `
      create table todos (id serial primary key, owner uuid not null, task text, done boolean default false);
      alter table todos enable row level security;
      grant select, insert, update, delete on todos to authenticated;
      grant usage on sequence todos_id_seq to authenticated;
      create policy own on todos for all to authenticated
        using (owner = auth.uid()) with check (owner = auth.uid());
      select realtime.enable('public.todos');` }),
  });
});

after(() => server?.close());

describe('sdk', () => {
  test('runs outside a browser, where localStorage is absent or unusable', () => {
    // Node exposes a `localStorage` global that is not working Web Storage, so a
    // truthiness check on it passes and then getItem() throws.
    const c = client();
    assert.equal(c.auth.getSession(), null);
  });

  test('a GET query does not attach a request body', async () => {
    // fetch() rejects any GET carrying a body — including an explicit `null`.
    const c = client();
    await c.auth.signUp({ email: 'get@sdk.dev', password: 'password123' });
    const { data, error } = await c.from('todos').select('id');
    assert.equal(error, null, `GET must not send a body: ${error?.message}`);
    assert.deepEqual(data, []);
  });

  test('two clients in one process keep separate sessions', async () => {
    const a = client(); const b = client();
    await a.auth.signUp({ email: 'iso-a@sdk.dev', password: 'password123' });
    await b.auth.signUp({ email: 'iso-b@sdk.dev', password: 'password123' });
    assert.notEqual(a.auth.getUser().id, b.auth.getUser().id);
    assert.notEqual(a.auth.accessToken, b.auth.accessToken);
  });

  test('the query builder enforces RLS end to end', async () => {
    const alice = client(); const bob = client();
    await alice.auth.signUp({ email: 'rls-a@sdk.dev', password: 'password123' });
    await bob.auth.signUp({ email: 'rls-b@sdk.dev', password: 'password123' });

    const ins = await alice.from('todos').insert({ owner: alice.auth.getUser().id, task: 'mine' }).select();
    assert.equal(ins.error, null);

    const forged = await bob.from('todos').insert({ owner: alice.auth.getUser().id, task: 'forged' }).select();
    assert.equal(forged.error.status, 403);

    assert.equal((await alice.from('todos').select('id')).data.length, 1);
    assert.equal((await bob.from('todos').select('id')).data.length, 0);
  });

  test('concurrent refreshes are single-flighted and do not revoke each other', async () => {
    // Without one shared in-flight promise, five parallel rotations each spend a
    // token from the same family, the server sees reuse, and the session dies.
    const c = client();
    await c.auth.signUp({ email: 'storm@sdk.dev', password: 'password123' });
    const before = c.auth.getSession().refresh_token;

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => c.auth.refreshSession()));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5, 'every waiter resolves');
    assert.notEqual(c.auth.getSession()?.refresh_token, before, 'exactly one rotation happened');

    const { error } = await c.from('todos').select('id');
    assert.equal(error, null, 'the session must survive a refresh storm');
  });

  test('the config object form of createClient connects (Firebase style)', async () => {
    const c = createClient({ url: BASE, key: publishableKey }, undefined, {}); // key from config obj
    // opts (WebSocketImpl/storage) can also live in the config object
    const c2 = createClient({ url: BASE, key: publishableKey, storage: memoryStorage() });
    await c2.auth.signUp({ email: 'cfg@sdk.dev', password: 'password123' });
    const { error } = await c2.from('todos').select('id');
    assert.equal(error, null);
    assert.equal(c.key, publishableKey);
  });

  test('a valid publishable key is accepted; a wrong pk_ is rejected', async () => {
    const ok = await fetch(`${BASE}/rest/v1/todos`, { headers: { apikey: publishableKey } });
    assert.notEqual(ok.status, 401, 'the real publishable key must be accepted');

    const bad = await fetch(`${BASE}/rest/v1/todos`, { headers: { apikey: 'pk_not_a_real_key' } });
    assert.equal(bad.status, 401, 'a wrong pk_ key must fail loudly');
    assert.equal((await bad.json()).code, 'invalid_api_key');
  });

  test('/config exposes the publishable key but never the service key', async () => {
    const cfg = await (await fetch(`${BASE}/config`)).json();
    assert.equal(cfg.publishable_key, publishableKey);
    assert.ok(cfg.publishable_key.startsWith('pk_'));
    assert.ok(!JSON.stringify(cfg).includes('sk_'), 'the service key must not leak through /config');
  });

  test('realtime delivers only authorized rows to each subscriber', async () => {
    const alice = client(); const bob = client();
    await alice.auth.signUp({ email: 'rt-a@sdk.dev', password: 'password123' });
    await bob.auth.signUp({ email: 'rt-b@sdk.dev', password: 'password123' });

    const aliceSaw = []; const bobSaw = [];
    alice.channel('todos').on('postgres_changes', { table: 'todos', event: '*' }, (e) => aliceSaw.push(e.eventType)).subscribe();
    bob.channel('todos').on('postgres_changes', { table: 'todos', event: '*' }, (e) => bobSaw.push(e.eventType)).subscribe();
    await sleep(400);

    const { data } = await alice.from('todos').insert({ owner: alice.auth.getUser().id, task: 'secret' }).select();
    await sleep(250);
    await alice.from('todos').update({ done: true }).eq('id', data[0].id);
    await sleep(250);
    await alice.from('todos').delete().eq('id', data[0].id);
    await sleep(500);

    assert.deepEqual(aliceSaw, ['INSERT', 'UPDATE', 'DELETE']);
    assert.deepEqual(bobSaw, [], 'bob must not receive alice rows, including the DELETE');

    alice.realtime.disconnect();
    bob.realtime.disconnect();
  });
});
