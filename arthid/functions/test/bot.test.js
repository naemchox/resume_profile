// Exercises the Discord bot's pure logic and its command handlers against an
// in-memory stand-in for Firestore. No emulator required.
const nacl = require('tweetnacl');
const admin = require('firebase-admin');
const D = require('../discord.js');

// Swap the Firestore accessor for an in-memory one. Done before arthid.js and
// commands.js are required, because commands.js captures FieldValue on load.
// firebase-admin exposes `firestore` as a getter, so a plain assignment is a
// silent no-op — it has to be redefined.
const FieldValue = admin.firestore.FieldValue;
let fakeDb = null;
const fsStub = () => fakeDb;
fsStub.FieldValue = FieldValue;
Object.defineProperty(admin, 'firestore', { value: fsStub, configurable: true, writable: true });

const A = require('../arthid.js');
const C = require('../commands.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  → ' + JSON.stringify(extra) : ''}`); }
};

/* ---------------- 1. Ed25519 signature verification ---------------- */
console.log('\nSignature verification');
{
  const kp = nacl.sign.keyPair();
  const publicKey = Buffer.from(kp.publicKey).toString('hex');
  const body = Buffer.from(JSON.stringify({ type: 1 }));
  const ts = '1700000000';
  const sig = Buffer.from(
    nacl.sign.detached(Buffer.concat([Buffer.from(ts), body]), kp.secretKey)
  ).toString('hex');

  ok('valid signature accepted', D.verifyRequest(body, sig, ts, publicKey) === true);
  ok('tampered body rejected',
     D.verifyRequest(Buffer.from(JSON.stringify({ type: 2 })), sig, ts, publicKey) === false);
  ok('wrong timestamp rejected', D.verifyRequest(body, sig, '1700000001', publicKey) === false);
  ok('wrong public key rejected',
     D.verifyRequest(body, sig, ts, Buffer.from(nacl.sign.keyPair().publicKey).toString('hex')) === false);
  ok('missing pieces rejected', D.verifyRequest(body, null, ts, publicKey) === false);
  ok('garbage hex does not throw', D.verifyRequest(body, 'zzzz', ts, publicKey) === false);
}

/* ---------------- 2. option parsing ---------------- */
console.log('\nOption parsing');
{
  const sub = D.readOptions({
    name: 'todo',
    options: [{ type: 1, name: 'add', options: [{ name: 'text', value: 'ซื้อนม' }] }],
  });
  ok('subcommand name read', sub.sub === 'add', sub);
  ok('nested option read', sub.opts.text === 'ซื้อนม', sub);

  const flat = D.readOptions({ name: 'bind', options: [{ name: 'chat', value: 'grp_x' }] });
  ok('flat option read', flat.sub === null && flat.opts.chat === 'grp_x', flat);

  const none = D.readOptions({ name: 'todo' });
  ok('no options is safe', none.sub === null && Object.keys(none.opts).length === 0, none);
}

/* ---------------- 3. in-memory Firestore ---------------- */
const store = new Map();   // "path/to/doc" -> data

function docRef(path) {
  return {
    __path: path,
    id: path.split('/').pop(),
    get: async () => ({
      exists: store.has(path),
      id: path.split('/').pop(),
      data: () => store.get(path),
      ref: docRef(path),
    }),
    set: async (d) => { store.set(path, JSON.parse(JSON.stringify(d))); },
    update: async (d) => { store.set(path, Object.assign({}, store.get(path), JSON.parse(JSON.stringify(d)))); },
    delete: async () => { store.delete(path); },
    collection: (c) => colRef(`${path}/${c}`),
  };
}

function snapshotOf(paths) {
  const docs = paths.map(p => ({
    id: p.split('/').pop(),
    data: () => store.get(p),
    ref: docRef(p),
  }));
  return { empty: docs.length === 0, size: docs.length, docs };
}

function colRef(path) {
  const all = () => [...store.keys()].filter(k =>
    k.startsWith(path + '/') && k.slice(path.length + 1).indexOf('/') === -1);
  const q = (filters = []) => ({
    where: (f, _op, v) => q([...filters, [f, v]]),
    orderBy: () => q(filters),
    limit: () => q(filters),
    get: async () => snapshotOf(all().filter(p => {
      const d = store.get(p) || {};
      return filters.every(([f, v]) =>
        Array.isArray(d[f]) ? d[f].includes(v) : d[f] === v);
    })),
  });
  return {
    doc: (id) => docRef(`${path}/${id}`),
    add: async (d) => {
      const id = 'auto_' + Math.random().toString(36).slice(2, 8);
      store.set(`${path}/${id}`, JSON.parse(JSON.stringify(d)));
      return docRef(`${path}/${id}`);
    },
    ...q(),
  };
}

fakeDb = {
  collection: colRef,
  getAll: async (...refs) => Promise.all(refs.map(r => r.get())),
};

/* ---------------- 4. handlers ---------------- */
const CHAT = 'grp_me_you';
const CHANNEL = 'chan_1';
const interaction = {
  channel_id: CHANNEL,
  guild_id: 'guild_1',
  member: { user: { id: 'discord_123' } },
};

(async () => {
  console.log('\n/link');
  store.set('users/uid_me', { name: 'มน', primaryKey: 'ARTH-9K2', primaryKeyLower: 'arth-9k2' });

  let r = await C.handleLink(interaction, { sub: 'account', opts: { key: 'nope' } });
  ok('unknown key is rejected', /ไม่พบผู้ใช้/.test(r.content), r);

  r = await C.handleLink(interaction, { sub: 'account', opts: { key: 'ARTH-9K2' } });
  ok('link succeeds, case-insensitive', /มน/.test(r.content), r);
  ok('link row written', store.get('discordLinks/discord_123').uid === 'uid_me');

  r = await C.handleLink({ ...interaction, member: { user: { id: 'discord_999' } } },
                         { sub: 'account', opts: { key: 'ARTH-9K2' } });
  ok('same Arthid account cannot be claimed twice', /ถูกเชื่อมกับ Discord อื่นแล้ว/.test(r.content), r);

  console.log('\nguards before /bind');
  r = await C.handleTodo(interaction, { sub: 'list', opts: {} });
  ok('unbound channel is refused', /bind/.test(r.content), r);

  console.log('\n/bind');
  store.set(`chats/${CHAT}`, { type: 'group', members: ['uid_me', 'uid_you'] });
  r = await C.handleBind(interaction, { opts: { chat: CHAT } });
  ok('bind succeeds', /ผูกห้องนี้/.test(r.content), r);
  ok('bind row written', store.get(`discordChannels/${CHANNEL}`).chatId === CHAT);

  console.log('\n/todo');
  r = await C.handleTodo(interaction, { sub: 'list', opts: {} });
  ok('empty planner explains itself', /ยังไม่มีงาน/.test(r.content), r);

  await C.handleTodo(interaction, { sub: 'add', opts: { text: 'ออกแบบโลโก้' } });
  await C.handleTodo(interaction, { sub: 'add', opts: { text: 'ส่งใบเสนอราคา' } });
  r = await C.handleTodo(interaction, { sub: 'list', opts: {} });
  const btns = () => (r.components || []).flatMap(row => row.components);
  ok('tasks land in chats/{id}/tasks',
     [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/tasks/`)).length === 2);
  ok('one button per task', btns().length === 2, btns());
  ok('buttons render unchecked', btns().every(b => b.label.startsWith('☐')), btns().map(b => b.label));
  ok('open buttons are secondary style', btns().every(b => b.style === 2), btns().map(b => b.style));
  ok('counter in the header', /2 ค้าง \/ 2 ทั้งหมด/.test(r.content), r.content);
  ok('custom_id carries the task id', btns().every(b => /^todo:.+/.test(b.custom_id)), btns().map(b => b.custom_id));

  console.log('\n/todo buttons');
  const targetId = btns().find(b => b.label.includes('โลโก้')).custom_id.split(':')[1];
  let c = await C.handleComponent(interaction, `todo:${targetId}`);
  ok('click updates the message in place', c.mode === 'update', c.mode);
  r = c.payload;
  ok('clicked task is now checked',
     btns().find(b => b.label.includes('โลโก้')).label.startsWith('☑'), btns().map(b => b.label));
  ok('checked button turns green',
     btns().find(b => b.label.includes('โลโก้')).style === 3);
  ok('header recounts after the click', /1 ค้าง \/ 2 ทั้งหมด/.test(r.content), r.content);
  ok('store really changed', store.get(`chats/${CHAT}/tasks/${targetId}`).done === true);

  c = await C.handleComponent(interaction, `todo:${targetId}`);
  r = c.payload;
  ok('clicking again un-checks it', store.get(`chats/${CHAT}/tasks/${targetId}`).done === false);

  c = await C.handleComponent(interaction, 'todo:does_not_exist');
  ok('stale button re-renders instead of erroring', c.mode === 'update', c);
  c = await C.handleComponent(interaction, 'garbage');
  ok('unknown custom_id is refused privately', c.mode === 'ephemeral', c);

  console.log('\n/todo (cont.)');
  r = await C.handleTodo(interaction, { sub: 'done', opts: { task: 'โลโก้' } });
  ok('done subcommand returns the clickable view', Array.isArray(r.components), r);

  r = await C.handleTodo(interaction, { sub: 'remove', opts: { task: 'ใบเสนอราคา' } });
  ok('remove deletes the doc',
     [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/tasks/`)).length === 1, r);

  console.log('\nbutton limits');
  for (let i = 0; i < 30; i++) {
    await C.handleTodo(interaction, { sub: 'add', opts: { text: 'งานที่ ' + i } });
  }
  r = await C.todoView(CHAT);
  const all = (r.components || []).flatMap(row => row.components);
  ok('never exceeds 5 action rows', r.components.length <= 5, r.components.length);
  ok('never exceeds 25 buttons', all.length === 25, all.length);
  ok('overflow falls back to an embed', !!r.embeds && /อีก \d+ งาน/.test(r.embeds[0].title), r.embeds && r.embeds[0].title);
  ok('labels stay within Discord 80-char cap', all.every(b => b.label.length <= 80),
     all.map(b => b.label.length).filter(n => n > 80));

  console.log('\n/project');
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'เว็บใหม่', desc: 'รีดีไซน์', emoji: '🎨' } });
  r = await C.handleProject(interaction, { sub: 'list', opts: {} });
  ok('project listed with emoji', /🎨 \*\*เว็บใหม่\*\*/.test(r.embeds[0].description), r.embeds[0].description);
  r = await C.handleProject(interaction, { sub: 'show', opts: { project: 'เว็บ' } });
  ok('show finds by partial title', /เว็บใหม่/.test(r.embeds[0].title), r.embeds[0]);
  const pKey = [...store.keys()].find(k => k.startsWith(`chats/${CHAT}/projects/`));
  ok('project id matches the web app shape', /\/p_\d+_/.test(pKey), pKey);

  console.log('\n/project remove');
  r = await C.handleProject(interaction, { sub: 'remove', opts: { project: 'ไม่มีอยู่' } });
  ok('unknown project is refused', /ไม่พบโปรเจกต์/.test(r.content), r);

  r = await C.handleProject(interaction, { sub: 'remove', opts: { project: 'เว็บ' } });
  ok('remove asks before deleting', /ลบโปรเจกต์/.test(r.content) && !!r.components, r.content);
  const delBtn = r.components[0].components.find(b => b.style === 4);
  ok('confirm button is danger-styled', !!delBtn, r.components[0].components);
  ok('cancel button offered', r.components[0].components.some(b => b.custom_id === 'cancel'));
  ok('nothing deleted yet',
     [...store.keys()].some(k => k.startsWith(`chats/${CHAT}/projects/`)));

  let cc = await C.handleComponent(interaction, 'cancel');
  ok('cancel clears the buttons and deletes nothing', cc.mode === 'update'
     && cc.payload.components.length === 0
     && [...store.keys()].some(k => k.startsWith(`chats/${CHAT}/projects/`)), cc);

  cc = await C.handleComponent(interaction, delBtn.custom_id);
  ok('confirming deletes the project',
     ![...store.keys()].some(k => k.startsWith(`chats/${CHAT}/projects/`)), cc);
  ok('deletion is reported', /ลบแล้ว/.test(cc.payload.content), cc.payload.content);

  cc = await C.handleComponent(interaction, delBtn.custom_id);
  ok('deleting twice is handled', /ถูกลบไปแล้ว/.test(cc.payload.content), cc.payload.content);

  // Ambiguity guard: two projects sharing a substring must not be deletable.
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'แอปมือถือ A' } });
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'แอปมือถือ B' } });
  r = await C.handleProject(interaction, { sub: 'remove', opts: { project: 'แอปมือถือ' } });
  ok('ambiguous match refuses to guess', /พบหลายโปรเจกต์/.test(r.content) && !r.components, r.content);
  ok('both projects still there',
     [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/projects/`)).length === 2);

  console.log('\n/poll');
  r = await C.handlePoll(interaction, {
    sub: 'new',
    opts: { question: 'ไปกินข้าวที่ไหน', option1: 'ส้มตำ', option2: 'ก๋วยเตี๋ยว' },
  });
  ok('poll embed rendered', /ไปกินข้าวที่ไหน/.test(r.embeds[0].title), r.embeds[0]);
  ok('poll mirrored as a message',
     [...store.keys()].some(k => k.startsWith(`chats/${CHAT}/messages/`)
       && store.get(k).kind === 'poll'));

  r = await C.handlePoll(interaction, { sub: 'vote', opts: { poll: 'กินข้าว', choice: 2 } });
  ok('vote recorded against a real uid',
     r.embeds[0].description.includes('100%') && /มน/.test(r.embeds[0].description),
     r.embeds[0].description);

  r = await C.handlePoll(interaction, { sub: 'vote', opts: { poll: 'กินข้าว', choice: 1 } });
  const pollKey = [...store.keys()].find(k => k.startsWith(`chats/${CHAT}/polls/`));
  const voters = store.get(pollKey).options.map(o => o.voters);
  ok('single-choice moves the vote instead of adding one',
     voters[0].length === 1 && voters[1].length === 0, voters);

  r = await C.handlePoll(interaction, { sub: 'vote', opts: { poll: 'กินข้าว', choice: 1 } });
  const voters2 = store.get(pollKey).options.map(o => o.voters);
  ok('voting the same option again clears it',
     voters2[0].length === 0 && voters2[1].length === 0, voters2);

  console.log('\nmulti-select pickers');
  // Reset to a clean set of projects to delete.
  for (const k of [...store.keys()]) if (k.startsWith(`chats/${CHAT}/projects/`)) store.delete(k);
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'อัลฟ่า' } });
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'เบต้า' } });
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'แกมม่า' } });

  r = await C.handleProject(interaction, { sub: 'remove', opts: {} });
  const menu = r.components[0].components[0];
  ok('empty arg opens a picker instead of erroring', menu.type === 3, r);
  ok('picker is multi-select', menu.min_values === 1 && menu.max_values === 3, menu);
  ok('picker lists every project', menu.options.length === 3, menu.options.map(o => o.label));
  ok('option values are ids, not titles',
     menu.options.every(o => /^p_\d+_/.test(o.value)), menu.options.map(o => o.value));

  const pickTwo = menu.options.slice(0, 2).map(o => o.value);
  let sel = { ...interaction, data: { custom_id: 'projdel_pick', values: pickTwo } };
  c = await C.handleComponent(sel, 'projdel_pick');
  ok('selecting several asks once for all of them', /ลบ 2 รายการ/.test(c.payload.content), c.payload.content);
  ok('selection parked for the confirm step',
     store.get('discordPending/discord_123').ids.length === 2);
  ok('still nothing deleted',
     [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/projects/`)).length === 3);

  c = await C.handleComponent({ ...interaction, data: { custom_id: 'projdel_go' } }, 'projdel_go');
  ok('confirm deletes every selected item',
     [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/projects/`)).length === 1, c.payload.content);
  ok('result names what went', /ลบแล้ว 2 รายการ/.test(c.payload.content), c.payload.content);
  ok('pending cleared', !store.has('discordPending/discord_123'));

  c = await C.handleComponent({ ...interaction, data: { custom_id: 'projdel_go' } }, 'projdel_go');
  ok('a stale confirm cannot delete twice', /หมดอายุ/.test(c.payload.content), c.payload.content);

  console.log('\ntodo picker');
  r = await C.handleTodo(interaction, { sub: 'remove', opts: {} });
  const tmenu = r.components[0].components[0];
  ok('todo remove opens a picker too', tmenu.custom_id === 'tododel_pick', tmenu.custom_id);
  ok('todo options show their tick state',
     tmenu.options.every(o => /^[☐☑] /.test(o.label)), tmenu.options.map(o => o.label));

  sel = { ...interaction, data: { custom_id: 'tododel_pick', values: [tmenu.options[0].value] } };
  c = await C.handleComponent(sel, 'tododel_pick');
  ok('todo selection confirms', /ลบ 1 รายการ/.test(c.payload.content), c.payload.content);
  const beforeTasks = [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/tasks/`)).length;
  c = await C.handleComponent({ ...interaction, data: { custom_id: 'tododel_go' } }, 'tododel_go');
  ok('todo confirm deletes',
     [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/tasks/`)).length === beforeTasks - 1);

  c = await C.handleComponent({ ...interaction, data: { custom_id: 'cancel' } }, 'cancel');
  ok('cancel still works from the picker flow', c.mode === 'update' && !c.payload.components.length, c);

  console.log('\n/schedule date parsing');
  const P = C.parseWhen;
  const asBkk = ms => new Date(ms + 7*3600*1000).toISOString().slice(0,16);
  ok('ISO date+time', asBkk(P('2026-08-20 14:00')) === '2026-08-20T14:00', asBkk(P('2026-08-20 14:00')));
  ok('slash D/M/Y', asBkk(P('20/08/2026 14:00')) === '2026-08-20T14:00', asBkk(P('20/08/2026 14:00')));
  ok('Buddhist-era year converts', asBkk(P('20/08/2569 14:00')) === '2026-08-20T14:00', asBkk(P('20/08/2569 14:00')));
  ok('no time defaults to 09:00', asBkk(P('2026-08-20')) === '2026-08-20T09:00', asBkk(P('2026-08-20')));
  ok('interpreted as Bangkok, stored as UTC',
     new Date(P('2026-08-20 14:00')).toISOString().slice(11,16) === '07:00',
     new Date(P('2026-08-20 14:00')).toISOString());
  ok('impossible date rejected, not rolled over', P('2026-02-30') === null, P('2026-02-30'));
  ok('bad month rejected', P('2026-13-01') === null);
  ok('bad hour rejected', P('2026-08-20 25:00') === null);
  ok('garbage rejected', P('next tuesday') === null);
  ok('empty rejected', P('') === null);

  console.log('\n/schedule');
  r = await C.handleSchedule(interaction, { sub: 'list', opts: {} });
  ok('empty schedule explains itself', /ยังไม่มีกำหนดการ/.test(r.content), r);

  r = await C.handleSchedule(interaction, { sub: 'add', opts: { title: 'ส่งงานลูกค้า', when: 'ไม่ใช่วันที่' } });
  ok('unparseable date is refused, nothing stored', /อ่านวันที่ไม่ออก/.test(r.content)
     && ![...store.keys()].some(k => k.startsWith(`chats/${CHAT}/schedule/`)), r.content);

  r = await C.handleSchedule(interaction, { sub: 'add', opts: { title: 'ส่งงานลูกค้า', when: '2030-01-15 10:30' } });
  ok('add stores the event',
     [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/schedule/`)).length === 1);
  ok('reply uses a live Discord timestamp', /<t:\d+:R>/.test(r.content), r.content);

  r = await C.handleSchedule(interaction, { sub: 'add', opts: { title: 'ประชุมทีม', when: '2020-01-01 09:00' } });
  ok('a past date is accepted but flagged', /ผ่านไปแล้ว/.test(r.content), r.content);

  r = await C.handleSchedule(interaction, { sub: 'list', opts: {} });
  ok('list splits upcoming from past',
     /ที่กำลังจะถึง/.test(r.embeds[0].description) && /ผ่านไปแล้ว/.test(r.embeds[0].description),
     r.embeds[0].description);
  ok('header counts only upcoming', /1 รายการที่ยังไม่ถึง/.test(r.embeds[0].title), r.embeds[0].title);

  r = await C.handleSchedule(interaction, { sub: 'edit', opts: { event: 'ลูกค้า', when: '2030-02-01 08:00' } });
  ok('edit reschedules', /แก้ไขแล้ว/.test(r.content), r.content);
  const ev = [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/schedule/`))
    .map(k => store.get(k)).find(e => e.title === 'ส่งงานลูกค้า');
  ok('new time persisted', asBkk(ev.at) === '2030-02-01T08:00', asBkk(ev.at));

  r = await C.handleSchedule(interaction, { sub: 'edit', opts: { event: 'ไม่มี', when: '2030-01-01' } });
  ok('edit on a missing event is refused', /ไม่พบกำหนดการ/.test(r.content), r.content);

  r = await C.handleSchedule(interaction, { sub: 'remove', opts: {} });
  const smenu = r.components[0].components[0];
  ok('remove opens the same multi-select picker', smenu.custom_id === 'scheddel_pick', smenu.custom_id);
  ok('picker shows the date in the template shape',
     smenu.options.every(o => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(o.description)), smenu.options.map(o => o.description));

  c = await C.handleComponent(
    { ...interaction, data: { custom_id: 'scheddel_pick', values: smenu.options.map(o => o.value) } },
    'scheddel_pick');
  ok('confirms both at once', /ลบ 2 รายการ/.test(c.payload.content), c.payload.content);
  c = await C.handleComponent({ ...interaction, data: { custom_id: 'scheddel_go' } }, 'scheddel_go');
  ok('schedule entries deleted',
     ![...store.keys()].some(k => k.startsWith(`chats/${CHAT}/schedule/`)), c.payload.content);

  console.log('\n/project deadline ↔ /schedule');
  // Clean slate: this section asserts on exact document counts.
  for (const k of [...store.keys()]) {
    if (k.startsWith(`chats/${CHAT}/projects/`) || k.startsWith(`chats/${CHAT}/schedule/`)) store.delete(k);
  }
  const projRows = () => [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/projects/`)).map(k => store.get(k));
  const schedRows = () => [...store.keys()].filter(k => k.startsWith(`chats/${CHAT}/schedule/`)).map(k => store.get(k));

  r = await C.handleProject(interaction, { sub: 'new', opts: { title: 'แอปใหม่', deadline: 'พรุ่งนี้' } });
  ok('unparseable deadline is refused, nothing created',
     /อ่านเดดไลน์ไม่ออก/.test(r.content) && !projRows().length && !schedRows().length, r.content);

  r = await C.handleProject(interaction, {
    sub: 'new', opts: { title: 'แอปใหม่', desc: 'เฟสแรก', emoji: '🚀', deadline: '20/08/2569 14:00' },
  });
  ok('reply shows the countdown', /⏰ เดดไลน์/.test(r.content) && /<t:\d+:R>/.test(r.content), r.content);
  let proj = projRows()[0];
  let sched = schedRows()[0];
  ok('deadline stored on the project as ms', asBkk(proj.deadline) === '2026-08-20T14:00', proj.deadline);
  ok('a schedule entry is created alongside', schedRows().length === 1 && asBkk(sched.at) === '2026-08-20T14:00', sched);
  ok('the two point at each other',
     proj.scheduleId === sched.id && sched.projectId === proj.id, { p: proj.scheduleId, s: sched.projectId });

  r = await C.handleProject(interaction, { sub: 'list', opts: {} });
  ok('list shows the deadline countdown', /⏰ <t:\d+:R>/.test(r.embeds[0].description), r.embeds[0].description);
  r = await C.handleProject(interaction, { sub: 'show', opts: { project: 'แอปใหม่' } });
  ok('show has a deadline field', r.embeds[0].fields.some(f => f.name === 'เดดไลน์'), r.embeds[0].fields);

  r = await C.handleSchedule(interaction, { sub: 'list', opts: {} });
  ok('schedule marks it as a project deadline',
     /เดดไลน์โปรเจกต์/.test(r.embeds[0].description), r.embeds[0].description);

  r = await C.handleSchedule(interaction, { sub: 'edit', opts: { event: 'แอปใหม่', when: '2026-09-01 10:00' } });
  ok('editing the entry says it mirrored', /อัปเดตเดดไลน์ของโปรเจกต์/.test(r.content), r.content);
  ok('project deadline follows the edit',
     asBkk(projRows()[0].deadline) === '2026-09-01T10:00', projRows()[0].deadline);

  // Deleting the entry must not take the project with it.
  r = await C.handleSchedule(interaction, { sub: 'remove', opts: {} });
  const dmenu = r.components[0].components[0];
  ok('picker flags the project-linked entry', /เดดไลน์โปรเจกต์/.test(dmenu.options[0].description), dmenu.options[0]);
  await C.handleComponent(
    { ...interaction, data: { custom_id: 'scheddel_pick', values: [dmenu.options[0].value] } }, 'scheddel_pick');
  c = await C.handleComponent({ ...interaction, data: { custom_id: 'scheddel_go' } }, 'scheddel_go');
  ok('deleting the entry keeps the project', projRows().length === 1, c.payload.content);
  ok('deleting the entry clears the deadline',
     projRows()[0].deadline === null && projRows()[0].scheduleId === null, projRows()[0]);
  ok('and says so', /ล้างเดดไลน์ของโปรเจกต์/.test(c.payload.content), c.payload.content);

  // The other direction: the project owns the entry.
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'เว็บร้าน', deadline: '2026-12-01' } });
  const withDeadline = projRows().find(p => p.title === 'เว็บร้าน');
  ok('no time given defaults to 09:00', asBkk(withDeadline.deadline) === '2026-12-01T09:00', withDeadline.deadline);
  c = await C.handleComponent({ ...interaction, data: { custom_id: `projdel:${withDeadline.id}` } },
                              `projdel:${withDeadline.id}`);
  ok('deleting the project deletes its schedule entry',
     !schedRows().length && /ลบเดดไลน์ออกจาก/.test(c.payload.content), c.payload.content);

  await C.handleProject(interaction, { sub: 'new', opts: { title: 'ไม่มีเดดไลน์' } });
  const plain = projRows().find(p => p.title === 'ไม่มีเดดไลน์');
  ok('a project without a deadline creates no entry',
     plain.deadline === null && plain.scheduleId === null && !schedRows().length, plain);

  /* ---------------- 5. editing ---------------- */
  // A modal submission as Discord delivers it: every text input wrapped in its
  // own action row.
  const submit = (customId, fields) => ({
    ...interaction,
    data: {
      custom_id: customId,
      components: Object.entries(fields).map(([k, v]) => ({
        type: 1, components: [{ type: 4, custom_id: k, value: v }],
      })),
    },
  });
  const inputsOf = m => m.components.flatMap(row => row.components);

  console.log('\n/todo edit');
  for (const k of [...store.keys()]) if (k.startsWith(`chats/${CHAT}/tasks/`)) store.delete(k);
  await C.handleTodo(interaction, { sub: 'add', opts: { text: 'ร่างสัญญา' } });
  await C.handleTodo(interaction, { sub: 'add', opts: { text: 'จองห้องประชุม' } });

  r = await C.handleTodo(interaction, { sub: 'edit', opts: {} });
  const emenu = r.components[0].components[0];
  ok('bare /todo edit offers the list', emenu.custom_id === 'todoedit_pick', emenu.custom_id);
  ok('edit picker is single-select', emenu.min_values === 1 && emenu.max_values === 1, emenu);
  ok('edit picker lists every task', emenu.options.length === 2, emenu.options.map(o => o.label));

  r = await C.handleTodo(interaction, { sub: 'edit', opts: { task: 'สัญญา' } });
  ok('naming a task opens the form directly', !!r.modal, r);
  ok('form is bound to that task id', r.modal.custom_id === `todoedit:${emenu.options.find(o => /สัญญา/.test(o.label)).value}`, r.modal.custom_id);
  ok('form arrives prefilled', inputsOf(r.modal)[0].value === 'ร่างสัญญา', inputsOf(r.modal)[0]);

  r = await C.handleTodo(interaction, { sub: 'edit', opts: { task: 'ไม่มีงานนี้' } });
  ok('unknown task is refused', /ไม่พบงานนั้น/.test(r.content), r);

  const editId = emenu.options.find(o => /สัญญา/.test(o.label)).value;
  c = await C.handleComponent(
    { ...interaction, data: { custom_id: 'todoedit_pick', values: [editId] } }, 'todoedit_pick');
  ok('picking from the list opens the same form', c.mode === 'modal' && c.payload.custom_id === `todoedit:${editId}`, c);

  c = await C.handleModal(submit(`todoedit:${editId}`, { text: 'ร่างสัญญาฉบับแก้ไข' }));
  ok('submitting rewrites the task', store.get(`chats/${CHAT}/tasks/${editId}`).text === 'ร่างสัญญาฉบับแก้ไข');
  ok('and re-renders the planner', c.mode === 'update' && /1 ค้าง \/ 2 ทั้งหมด|2 ค้าง \/ 2 ทั้งหมด/.test(c.payload.content), c.payload.content);
  ok('editing does not touch the tick', store.get(`chats/${CHAT}/tasks/${editId}`).done === false);

  c = await C.handleModal(submit(`todoedit:${editId}`, { text: '   ' }));
  ok('an empty task is refused privately', c.mode === 'ephemeral' && /ว่างไม่ได้/.test(c.payload.content), c);
  ok('and the old text survives', store.get(`chats/${CHAT}/tasks/${editId}`).text === 'ร่างสัญญาฉบับแก้ไข');

  c = await C.handleModal(submit('todoedit:gone', { text: 'อะไรก็ตาม' }));
  ok('editing a deleted task re-renders instead of erroring', c.mode === 'update', c);
  c = await C.handleModal(submit('garbage:1', { text: 'x' }));
  ok('an unknown form is refused', c.mode === 'ephemeral' && /ใช้ไม่ได้แล้ว/.test(c.payload.content), c);

  console.log('\n/project edit');
  for (const k of [...store.keys()]) {
    if (k.startsWith(`chats/${CHAT}/projects/`) || k.startsWith(`chats/${CHAT}/schedule/`)) store.delete(k);
  }
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'ร้านกาแฟ', desc: 'เฟสแรก', emoji: '☕' } });
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'ร้านหนังสือ' } });

  r = await C.handleProject(interaction, { sub: 'edit', opts: {} });
  const pmenu = r.components[0].components[0];
  ok('bare /project edit offers the list', pmenu.custom_id === 'projedit_pick', pmenu.custom_id);
  ok('project edit picker is single-select', pmenu.max_values === 1, pmenu);

  r = await C.handleProject(interaction, { sub: 'edit', opts: { project: 'ร้าน' } });
  ok('an ambiguous name shows a picker rather than an error',
     !!r.components && r.components[0].components[0].custom_id === 'projedit_pick', r);

  r = await C.handleProject(interaction, { sub: 'edit', opts: { project: 'กาแฟ' } });
  ok('a unique name opens the form', !!r.modal, r);
  const pf = Object.fromEntries(inputsOf(r.modal).map(i => [i.custom_id, i.value]));
  ok('every project field is editable',
     inputsOf(r.modal).map(i => i.custom_id).join() === 'title,emoji,desc,deadline,status',
     inputsOf(r.modal).map(i => i.custom_id));
  ok('within Discord 5-input cap', inputsOf(r.modal).length <= 5);
  ok('project form is prefilled', pf.title === 'ร้านกาแฟ' && pf.emoji === '☕' && pf.desc === 'เฟสแรก', pf);
  ok('an absent deadline leaves the field blank', pf.deadline === undefined, pf.deadline);

  const projId = r.modal.custom_id.split(':')[1];
  c = await C.handleModal(submit(`projedit:${projId}`, {
    title: 'ร้านกาแฟ (สาขา 2)', emoji: '☕', desc: 'เฟสสอง', deadline: 'เมื่อไหร่ก็ได้', status: 'active',
  }));
  ok('an unreadable deadline is refused', c.mode === 'ephemeral' && /อ่านเดดไลน์ไม่ออก/.test(c.payload.content), c);
  ok('and nothing was written', store.get(`chats/${CHAT}/projects/${projId}`).title === 'ร้านกาแฟ');

  c = await C.handleModal(submit(`projedit:${projId}`, {
    title: 'ร้านกาแฟ (สาขา 2)', emoji: '☕', desc: 'เฟสสอง', deadline: '01/03/2570 13:00', status: 'paused',
  }));
  let saved = store.get(`chats/${CHAT}/projects/${projId}`);
  ok('every field is saved',
     saved.title === 'ร้านกาแฟ (สาขา 2)' && saved.desc === 'เฟสสอง' && saved.status === 'paused', saved);
  ok('a deadline added by editing lands in /schedule',
     schedRows().length === 1 && asBkk(schedRows()[0].at) === '2027-03-01T13:00', schedRows());
  ok('the new entry points back at the project',
     saved.scheduleId === schedRows()[0].id && schedRows()[0].projectId === projId, saved.scheduleId);
  ok('the reply says so', /เพิ่มลง/.test(c.payload.content), c.payload.content);

  r = await C.handleProject(interaction, { sub: 'edit', opts: { project: 'สาขา 2' } });
  ok('reopening shows the deadline as editable text',
     inputsOf(r.modal).find(i => i.custom_id === 'deadline').value === '01/03/2027 13:00',
     inputsOf(r.modal).find(i => i.custom_id === 'deadline').value);

  c = await C.handleModal(submit(`projedit:${projId}`, {
    title: 'ร้านกาแฟ (สาขา 2)', emoji: '☕', desc: 'เฟสสอง', deadline: '2027-04-01 09:00', status: 'paused',
  }));
  ok('moving the deadline moves the existing entry, not a second one',
     schedRows().length === 1 && asBkk(schedRows()[0].at) === '2027-04-01T09:00', schedRows());
  ok('the entry title follows the project', schedRows()[0].title === 'ร้านกาแฟ (สาขา 2)', schedRows()[0].title);

  c = await C.handleModal(submit(`projedit:${projId}`, {
    title: 'ร้านกาแฟ (สาขา 2)', emoji: '☕', desc: 'เฟสสอง', deadline: '', status: 'active',
  }));
  saved = store.get(`chats/${CHAT}/projects/${projId}`);
  ok('clearing the deadline removes the entry', !schedRows().length, schedRows());
  ok('and clears both fields on the project',
     saved.deadline === null && saved.scheduleId === null, saved);
  ok('the project itself survives', !!saved.title, saved);

  c = await C.handleModal(submit(`projedit:${projId}`, { title: '  ', emoji: '', desc: '', deadline: '', status: '' }));
  ok('a nameless project is refused', c.mode === 'ephemeral' && /ใส่ชื่อโปรเจกต์/.test(c.payload.content), c);
  c = await C.handleModal(submit('projedit:p_gone', { title: 'x', emoji: '', desc: '', deadline: '', status: '' }));
  ok('editing a deleted project says so', /ถูกลบไปแล้ว/.test(c.payload.content), c.payload.content);

  console.log('\n/schedule edit form');
  await C.handleProject(interaction, { sub: 'new', opts: { title: 'งานเปิดร้าน', deadline: '2027-05-05 18:00' } });
  const schedId = schedRows()[0].id;

  r = await C.handleSchedule(interaction, { sub: 'edit', opts: {} });
  ok('bare /schedule edit opens the form for the only entry', !!r.modal, r);

  await C.handleSchedule(interaction, { sub: 'add', opts: { title: 'ประชุมรายเดือน', when: '2027-06-01 10:00' } });
  r = await C.handleSchedule(interaction, { sub: 'edit', opts: {} });
  const smenu2 = r.components[0].components[0];
  ok('with several entries it offers the list', smenu2.custom_id === 'schededit_pick', smenu2.custom_id);
  ok('list still shows the date', smenu2.options.every(o => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(o.description)),
     smenu2.options.map(o => o.description));

  r = await C.handleSchedule(interaction, { sub: 'edit', opts: { event: 'เปิดร้าน' } });
  ok('naming one with no changes opens it prefilled',
     !!r.modal && inputsOf(r.modal).find(i => i.custom_id === 'when').value === '05/05/2027 18:00', r.modal);

  r = await C.handleSchedule(interaction, { sub: 'edit', opts: { event: 'ประชุม', when: '2027-06-02 10:00' } });
  ok('the inline one-field path still works', /แก้ไขแล้ว/.test(r.content), r.content);

  c = await C.handleModal(submit(`schededit:${schedId}`, { title: 'งานเปิดร้าน', when: 'พรุ่งนี้', note: '' }));
  ok('a bad date in the form is refused', c.mode === 'ephemeral' && /อ่านวันที่ไม่ออก/.test(c.payload.content), c);

  c = await C.handleModal(submit(`schededit:${schedId}`, {
    title: 'งานเปิดร้านใหญ่', when: '2027-05-06 18:00', note: 'เชิญสื่อ',
  }));
  ok('the form saves the entry',
     asBkk(store.get(`chats/${CHAT}/schedule/${schedId}`).at) === '2027-05-06T18:00'
     && store.get(`chats/${CHAT}/schedule/${schedId}`).note === 'เชิญสื่อ',
     store.get(`chats/${CHAT}/schedule/${schedId}`));
  ok('and mirrors back to the project',
     /อัปเดตเดดไลน์ของโปรเจกต์/.test(c.payload.content)
     && asBkk(projRows().find(p => p.title === 'งานเปิดร้านใหญ่').deadline) === '2027-05-06T18:00',
     c.payload.content);

  console.log('\ndate template');
  ok('template is day-first', C.WHEN_TEMPLATE === 'DD/MM/YYYY HH:mm', C.WHEN_TEMPLATE);
  ok('formatWhen writes the template shape',
     C.formatWhen(P('20/08/2569 14:00')) === '20/08/2026 14:00', C.formatWhen(P('20/08/2569 14:00')));
  ok('formatWhen round-trips through parseWhen',
     P(C.formatWhen(P('20/08/2569 14:00'))) === P('20/08/2569 14:00'));
  ok('blank stays blank', C.formatWhen(null) === '' && C.formatWhen(undefined) === '');

  // Every separator a Thai keyboard or a pasted calendar entry produces.
  const same = '2026-08-20 14:00';
  ok('dots accepted', P('20.08.2569 14.00') === P(same), P('20.08.2569 14.00'));
  ok('dashes accepted', P('20-08-2569 14:00') === P(same));
  ok('slashes accepted', P('20/08/2026 14:00') === P(same));
  ok('ISO order still accepted', P('2026-08-20 14:00') === P(same));
  ok('Thai "น." accepted', P('20/08/2569 14:00 น.') === P(same), P('20/08/2569 14:00 น.'));
  ok('a bad date is still rejected', P('32/08/2569') === null && P('20/13/2569') === null);

  console.log('\ndate autocomplete');
  const NOW = P('16/08/2569 15:30');            // fixed clock — no Date.now() in assertions
  const names = rows => rows.map(x => x.name);
  const valuesParse = rows => rows.every(x => C.parseWhen(x.value) !== null);

  let sug = C.whenSuggestions('', NOW);
  ok('an empty box offers quick picks', sug.length >= 4, names(sug));
  ok('every suggestion is a valid date', valuesParse(sug), sug);
  ok('every suggestion is in the template shape',
     sug.every(x => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(x.value)), sug.map(x => x.value));
  ok('today is today, at the 09:00 default',
     sug[0].value === '16/08/2026 09:00', sug[0]);
  ok('tomorrow follows', sug[1].value === '17/08/2026 09:00', sug[1]);

  sug = C.whenSuggestions('20/08/2569 14:00', NOW);
  ok('a complete date is echoed back for checking', /^✅ 20\/08\/2026 14:00/.test(sug[0].name), sug[0]);
  ok('and reads it out in Thai words, BE year', /พฤ\. 20 ส\.ค\. 2569/.test(sug[0].name), sug[0].name);

  sug = C.whenSuggestions('20', NOW);
  ok('a bare day names the template first', new RegExp(C.WHEN_TEMPLATE).test(sug[0].name), sug[0].name);
  ok('and completes to the 20th of this month and next',
     sug[1].value === '20/08/2026 09:00' && sug[2].value === '20/09/2026 09:00', sug.slice(1, 3));

  sug = C.whenSuggestions('20/12', NOW);
  ok('day+month completes to this year and next',
     sug[1].value === '20/12/2026 09:00' && sug[2].value === '20/12/2027 09:00', sug.slice(1, 3));
  ok('never more than Discord\'s 25 rows', C.whenSuggestions('1', NOW).length <= 25);

  const focused = (cmd, sub, opt, value) => ({
    ...interaction,
    data: {
      name: cmd,
      options: [{ type: 1, name: sub, options: [{ name: opt, value, focused: true }] }],
    },
  });
  ok('/schedule add when is autocompleted',
     C.handleAutocomplete(focused('schedule', 'add', 'when', '')).length > 0);
  ok('/schedule edit when is autocompleted',
     C.handleAutocomplete(focused('schedule', 'edit', 'when', '')).length > 0);
  ok('/project new deadline is autocompleted',
     C.handleAutocomplete(focused('project', 'new', 'deadline', '')).length > 0);
  ok('a non-date box gets nothing',
     C.handleAutocomplete(focused('schedule', 'add', 'title', 'ประชุม')).length === 0);
  ok('an unknown command gets nothing',
     C.handleAutocomplete(focused('todo', 'add', 'text', 'x')).length === 0);
  ok('no focused option does not throw',
     C.handleAutocomplete({ data: { name: 'schedule', options: [] } }).length === 0);

  console.log('\n/schedule add form');
  store.set(`chats/${CHAT}`, { type: 'group', members: ['uid_me', 'uid_you'] });  // still a member
  for (const k of [...store.keys()]) if (k.startsWith(`chats/${CHAT}/schedule/`)) store.delete(k);

  r = await C.handleSchedule(interaction, { sub: 'add', opts: { title: 'ประชุมใหญ่' } });
  ok('a blank date opens the form instead of erroring', !!r.modal, r);
  const addWhen = inputsOf(r.modal).find(i => i.custom_id === 'when');
  ok('the When box states the template in its label',
     addWhen.label.includes(C.WHEN_TEMPLATE), addWhen.label);
  ok('the When box carries the template as its placeholder',
     addWhen.placeholder.startsWith(C.WHEN_TEMPLATE), addWhen.placeholder);
  ok('and opens prefilled with a real date in that shape',
     /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(addWhen.value) && C.parseWhen(addWhen.value) > Date.now(),
     addWhen.value);
  ok('the title already typed is carried into the form',
     inputsOf(r.modal).find(i => i.custom_id === 'title').value === 'ประชุมใหญ่', r.modal);
  ok('nothing was written yet', !schedRows().length);

  c = await C.handleModal(submit('schedadd:new', { title: 'ประชุมใหญ่', when: '20/08/2569 14:00', note: 'ห้อง A' }));
  ok('submitting the form creates the entry',
     schedRows().length === 1 && asBkk(schedRows()[0].at) === '2026-08-20T14:00', schedRows());
  ok('the note comes across', schedRows()[0].note === 'ห้อง A', schedRows()[0]);
  ok('and the result is posted publicly, not privately', c.mode === 'reply', c.mode);

  c = await C.handleModal(submit('schedadd:new', { title: 'ผิดรูปแบบ', when: 'พรุ่งนี้เย็น', note: '' }));
  ok('a date that misses the template is refused',
     c.mode === 'ephemeral' && /อ่านวันที่ไม่ออก/.test(c.payload.content), c);
  ok('and it says what the shape is', new RegExp(C.WHEN_TEMPLATE).test(c.payload.content), c.payload.content);
  ok('nothing extra written', schedRows().length === 1, schedRows());

  console.log('\ndate boxes all carry the template');
  r = await C.handleSchedule(interaction, { sub: 'edit', opts: {} });
  const editWhen = inputsOf(r.modal).find(i => i.custom_id === 'when');
  ok('/schedule edit form', editWhen.placeholder.startsWith(C.WHEN_TEMPLATE)
     && editWhen.label.includes(C.WHEN_TEMPLATE), editWhen);

  await C.handleProject(interaction, { sub: 'new', opts: { title: 'โปรเจกต์เทมเพลต' } });
  r = await C.handleProject(interaction, { sub: 'edit', opts: { project: 'โปรเจกต์เทมเพลต' } });
  const dlBox = inputsOf(r.modal).find(i => i.custom_id === 'deadline');
  ok('/project edit form', dlBox.placeholder.startsWith(C.WHEN_TEMPLATE)
     && dlBox.label.includes(C.WHEN_TEMPLATE), dlBox);
  ok('an empty deadline box is left empty, not filled with the template text',
     dlBox.value === undefined, dlBox.value);

  console.log('\nnon-member guard');
  store.set(`chats/${CHAT}`, { type: 'group', members: ['uid_you'] });   // kicked out
  r = await C.handleTodo(interaction, { sub: 'list', opts: {} });
  ok('non-member is refused even with a bound channel', /ไม่ได้เป็นสมาชิก/.test(r.content), r);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
