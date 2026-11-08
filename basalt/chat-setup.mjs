// One-time setup for the Basalt Chat example.
//
// This is the "write your rules in the console" step. The PROVIDER runs it once,
// with the service key. After that, the chat app (chat.html) runs with nothing
// but the public publishable key — no backend code, no privileged access.
//
//   node chat-setup.mjs
//
// It creates two tables (rooms, messages), the RLS policies that govern them,
// turns on the realtime stream, and seeds a few rooms.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASALT_URL || 'http://localhost:5252';

async function serviceKey() {
  if (process.env.BASALT_SERVICE_KEY) return process.env.BASALT_SERVICE_KEY;
  const path = join(ROOT, '.data', 'service-key');
  if (existsSync(path)) return (await readFile(path, 'utf8')).trim();
  throw new Error('No service key found. Start the server once, or set BASALT_SERVICE_KEY.');
}

const RULES = `
-- Rooms: any signed-in user can see them and create new ones.
create table if not exists rooms (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);
alter table rooms enable row level security;
grant select, insert on rooms to authenticated;
drop policy if exists "rooms are readable" on rooms;
create policy "rooms are readable" on rooms
  for select to authenticated using (true);
drop policy if exists "anyone can create a room" on rooms;
create policy "anyone can create a room" on rooms
  for insert to authenticated with check (true);

-- Messages: everyone signed in reads them; you may only post AS YOURSELF.
-- The WITH CHECK pins both the author id and the displayed email to the caller's
-- own token, so a client cannot forge who a message came from.
create table if not exists messages (
  id           bigserial primary key,
  room_id      text not null references rooms(id) on delete cascade,
  author_id    uuid not null references auth.users(id) on delete cascade,
  author_email text not null,
  body         text not null check (length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);
alter table messages enable row level security;
grant select, insert on messages to authenticated;
grant usage on sequence messages_id_seq to authenticated;
drop policy if exists "messages are readable" on messages;
create policy "messages are readable" on messages
  for select to authenticated using (true);
drop policy if exists "post as yourself" on messages;
create policy "post as yourself" on messages
  for insert to authenticated
  with check (author_id = auth.uid() and author_email = auth.email());

-- Turn on the realtime change stream for both tables.
select realtime.enable('public.rooms');
select realtime.enable('public.messages');

-- Seed a few rooms.
insert into rooms (id, name) values
  ('general', 'General'),
  ('random',  'Random'),
  ('basalt',  'Basalt')
on conflict (id) do nothing;
`;

const key = await serviceKey();
const res = await fetch(`${BASE}/meta/v1/query`, {
  method: 'POST',
  headers: { apikey: key, 'content-type': 'application/json' },
  body: JSON.stringify({ sql: RULES }),
});
const body = await res.json();
if (!res.ok) {
  console.error('Setup failed:', body.error ?? res.statusText);
  process.exit(1);
}
console.log(`Basalt Chat is ready. Ran ${body.statements} statements.`);
console.log(`Open ${BASE}/chat.html`);
