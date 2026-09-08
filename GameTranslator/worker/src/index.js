// Gloss licence + AI proxy (Cloudflare Worker).
//
// WHY THIS EXISTS. Until now the only way to get AI features was to paste your own Anthropic API
// key into Settings. That means signing up for an Anthropic org, adding a card, topping up a
// minimum balance and minting a key — a chain most people who just want to read a game will not
// finish. Selling a licence and then telling the buyer to go find an API key is selling a permit to
// someone who came for a result.
//
// So the app talks to this Worker instead, and the Worker holds the real key. Three things fall out
// of that, in order of how much they matter:
//   1. The app works the moment it is installed. No key, no console, no card.
//   2. Quota is enforceable, so one heavy user cannot outrun a one-time purchase price.
//   3. The AI becomes the licence check. An Electron app is trivial to crack open, but a cracked
//      copy still has no key of its own, and this Worker will not answer it.
//
// WHAT THIS IS NOT. It is not a general-purpose Claude proxy with a bouncer. Requests are clamped
// (see clampBody) rather than rebuilt from scratch server-side, which means a leaked licence key
// could be pointed at prompts other than Gloss's. That is deliberate: rebuilding all five prompts
// here would duplicate them in two repos and they would drift. The exposure is bounded by the same
// quota that bounds a legitimate user — a stolen key buys someone a capped number of small Haiku
// calls per month, not an open tap.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// The app only ever asks for Haiku, and pricing assumes it. Forcing the model here means a modified
// client cannot bill us for Opus.
const ALLOWED_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS_CAP = 1024;      // matches the largest max_tokens any real call site asks for
const MAX_BODY_BYTES = 512 * 1024; // a screenshot for OCR is the biggest legitimate payload

// What a read actually costs, as opposed to what it could cost. Every price in PRICING.md rests on
// THB 0.20/unit, which is the CEILING derived from max_tokens — PRICING.md §1.5 has said since
// 17 Aug that the real average needs one API key and five minutes, and the key has been live here
// since 7 Sep. Nothing read it, because units are counted per CALL (unitsFor), so /v1/spend could
// only ever report the worst case no matter how many sales went through it. These record what
// Anthropic says it actually charged, so the number the pricing rests on can stop being a guess.
const THB_PER_USD = 33;
const USD_IN_PER_MTOK = 1;  // claude-haiku-4-5, matches PRICING.md §1
const USD_OUT_PER_MTOK = 5;

// One KV entry rather than three counters: this runs on every paid read and KV writes are the
// tightest budget in this file. Failures are swallowed on purpose — a bookkeeping write must never
// cost a customer the read they already paid for, and what it feeds is a planning figure, not an
// entitlement. Cache token fields are added in because they are billed too (at different rates, but
// prompt caching cannot engage here at all — §1.3: the fixed prefix is under Haiku's 4,096 minimum).
async function recordTokens(env, text) {
  try {
    const u = JSON.parse(text)?.usage;
    if (!u) return;
    const inTok = (Number(u.input_tokens) || 0)
      + (Number(u.cache_read_input_tokens) || 0)
      + (Number(u.cache_creation_input_tokens) || 0);
    const outTok = Number(u.output_tokens) || 0;
    if (!inTok && !outTok) return;
    const cur = JSON.parse((await env.GLOSS_KV.get('tok:total')) || '{}');
    await env.GLOSS_KV.put('tok:total', JSON.stringify({
      n: (Number(cur.n) || 0) + 1,
      in: (Number(cur.in) || 0) + inTok,
      out: (Number(cur.out) || 0) + outTok,
    }));
  } catch { /* bookkeeping only — never fail a paid read over it */ }
}

const LS_API = 'https://api.lemonsqueezy.com/v1/licenses';
const LICENCE_CACHE_TTL = 3600;
// Wrong keys allowed from one address per hour. Twenty is far past a person mistyping the key from
// their purchase email twice and far below anything that makes guessing worth starting.
const BAD_KEY_TRIES = 20;   // seconds — don't call Lemon Squeezy on every single translation

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Quota periods. There is exactly one: 'life'. A licence used to get a monthly allowance that reset
// forever, which is a subscription wearing a one-time price tag — the buyer still meets a wall every
// month and re-asks "is this worth it versus Google?" every month. PRICING-AI.md §11 settles it: one
// payment buys a fixed bundle of reads that never expires and never refills. The free trial was
// always a lifetime count, for the same reason a trial that refills is not a trial.

// An image costs roughly twice a text read (a screenshot is ~1500 input tokens against ~300 for a
// line of dialogue), so it draws two units. Inferred from the body rather than declared by the
// client, because anything the client declares it can also lie about.
function unitsFor(body) {
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  for (const m of msgs) {
    const content = m?.content;
    if (Array.isArray(content) && content.some((b) => b?.type === 'image')) return 2;
  }
  return 1;
}

// Strip everything we are not willing to pay for. Anything not named here is dropped rather than
// passed through, so a future Anthropic parameter can't be used against us before we've looked at it.
// Every message's text, added up. The quota counts a call as one unit no matter how much text came
// with it, and max_tokens only caps the ANSWER — so without this, one unit could buy an arbitrarily
// large question. The app cannot send anything near this (main.js refuses a card over 3,000
// characters), which is the point: a request past it did not come from the app, and the honest reply
// to a modified client is a refusal, not a quietly truncated prompt that bills for a worse answer.
const MAX_PROMPT_CHARS = 12000;
function promptChars(body) {
  let n = (typeof body?.system === 'string' ? body.system.length : 0);
  for (const m of (Array.isArray(body?.messages) ? body.messages : [])) {
    const c = m?.content;
    if (typeof c === 'string') n += c.length;
    else if (Array.isArray(c)) for (const b of c) if (typeof b?.text === 'string') n += b.text.length;
  }
  return n;
}

function clampBody(body) {
  const out = {
    model: ALLOWED_MODEL,
    max_tokens: Math.min(Number(body?.max_tokens) || 512, MAX_TOKENS_CAP),
    messages: body?.messages,
  };
  if (typeof body?.system === 'string') out.system = body.system;
  if (body?.output_config) out.output_config = body.output_config;
  return out;
}

// ---------- keys we issue ourselves ----------
// The first sales are collected by hand over PromptPay, because that is how Thai buyers actually
// pay: transfer/QR is 44% of online payments against 10% by card (PRICING-AI.md §15). Lemon Squeezy
// mints nothing in that flow, and its validate endpoint answers "invalid" for a key it never saw —
// so a buyer who transferred THB 390 and was emailed a key would be told the key is bad. That was
// the only thing standing between a paid app and a sold one, so keys we mint are verified here too.
//
// GLOSS-<id>-<sig>: id is random, sig is the first 40 bits of HMAC-SHA256(secret, id). Verifying is
// one HMAC, so nothing has to be written at sale time — `node scripts/mint-key.mjs` prints a key
// offline and this Worker recognises it without ever having been told it exists.
//
// No device cap, deliberately. The entitlement is a fixed bundle of reads that never refills, so a
// key passed around costs exactly what one buyer costs; a cap would only lock out the buyer who
// reinstalls. A refund is one KV write instead — see scripts/mint-key.mjs --revoke.
export const KEY_RE = /^GLOSS-([0-9A-HJKMNP-TV-Z]{8})-([0-9A-HJKMNP-TV-Z]{8})$/;

// Crockford base32: no I, L, O or U, because this key gets read off one screen and typed into
// another and those four are the characters people get wrong.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function b32(bytes, chars) {
  let bits = 0, acc = 0, out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(acc >> (bits - 5)) & 31]; bits -= 5; }
    if (out.length >= chars) break;
  }
  return out.slice(0, chars);
}

export async function signKeyId(secret, id) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(id)));
  return b32(mac, 8);
}

export async function mintKey(secret) {
  const raw = new Uint8Array(5);
  crypto.getRandomValues(raw);
  const id = b32(raw, 8);
  return `GLOSS-${id}-${await signKeyId(secret, id)}`;
}

// Returns null for a key that is not ours, so the caller falls through to Lemon Squeezy — which is
// what a key bought through a future checkout will be.
async function checkSelfKey(env, key) {
  // Normalised first. A key is read out of an email and pasted, sometimes in lower case or with a
  // space on the end; KEY_RE is upper-case only, so without this a real buyer gets told their key
  // is not accepted for a difference they cannot see.
  const m = KEY_RE.exec(String(key || '').trim().toUpperCase());
  if (!m) return null;
  // Say this out loud rather than letting the key fall through to Lemon Squeezy and come back
  // "invalid": the buyer would be told their key is bad when the truth is that the Worker is
  // missing a secret. Set it with: npx wrangler secret put GLOSS_KEY_SECRET
  if (!env.GLOSS_KEY_SECRET) return { ok: false, reason: 'unconfigured' };
  const [, id, sig] = m;
  if ((await signKeyId(env.GLOSS_KEY_SECRET, id)) !== sig) return { ok: false, reason: 'invalid' };
  if (await env.GLOSS_KV.get(`rev:${id}`)) return { ok: false, reason: 'refunded' };
  return { ok: true, sub: `g:${id}` };
}

// ---------- licence validation ----------
// Lemon Squeezy is the merchant of record, so it owns checkout, cards, VAT, refunds and licence
// issuing. We only ever ask it one question: is this key still good, and how many machines is it on.
//
// activate-then-validate: the first time a key is seen it is activated against an instance name, so
// the activation limit set on the product enforces how many machines one purchase covers. After
// that we only validate. Both endpoints are unauthenticated by design — the key is the credential.
async function checkLicence(env, key, instanceName) {
  const cacheKey = `lic:${key}`;
  const cached = await env.GLOSS_KV.get(cacheKey, 'json');
  if (cached) return cached;

  // Ours are checked before Lemon Squeezy is asked, and the answer is deliberately NOT cached: the
  // check is a single HMAC, and caching it would keep a refunded key working for another hour.
  const self = await checkSelfKey(env, key);
  if (self) return self;

  const post = async (path, params) => {
    const res = await fetch(`${LS_API}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
    });
    return res.json().catch(() => ({}));
  };

  let data = await post('validate', { license_key: key });

  // "not activated yet" is the normal state of a key straight out of the purchase email, not an
  // error — activate it and carry on.
  if (!data?.valid && !data?.license_key) {
    data = await post('activate', { license_key: key, instance_name: instanceName || 'gloss' });
  } else if (data?.valid && data?.license_key?.activation_usage === 0) {
    await post('activate', { license_key: key, instance_name: instanceName || 'gloss' });
  }

  const lk = data?.license_key;
  const ok = Boolean(data?.valid || data?.activated) && lk?.status === 'active';
  // Store the licence's own id, not the key, as the quota subject: it survives the key being
  // reissued and keeps the raw key out of every other KV entry.
  const result = ok ? { ok: true, sub: String(lk.id) } : { ok: false, reason: lk?.status || 'invalid' };

  // Cache failures too, briefly — a mistyped key retried in a loop shouldn't hammer Lemon Squeezy.
  await env.GLOSS_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: ok ? LICENCE_CACHE_TTL : 300 });
  return result;
}

// ---------- quota ----------
// KV is eventually consistent, so two requests racing can each read the same count and a user may
// slip a few units past the limit. That is accepted: the alternative (a Durable Object per licence)
// is a lot more moving parts to prevent an overrun worth a fraction of a baht.
async function spendQuota(env, subject, limit, units, period) {
  const key = `q:${subject}:${period}`;
  const used = Number(await env.GLOSS_KV.get(key)) || 0;
  if (used + units > limit) return { ok: false, used, limit };
  // No TTL: the count IS the entitlement now. A 70-day expiry would have quietly refilled both the
  // paid bundle and the free trial for anyone who stopped using Gloss for a couple of months.
  await env.GLOSS_KV.put(key, String(used + units));
  return { ok: true, used: used + units, limit };
}

async function readQuota(env, subject, period) {
  return Number(await env.GLOSS_KV.get(`q:${subject}:${period}`)) || 0;
}

// ---------- daily ceiling (free trial only) ----------
// Per-user quota bounds ONE caller. Nothing bounded the sum, and a free launch invites exactly the
// shape that exploits that: many fresh device ids, each legitimately entitled to its own trial, all
// billing the same Anthropic account. This is a ceiling on the FREE side of it, counted in the same
// units as everything else (1 unit ~ THB 0.054) and reset daily. Past the line every caller gets 402
// and the app falls back to Google translate, which costs nothing — the product degrades, it does
// not stop. Fails OPEN on a KV error, the same way the IP caps do: one mechanism for one situation.
// 600, not 3000. The first number came from PRICING-AI.md's THB 0.054/unit, which is a TYPICAL read.
// PRICING.md §1 (17 Aug) measured the enforced ceiling from max_tokens in the source instead — a card
// can cost up to THB 0.169 on output alone, and its 2,251-character CARD_SCHEMA is re-sent every call
// and is too short for Haiku's 4,096-token cache minimum, so it never caches. Sized on the ceiling:
// 600 units is about THB 120 on the worst possible day and THB 32 on a normal one. Raise it with
// DAILY_UNIT_CAP the day a launch actually needs more — one env var, no deploy of this file.
const DAILY_UNIT_CEILING = 600;

// ---------- lifetime spend ceiling ----------
// The daily cap above bounds a BAD DAY. It does not bound the bill: 600 units a day is about THB 120,
// which is THB 3,600 a month, forever, with nothing in the code that ever says stop. jek's limit is a
// total, not a rate — "never more than THB 2,000 down in the worst case" — so the total needs its own
// counter, and it must be one nobody can reset by waiting.
//
// Counted in the same units as everything else and never expired, so it only moves one way. When it
// is reached every caller gets 402 and the app falls back to Google translate: the product degrades,
// it does not stop, exactly as it does at the daily line. Raising it is a deliberate act — set
// SPEND_CAP_UNITS higher — which is the point. A ceiling that lifts itself is not a ceiling.
//
// 10,000 units = THB 2,000 at the MEASURED worst case of THB 0.20/unit (PRICING.md §1). On a normal
// day a unit costs well under that, so the real spend at this line is lower; the cap is sized so the
// number jek was promised is the number he cannot exceed, not the number he expects to pay.
const SPEND_CEILING_UNITS = 10000;

// What the ceiling above was sized for was a launch with no revenue: a bill with nothing on the
// other side of it. A sold read has something on the other side of it. 10,000 units is TEN buyers
// worth of entitlement, so at the eleventh sale the ceiling starts refusing reads that were paid
// for — the buyer is silently dropped to Google translate having bought 1,000 AI reads. That is a
// broken promise, not a saved baht.
//
// So the ceiling rises, but only when money arrives: scripts/mint-key.mjs adds this sale's reads to
// spend:cap as it mints or tops up a key. THB 2,000 stays the most that can ever be lost with no
// revenue behind it; past that every unit the ceiling allows was bought. It still does not lift
// itself — a sale lifts it.
async function spendGlobal(env, units, pro) {
  const cap = Number(env.DAILY_UNIT_CAP) || DAILY_UNIT_CEILING;
  const key = `gday:${dayKey()}`;
  try {
    const [used, spent, sold] = await Promise.all([
      env.GLOSS_KV.get(key).then((v) => Number(v) || 0),
      env.GLOSS_KV.get('spend:total').then((v) => Number(v) || 0),
      env.GLOSS_KV.get('spend:cap').then((v) => Number(v) || 0),
    ]);
    const lifeCap = (Number(env.SPEND_CAP_UNITS) || SPEND_CEILING_UNITS) + sold;
    if (spent + units > lifeCap) return false;
    // The daily line is for the FREE trial only. It exists to bound one bad day of fresh device ids,
    // which is a thing only an unpaid caller can be. A licence has already bought its reads and is
    // bounded by them; making it also wait on a shared daily number means other people's usage
    // decides whether a buyer's ten-hour session keeps translating — for reads that are already
    // paid for. (Scaling the daily cap with sales was tried here first and was the wrong shape: it
    // still rationed a bundle the buyer owns outright.)
    if (!pro && used + units > cap) return false;
    // No TTL on the total, and written after both checks pass so a refused call is not charged.
    // The daily counter belongs to the tier the daily cap applies to. Counting paid reads into it
    // did not cap the buyer — the check above skips them — it filled the number that stops the FREE
    // trial, so one heavy licensed user could close the door on strangers who share nothing with
    // them. spend:total still counts every read: that one is the bill.
    await Promise.all([
      pro ? Promise.resolve()
          : env.GLOSS_KV.put(key, String(used + units), { expirationTtl: 60 * 60 * 48 }),
      env.GLOSS_KV.put('spend:total', String(spent + units)),
    ]);
    return true;
  } catch {
    return true;
  }
}

// ---------- abuse limits (the free trial's only real defence) ----------
// The trial identifies itself with a header the CLIENT chooses. That is not a weakness that can be
// fixed on the client: whatever the app sends, a five-line curl loop can send too, with a fresh
// random id every time — no app, no crack, no reverse engineering, just a loop that bills our
// Anthropic account 100 reads at a time, forever.
//
// So the trial is not defended by trusting the id. It is defended by the one thing the caller does
// NOT choose: the IP Cloudflare saw the request arrive on (cf-connecting-ip is set by the edge and
// cannot be spoofed by the client, unlike x-forwarded-for). Two caps, both cheap:
//
//   NEW DEVICES PER IP PER DAY — the loop's actual cost centre. One person trying the app on their
//   laptop and desktop is 2; a script minting ids is hundreds within a minute.
//   REQUESTS PER IP PER MINUTE — a burst brake, so even a single valid id can't be driven flat out.
//
// Both are deliberately generous: a shared student house or an office NAT is a legitimate reason for
// several devices on one IP, and a false positive here costs a sale. Licensed users skip the
// device cap entirely — they paid, and their spend is already bounded by their own quota.
const FREE_DEVICES_PER_IP_PER_DAY = 5;
const REQS_PER_IP_PER_MIN = 60;

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// Returns false when the caller has tripped a cap. Fails OPEN on a KV error: a monitoring gap must
// not take the product down for people who paid.
async function underIpCaps(env, ip, device) {
  if (!ip) return true;
  try {
    const minute = Math.floor(Date.now() / 60000);
    const burstKey = `ip:${ip}:${minute}`;
    const burst = Number(await env.GLOSS_KV.get(burstKey)) || 0;
    if (burst >= REQS_PER_IP_PER_MIN) return false;
    await env.GLOSS_KV.put(burstKey, String(burst + 1), { expirationTtl: 120 });

    if (!device) return true;
    // A set of the day's device ids for this IP, stored as one value — a handful of uuids is far
    // cheaper than a KV entry each, and the cap keeps it small by construction.
    const seenKey = `ipdev:${ip}:${dayKey()}`;
    const seen = (await env.GLOSS_KV.get(seenKey)) || '';
    const ids = seen ? seen.split(',') : [];
    if (ids.includes(device)) return true;           // already counted today
    if (ids.length >= FREE_DEVICES_PER_IP_PER_DAY) return false;
    ids.push(device);
    await env.GLOSS_KV.put(seenKey, ids.join(','), { expirationTtl: 60 * 60 * 26 });
    return true;
  } catch {
    return true;
  }
}

// Resolve who is asking and what they are entitled to. A licence key wins; otherwise the caller is
// on the free trial, identified by a device id the app generates once and keeps.
async function identify(env, req) {
  const licence = req.headers.get('x-gloss-licence') || '';
  const device = (req.headers.get('x-gloss-device') || '').slice(0, 64);

  if (licence) {
    // Guessing a key was the one path through this Worker that cost the guesser nothing: the check
    // happens before underIpCaps, so a wrong key was refused and forgotten. 40 bits is not guessable
    // at HTTP speed, but "not worth guessing" and "not counted at all" are different things, and the
    // second one is what an hour of free attempts looks like in the logs.
    //
    // Only a genuinely wrong key counts. A refunded key is a known person, and unconfigured is our
    // own missing secret — locking someone out for either would punish them for our side of it.
    const badIp = `badkey:${req.headers.get("cf-connecting-ip") || "?"}`;
    const bad = Number(await env.GLOSS_KV.get(badIp)) || 0;
    if (bad >= BAD_KEY_TRIES) return { error: 'busy' };
    const check = await checkLicence(env, licence, device);
    if (!check.ok) {
      if (check.reason === 'invalid') {
        await env.GLOSS_KV.put(badIp, String(bad + 1), { expirationTtl: 3600 });
      }
      return { error: 'licence', reason: check.reason };
    }
    // Topping up rides on the SAME key. Buying again would otherwise mint a second key, which the
    // buyer has to swap into Settings by hand while whatever was left on the first one is thrown
    // away — a top-up that feels like a reset. One KV entry per licence avoids all of that:
    //   node scripts/mint-key.mjs --topup <key> 1000
    // The price per read stays identical to the first purchase on purpose. A cheaper top-up tier
    // undercuts the product it tops up and nobody buys the product — PRICING-AI.md §15 measured
    // exactly that with THB 199/500 against THB 590/1,400.
    const extra = Number(await env.GLOSS_KV.get(`top:${check.sub}`)) || 0;
    // Burst brake only — no device cap. They paid, and their spend is bounded by their own quota.
    if (!(await underIpCaps(env, req.headers.get('cf-connecting-ip'), null))) {
      return { error: 'busy' };
    }
    return {
      plan: 'pro',
      subject: check.sub,
      limit: (Number(env.PRO_CREDITS) || 1000) + extra,
      period: 'life', // bought outright, so it never rolls over — see the note above
    };
  }

  if (!device) return { error: 'noid' };
  if (!(await underIpCaps(env, req.headers.get('cf-connecting-ip'), device))) {
    return { error: 'busy' };
  }
  return {
    plan: 'free',
    subject: `free:${device}`,
    limit: Number(env.FREE_LIMIT) || 10,
    period: 'life', // the trial never rolls over
  };
}

// 401 the caller can fix by buying or fixing a key; 429 they can fix by waiting; 400 is a broken
// request. Keeping the mapping in one place stops the two call sites drifting apart.
function errStatus(err) {
  if (err === 'licence') return 401;
  if (err === 'busy') return 429;
  return 400;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // /health used to answer ok:true whether or not this Worker could actually reach Claude, so a
    // missing engine key looked identical to a working service from outside and only showed up as
    // "ai-unavailable" in someone's app. It reports whether the key is PRESENT, never any part of
    // it: a length test is enough to tell "never set" and "set to an empty string" apart from real.
    if (url.pathname === '/health') {
      const k = env.ANTHROPIC_API_KEY || '';
      return json({ ok: true, engine: k.length > 20 ? 'configured' : 'missing', licences: (env.GLOSS_KEY_SECRET || '').length > 20 ? 'configured' : 'missing' });
    }

    // Lets the app show "160 of 1,000 reads left" without spending a unit to find out.
    // What has been spent in total, in units and in baht at the worst-case rate. Open, because the
    // number it exposes is the owner's own bill and knowing it costs nothing — and a ceiling nobody
    // can read is one nobody trusts.
    if (url.pathname === '/v1/spend') {
      const spent = Number(await env.GLOSS_KV.get('spend:total')) || 0;
      const sold = Number(await env.GLOSS_KV.get('spend:cap')) || 0;
      // Same ceiling spendGlobal enforces, sales included — a reported cap that differs from the
      // enforced one is worse than no report.
      const cap = (Number(env.SPEND_CAP_UNITS) || SPEND_CEILING_UNITS) + sold;
      // The ceiling above is what CAN be spent; `measured` is what HAS been. They are reported side
      // by side rather than one replacing the other: the cap must keep enforcing the worst case
      // (a single long read really can cost THB 0.20), while every pricing decision should be made
      // against the measured line. Null until a read has gone through with this deploy on.
      const tok = JSON.parse((await env.GLOSS_KV.get('tok:total')) || '{}');
      const n = Number(tok.n) || 0;
      const inTok = Number(tok.in) || 0;
      const outTok = Number(tok.out) || 0;
      const thbReal = (inTok * USD_IN_PER_MTOK + outTok * USD_OUT_PER_MTOK) / 1e6 * THB_PER_USD;
      return json({
        units: spent, cap,
        thbWorstCase: Math.round(spent * 0.20 * 100) / 100,
        capThbWorstCase: Math.round(cap * 0.20 * 100) / 100,
        remaining: Math.max(0, cap - spent),
        stopped: spent >= cap,
        measured: n ? {
          reads: n,
          avgInTokens: Math.round(inTok / n),
          avgOutTokens: Math.round(outTok / n),
          thbPerRead: Math.round((thbReal / n) * 10000) / 10000,
          thbTotal: Math.round(thbReal * 100) / 100,
        } : null,
      });
    }

    if (url.pathname === '/v1/quota') {
      const who = await identify(env, req);
      if (who.error) return json({ error: who.error, reason: who.reason }, errStatus(who.error));
      const used = await readQuota(env, who.subject, who.period);
      return json({ plan: who.plan, used, limit: who.limit, remaining: Math.max(0, who.limit - used) });
    }

    if (url.pathname !== '/v1/messages') return json({ error: 'not_found' }, 404);
    if (req.method !== 'POST') return json({ error: 'method' }, 405);

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);

    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
    if (!Array.isArray(body?.messages) || !body.messages.length) return json({ error: 'bad_request' }, 400);
    // Before identify(), so an oversized prompt costs neither a licence lookup nor a read.
    if (promptChars(body) > MAX_PROMPT_CHARS) return json({ error: 'too_long' }, 413);

    const who = await identify(env, req);
    if (who.error) return json({ error: who.error, reason: who.reason }, errStatus(who.error));

    const units = unitsFor(body);

    // Checked BEFORE the per-user quota: if the service is over its ceiling the call is not going to
    // happen, and deducting someone's allowance for a read they never got is the one outcome worse
    // than pausing. The reverse order can overshoot the ceiling by a few units instead, which is the
    // same rounding the per-user quota already accepts.
    if (!(await spendGlobal(env, units, who.plan === 'pro'))) {
      return json({ error: 'paused' }, 402);
    }

    const spend = await spendQuota(env, who.subject, who.limit, units, who.period);
    if (!spend.ok) {
      // 402 is the one status the app treats as "tell the user something they can act on" rather
      // than as a transient failure to retry or swallow.
      return json({ error: 'quota', plan: who.plan, used: spend.used, limit: spend.limit }, 402);
    }

    let upstream;
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(clampBody(body)),
      });
    } catch (err) {
      return json({ error: 'upstream', detail: String(err) }, 502);
    }

    const text = await upstream.text();
    // Anthropic said no through no fault of the user (rate limit, outage, our card declined). Give
    // the units back rather than charging someone for a request that produced nothing.
    if (!upstream.ok) {
      const back = Math.max(0, (await readQuota(env, who.subject, who.period)) - units);
      await env.GLOSS_KV.put(`q:${who.subject}:${who.period}`, String(back));
      return new Response(text, { status: upstream.status, headers: { 'content-type': 'application/json' } });
    }

    // After the response is on its way, not before it: the customer waits on Anthropic, never on our
    // bookkeeping.
    ctx.waitUntil(recordTokens(env, text));

    return new Response(text, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Let the app keep a live count without a second round trip.
        'x-gloss-used': String(spend.used),
        'x-gloss-limit': String(spend.limit),
        'x-gloss-plan': who.plan,
      },
    });
  },
};
