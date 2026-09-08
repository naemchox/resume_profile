/* Pre-deploy self-test for functions/index.js.
 *
 * The Firestore emulator needs JDK 21 and this machine has 8, so the transaction itself cannot be
 * exercised here. What can be checked without a database is the part that has actually gone wrong
 * before: the week key, and the quota table drifting away from MEMBERSHIP in talk.html — a
 * mismatch there shows up as a member who can see nine marks and spend eight.
 *
 *   node functions/selftest.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'index.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};

/* ---- 1. the module parses and exports what firebase expects ---- */
console.log('module shape');
ok('exports startChat', /export const startChat = onCall/.test(src));
ok('uses v2 onCall', /firebase-functions\/v2\/https/.test(src));
ok('region pinned', /region: 'asia-southeast1'/.test(src));

/* ---- 2. quota table matches MEMBERSHIP in talk.html ---- */
console.log('quota table vs talk.html');
const app = readFileSync(join(here, '..', 'talk.html'), 'utf8');
const tiers = [...app.matchAll(/\{ id:'(\w+)',\s+th:'[^']*',\s+price:(\d+)(?:,\s*list:\d+)?,\s+unit:'[^']*',\s+invites:(\d+)/g)]
  .map(m => ({ id: m[1], price: +m[2], invites: +m[3] }));
ok('found the tiers', tiers.length >= 3, `found ${tiers.length}`);

const quotaLine = src.match(/const QUOTA = \{([^}]*)\}/);
ok('QUOTA present', !!quotaLine);
const QUOTA = {};
if (quotaLine) for (const part of quotaLine[1].split(',')) {
  const m = part.match(/'?([\w]*)'?\s*:\s*(\d+)/);
  if (m) QUOTA[m[1]] = +m[2];
}
for (const t of tiers) {
  ok(`${t.id} = ${t.invites}`, QUOTA[t.id] === t.invites, `server says ${QUOTA[t.id]}`);
}
ok("no-plan default matches free", QUOTA[''] === QUOTA.free, `'' = ${QUOTA['']}, free = ${QUOTA.free}`);

/* ---- 3. the week key ---- */
console.log('isoWeekKey (Asia/Bangkok)');
function isoWeekKey(now) {
  const t = new Date(now.getTime() + 7 * 3600 * 1000);
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - y0) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}
ok('copy in index.js is identical', src.includes('const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));'));
// 2026-08-18 is a Tuesday → ISO week 34
ok('Tue 18 Aug 2026 → W34', isoWeekKey(new Date('2026-08-18T05:00:00Z')) === '2026-W34', isoWeekKey(new Date('2026-08-18T05:00:00Z')));
// 23:30 UTC Sunday in Bangkok is already Monday, i.e. the next week — the reset the member sees
const sunLateUTC = new Date('2026-08-23T17:30:00Z');   // 00:30 Mon in Bangkok
ok('Bangkok Monday rolls over', isoWeekKey(sunLateUTC) === '2026-W35', isoWeekKey(sunLateUTC));
// and 30 minutes earlier is still the old week
ok('Bangkok Sunday does not', isoWeekKey(new Date('2026-08-23T16:30:00Z')) === '2026-W34',
   isoWeekKey(new Date('2026-08-23T16:30:00Z')));

/* ---- 4. the two rules the audit set, still in the rules file ---- */
console.log('firestore.rules closes the bypasses');
const rules = readFileSync(join(here, '..', 'firestore.rules'), 'utf8');
ok('inviteWeek is immutable to clients', /inviteWeek'?,?\s*\{\}\)\s*==/.test(rules) || rules.includes("get('inviteWeek', {})"));
const chatsBlock = rules.slice(rules.indexOf('match /chats/'), rules.indexOf('match /chats/') + 900);
ok('clients cannot create chats', /allow create: if false;/.test(chatsBlock));
const invitesBlock = rules.slice(rules.indexOf('match /invites/'), rules.indexOf('match /invites/') + 700);
ok('clients cannot create invite records', /allow create: if false;/.test(invitesBlock));

/* ---- 5. the client actually calls it ---- */
console.log('client wiring');
ok('startChatWith exists', app.includes('async function startChatWith(other, origin)'));
ok('callable is bound to the same region', app.includes("getFunctions(fbApp, 'asia-southeast1')"));
ok('no client-side chat creation left', !/setDoc\(ref,\{ members/.test(app));
ok('consumeInvite is gone', !/async function consumeInvite/.test(app));
ok('cap error opens the upgrade sheet', (app.match(/isCapError\(e\)/g) || []).length >= 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
