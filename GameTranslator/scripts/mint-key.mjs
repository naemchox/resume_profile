#!/usr/bin/env node
// Mint, check and revoke Gloss Pro licence keys.
//
// Sales are collected by hand over PromptPay (PRICING-AI.md §15), so this is the counter: the slip
// arrives, you run this, you paste the key into the reply. The Worker verifies keys with the same
// HMAC and never has to be told a key exists, so minting works offline and costs nothing.
//
//   node scripts/mint-key.mjs --new-secret        once, at setup: prints the secret to install
//   node scripts/mint-key.mjs --note somebody@x.y after a slip: prints ONE key and logs the sale
//   node scripts/mint-key.mjs --check GLOSS-...   is this key real? (offline, no network)
//   node scripts/mint-key.mjs --topup GLOSS-... 1000   they bought again: same key, more reads
//   node scripts/mint-key.mjs --revoke GLOSS-...  refund: prints the one command that kills it
//   node scripts/mint-key.mjs --backup D:/Drive/gloss  once: where the secret + sales log are copied
//
// The secret lives OUTSIDE the repo, in ~/.gloss/key-secret.txt (override with GLOSS_KEY_SECRET).
// Lose it and every key sold so far stops validating, so back that one file up.
import { mintKey, signKeyId, KEY_RE } from '../worker/src/index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const HOME = os.homedir();
const SECRET_FILE = path.join(HOME, '.gloss', 'key-secret.txt');
const SALES_FILE = path.join(HOME, '.gloss', 'sales.tsv');
// Same namespace as worker/wrangler.toml. Spelled out here so a refund is a copy-paste, not a hunt.
const KV_NAMESPACE_ID = 'ab9c561dad3f4203b43a15c7f5c2e07d';
// The reads one purchase buys, read from the Worker config so this file cannot quote a number the
// Worker does not actually grant (PRO_CREDITS in worker/wrangler.toml).
const BASE = Number((fs.readFileSync(new URL('../worker/wrangler.toml', import.meta.url), 'utf8').split('PRO_CREDITS = "')[1] || '').split('"')[0]) || 1000;

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : (argv[i + 1] ?? '');
};
const has = (name) => argv.includes(name);

function readSecret() {
  const fromEnv = process.env.GLOSS_KEY_SECRET;
  if (fromEnv) return fromEnv.trim();
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  console.error(`No secret found.\n  Expected ${SECRET_FILE} (or GLOSS_KEY_SECRET in the environment).\n  Run: node scripts/mint-key.mjs --new-secret`);
  process.exit(1);
}

if (has('--new-secret')) {
  // 32 random bytes as hex. Written to disk here AND printed, because it has to end up in two
  // places — this machine (to mint) and the Worker (to verify) — and they must be the same string.
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  if (fs.existsSync(SECRET_FILE)) {
    console.error(`${SECRET_FILE} already exists. Refusing to overwrite it — every key ever sold is\nverified with it. Delete it by hand if you really mean to invalidate them all.`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, secret + '\n', { mode: 0o600 });
  console.log(`Saved to ${SECRET_FILE}\n\nNow give the Worker the same secret:\n\n  cd worker && npx wrangler secret put GLOSS_KEY_SECRET\n\nand paste this when it asks:\n\n${secret}\n`);
  process.exit(0);
}

const key = flag('--check') || flag('--revoke');

if (has('--check') || has('--revoke')) {
  const m = KEY_RE.exec((key || '').trim().toUpperCase());
  if (!m) {
    console.log('NOT A GLOSS KEY — wrong shape. Expected GLOSS-XXXXXXXX-XXXXXXXX');
    process.exit(1);
  }
  const [, id, sig] = m;
  const ok = (await signKeyId(readSecret(), id)) === sig;
  if (!ok) {
    console.log(`FORGED or mistyped — the signature does not match. id=${id}`);
    process.exit(1);
  }
  if (has('--check')) {
    console.log(`REAL — minted by us. id=${id}`);
    const line = fs.existsSync(SALES_FILE) ? fs.readFileSync(SALES_FILE, 'utf8').split('\n').find((l) => l.includes(id)) : null;
    console.log(line ? `Sold: ${line}` : 'Not in the local sales log (minted on another machine, or before logging).');
    console.log('This says nothing about a refund — revoked keys still pass this check. That state lives in KV.');
    process.exit(0);
  }
  console.log(`Revoke id=${id} by writing one KV entry (takes effect immediately — the Worker does not cache our own keys):\n\n  cd worker && npx wrangler kv key put --remote --namespace-id ${KV_NAMESPACE_ID} rev:${id} 1\n\nUndo with the same command and \`key delete\`.`);
  process.exit(0);
}

// Read one number out of KV. Missing entry, no network, no wrangler — all mean "0 so far", which
// the callers handle; this never throws.
function kvGet(kvKey) {
  try {
    const out = execSync(`npx wrangler kv key get --remote --namespace-id ${KV_NAMESPACE_ID} ${kvKey}`, {
      cwd: path.join(import.meta.dirname, '..', 'worker'), stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const lines = out.split(String.fromCharCode(10));
    return Number(lines[lines.length - 1].trim()) || 0;
  } catch {
    return 0;
  }
}

function kvPut(kvKey, value) {
  execSync(`npx wrangler kv key put --remote --namespace-id ${KV_NAMESPACE_ID} ${kvKey} ${value}`, {
    cwd: path.join(import.meta.dirname, '..', 'worker'), stdio: ['ignore', 'ignore', 'inherit'],
  });
}

const BACKUP_FILE = path.join(HOME, '.gloss', 'backup-path.txt');

// Everything that makes a sale honourable lives in two files on ONE machine: the secret every key
// ever sold is verified against, and the log of who bought. A dead disk takes both — the keys stop
// validating and there is no record of whose money to give back. So a copy goes somewhere else on
// every sale, set once with --backup, and if it was never set this says so every single time.
function backupNow() {
  let dir = null;
  try { dir = fs.readFileSync(BACKUP_FILE, "utf8").trim(); } catch { dir = null; }
  if (!dir) {
    console.error(`NOT BACKED UP — the secret and the sales log exist on this machine only.
  Set a second home once (a synced folder is ideal):  node scripts/mint-key.mjs --backup <folder>`);
    return;
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(SECRET_FILE, path.join(dir, 'gloss-key-secret.txt'));
    if (fs.existsSync(SALES_FILE)) fs.copyFileSync(SALES_FILE, path.join(dir, 'gloss-sales.tsv'));
  } catch (e) {
    console.error(`BACKUP FAILED to ${dir} — ${e.message}`);
  }
}

// The sales log also goes to KV, where it survives this machine entirely. Only what support needs:
// which key, when, and the note (an email) — never the secret, which nothing can reconstruct a key
// from anyway.
function recordSale(id, kind, amount, note) {
  // Written through a file rather than an argument. The value is JSON, JSON is full of quotes, and
  // quotes through a Windows shell come out the other side as something else.
  const tmp = path.join(os.tmpdir(), `gloss-sale-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmp, JSON.stringify({ at: new Date().toISOString(), kind, amount, note: note || '' }));
    execSync(`npx wrangler kv key put --remote --namespace-id ${KV_NAMESPACE_ID} sale:${id}:${Date.now()} --path ${tmp}`, {
      cwd: path.join(import.meta.dirname, '..', 'worker'), stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    console.error(`Sale not mirrored to KV (the local log still has it) — id=${id}`);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* it was a temp file */ }
  }
}

// The Worker refuses AI reads once the whole service has spent SPEND_CAP_UNITS — a ceiling sized
// for a launch with no income. Every sale adds the reads it bought, so a paying customer is never
// refused a read they already paid for. Skipping this silently is the expensive failure, so it
// says so loudly and tells you the one command that fixes it.
function raiseCeiling(units, why) {
  const now = kvGet('spend:cap');
  const total = (now || 0) + units;
  try {
    kvPut('spend:cap', total);
    console.log(`Service ceiling raised for ${why}: +${units} reads (now ${total} above the free floor).`);
  } catch {
    console.error(`CEILING NOT RAISED — the key works, but the service can still run out early.

  cd worker && npx wrangler kv key put --remote --namespace-id ${KV_NAMESPACE_ID} spend:cap ${total}`);
  }
}
if (has('--backup')) {
  const dir = flag('--backup');
  if (!dir) {
    console.error('Give it a folder: --backup "D:/Drive/gloss"');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
  fs.writeFileSync(BACKUP_FILE, dir + String.fromCharCode(10));
  backupNow();
  console.log(`Backing up to ${dir} from now on — copied once now, and again on every sale.`);
  process.exit(0);
}

if (has('--topup')) {
  // Buying a second time adds reads to the key they already have, instead of handing them a second
  // key to swap in while the remainder of the first is thrown away. Same price per read as the
  // first purchase — see the note in worker/src/index.js identify().
  const m = KEY_RE.exec((flag('--topup') || '').trim().toUpperCase());
  if (!m) {
    console.log('NOT A GLOSS KEY — expected GLOSS-XXXXXXXX-XXXXXXXX');
    process.exit(1);
  }
  const [, id, sig] = m;
  if ((await signKeyId(readSecret(), id)) !== sig) {
    console.log(`FORGED or mistyped — signature does not match. id=${id}`);
    process.exit(1);
  }
  // How many reads THB 390 buys. Kept here rather than in the Worker because it is a sales figure,
  // not a runtime one: the Worker only ever adds up what this wrote.
  const amount = Number(argv[argv.indexOf('--topup') + 2]) || 1000;
  const kvKey = `top:g:${id}`;

  // Read what is already there before adding to it. A top-up is a running total in one KV entry, so
  // writing the amount instead of the sum would silently erase every earlier top-up.
  const current = kvGet(kvKey);
  const total = current + amount;

  // Apply it here rather than printing a command to paste. A top-up that is logged as sold but
  // never actually written is the one bug in this file that costs a customer their reads.
  try {
    kvPut(kvKey, total);
  } catch {
    console.error(`COULD NOT WRITE — nothing was topped up. Run it by hand:

  cd worker && npx wrangler kv key put --remote --namespace-id ${KV_NAMESPACE_ID} ${kvKey} ${total}`);
    process.exit(1);
  }
  raiseCeiling(amount, `top-up of ${id}`);
  recordSale(id, 'topup', amount, flag('--note'));
  backupNow();
  fs.mkdirSync(path.dirname(SALES_FILE), { recursive: true });
  fs.appendFileSync(SALES_FILE, `${new Date().toISOString()}	GLOSS-${id}-${sig}	topup +${amount} (extra now ${total})	${flag('--note') || ''}
`);

  console.log(`Topped up. id=${id} · was +${current} · now +${total}

Their allowance is ${BASE + total} reads and they keep the key they already have — nothing
for them to paste. It shows up on their next read (our keys are never cached).`);
  process.exit(0);
}

// Default: mint.
const count = Number(flag('-n') || 1);
const note = flag('--note') || '';
const secret = readSecret();
const stamp = new Date().toISOString();
const minted = [];
for (let i = 0; i < count; i++) minted.push(await mintKey(secret));

fs.mkdirSync(path.dirname(SALES_FILE), { recursive: true });
for (const k of minted) fs.appendFileSync(SALES_FILE, `${stamp}\t${k}\t${note}\n`);

raiseCeiling(BASE * count, count > 1 ? `${count} new keys` : 'a new key');
for (const k of minted) recordSale(KEY_RE.exec(k)[1], 'sale', BASE, note);
backupNow();

console.log(minted.join('\n'));
console.log(`\nLogged to ${SALES_FILE}${note ? ` as "${note}"` : ' with no note — pass --note <email> so a support question can be answered later'}`);
