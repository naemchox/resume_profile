// Discord protocol helpers: signature verification, response shapes, and the
// follow-up call used to fill in a deferred reply.
//
// Deliberately dependency-light — tweetnacl for Ed25519 and the built-in
// fetch. discord.js is a gateway client and would be dead weight here: an
// HTTP-interactions bot never opens a socket.

const nacl = require('tweetnacl');

// Interaction types (Discord docs: Receiving and Responding)
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const AUTOCOMPLETE = 4;
const MODAL_SUBMIT = 5;

// Response types
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;
const DEFERRED_UPDATE_MESSAGE = 6;
const UPDATE_MESSAGE = 7;
const AUTOCOMPLETE_RESULT = 8;
const MODAL = 9;

const EPHEMERAL = 64;   // message flag: only the invoking user sees it

/**
 * Verify the Ed25519 signature Discord puts on every request.
 *
 * This MUST run against the exact bytes Discord sent. Anything that
 * re-serialises the body first (JSON.parse -> JSON.stringify) will change key
 * order or whitespace and the signature will never match — which shows up as
 * Discord refusing to save your endpoint URL with no useful error.
 */
function verifyRequest(rawBody, signature, timestamp, publicKey) {
  if (!rawBody || !signature || !timestamp || !publicKey) return false;
  try {
    return nacl.sign.detached.verify(
      Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(rawBody)]),
      Buffer.from(signature, 'hex'),
      Buffer.from(publicKey, 'hex'),
    );
  } catch {
    return false;
  }
}

/** An immediate, visible reply. */
function reply(content, { ephemeral = false, embeds, components } = {}) {
  const data = {};
  if (content) data.content = content;
  if (embeds) data.embeds = embeds;
  if (components) data.components = components;
  if (ephemeral) data.flags = EPHEMERAL;
  return { type: CHANNEL_MESSAGE, data };
}

/**
 * "Thinking…" — buys 15 minutes instead of 3 seconds.
 *
 * Every command here defers, because a cold Cloud Functions instance plus a
 * Firestore round trip can exceed Discord's 3-second ack window, and a missed
 * ack is a user-visible "The application did not respond".
 */
function defer({ ephemeral = false } = {}) {
  return {
    type: DEFERRED_CHANNEL_MESSAGE,
    data: ephemeral ? { flags: EPHEMERAL } : {},
  };
}

/** Fill in a deferred reply by editing the original response. */
async function followUp(appId, interactionToken, payload) {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error('[discord] follow-up failed', res.status, await res.text());
  }
  return res.ok;
}

/** Read a slash-command option by name, with subcommand support. */
function readOptions(data) {
  // A subcommand nests its own options one level down, so flatten to
  // { sub, opts } and let handlers deal with a single shape.
  const first = (data.options || [])[0];
  if (first && (first.type === 1 || first.type === 2)) {
    const opts = {};
    (first.options || []).forEach(o => { opts[o.name] = o.value; });
    return { sub: first.name, opts };
  }
  const opts = {};
  (data.options || []).forEach(o => { opts[o.name] = o.value; });
  return { sub: null, opts };
}

/**
 * Read an autocomplete request into { sub, name, value }.
 *
 * Discord marks exactly one option `focused: true` — the box the cursor is in
 * — and sends whatever has been typed so far as its value, including ''.
 * Returns name: null when nothing is focused, which should not happen but
 * costs one line to survive.
 */
function readFocused(data) {
  const first = (data.options || [])[0];
  const sub = first && (first.type === 1 || first.type === 2) ? first.name : null;
  const list = sub ? (first.options || []) : (data.options || []);
  const focused = list.find(o => o.focused);
  return { sub, name: focused ? focused.name : null, value: focused ? String(focused.value ?? '') : '' };
}

/** Autocomplete answer: up to 25 { name, value } rows shown under the box. */
function autocomplete(choices) {
  return {
    type: AUTOCOMPLETE_RESULT,
    data: { choices: (choices || []).slice(0, 25) },
  };
}

/**
 * Read a submitted modal into { [inputCustomId]: value }.
 *
 * Discord wraps every text input in its own action row, so the values arrive
 * two levels deep. Fields left blank come back as '' rather than missing,
 * which is what makes "clear this field" expressible at all.
 */
function readModal(data) {
  const out = {};
  (data.components || []).forEach(row => {
    (row.components || []).forEach(c => { out[c.custom_id] = c.value; });
  });
  return out;
}

/** Discord's colour ints, from the Arthid accent. */
const COLOR_ACCENT = 0x06c755;
const COLOR_MUTED = 0x808981;
const COLOR_DANGER = 0xef4444;

module.exports = {
  PING, APPLICATION_COMMAND, MESSAGE_COMPONENT, AUTOCOMPLETE, MODAL_SUBMIT,
  PONG, CHANNEL_MESSAGE, DEFERRED_CHANNEL_MESSAGE, DEFERRED_UPDATE_MESSAGE, UPDATE_MESSAGE,
  AUTOCOMPLETE_RESULT, MODAL,
  EPHEMERAL,
  verifyRequest, reply, defer, followUp, readOptions, readFocused, autocomplete, readModal,
  COLOR_ACCENT, COLOR_MUTED, COLOR_DANGER,
};
