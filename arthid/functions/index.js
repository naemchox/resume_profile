// Arthid × Discord — HTTP interactions endpoint.
//
// This is an interactions-only bot: Discord POSTs here, we verify the
// signature and reply. There is no gateway socket, so nothing has to stay
// running and this costs nothing when idle.
//
// Flow for every command:
//   1. verify Ed25519 signature against the RAW body
//   2. answer PING with PONG (Discord does this when you save the URL)
//   3. do the Firestore work
//   4. reply with the result, inside Discord's 3-second window
//
// It is tempting to ack first with a deferred reply and finish the work
// afterwards, which buys 15 minutes instead of 3 seconds. DO NOT: 2nd-gen
// functions run on Cloud Run, which allocates CPU *only during request
// processing*. The moment you send the response the instance is throttled,
// so the continuation never runs — the user sees "thinking" forever, and
// nothing is logged because the code never executed.
//
// Deferring is only safe here with CPU always allocated
// (`gcloud run services update discord --no-cpu-throttling`), which bills
// for idle time and can be silently reset by a redeploy. These handlers are
// a few Firestore reads, so replying inline is both simpler and cheaper.
// D.defer()/D.followUp() are kept for the day a genuinely slow command
// arrives — read that caveat before using them.

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');

const D = require('./discord');
const C = require('./commands');

admin.initializeApp();

// The public key is not a secret — it's published in the Discord portal for
// exactly this purpose.
//
// The bot token is deliberately NOT bound here. Replying to an interaction is
// authenticated by the interaction token in the request itself, so the
// function never needs the bot's credentials; only register.js does, and that
// runs locally. Binding it anyway would hand a long-lived token to a
// public-facing endpoint for no reason. DISCORD_APP_ID is likewise only used
// by register.js, so it stays in .env without being declared here.
const DISCORD_PUBLIC_KEY = defineString('DISCORD_PUBLIC_KEY');

const HANDLERS = {
  link: C.handleLink,
  bind: C.handleBind,
  todo: C.handleTodo,
  project: C.handleProject,
  poll: C.handlePoll,
  schedule: C.handleSchedule,
};

// /link carries a Primary Key and /bind lists your chats — neither belongs in
// a public channel, so both reply only to the person who ran them.
const EPHEMERAL_COMMANDS = new Set(['link', 'bind']);

exports.discord = onRequest(
  {
    // Co-located with Firestore (us-east1), NOT with the user. The request
    // path is Discord -> this function -> Firestore; the human is never in it.
    // Running in asia-southeast1 "near Thailand" put every Firestore read
    // across the Pacific at ~250ms a round trip, which is what pushed commands
    // past Discord's 3s limit. A database's location is fixed at creation, so
    // the function moves to it.
    region: 'us-east1',
    cors: false,
    // Measured: a cold start costs 3.9s end-to-end (container boot +
    // firebase-admin + the first Firestore gRPC connection). Discord's limit
    // is a hard 3s with no retry, so a cold instance is a guaranteed "The
    // application did not respond".
    //
    // Kept at 0 on purpose. minInstances: 1 would guarantee warmth but bills
    // for idle CPU around the clock; instead the `keepWarm` schedule below
    // pings this endpoint often enough that Cloud Run never scales to zero,
    // and we pay only for those few-millisecond pings.
    minInstances: 0,
    maxInstances: 10,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');
    const publicKey = DISCORD_PUBLIC_KEY.value();

    // req.rawBody is the untouched bytes. req.body has already been parsed and
    // would not re-serialise byte-identically, which breaks the signature.
    if (!D.verifyRequest(req.rawBody, signature, timestamp, publicKey)) {
      res.status(401).send('invalid request signature');
      return;
    }

    const interaction = req.body;

    if (interaction.type === D.PING) {
      res.json({ type: D.PONG });
      return;
    }

    // Button presses on a planner message. The message is public, so anyone in
    // the channel can click — handleComponent re-runs the same membership
    // check the slash commands do rather than treating a button as authority.
    if (interaction.type === D.MESSAGE_COMPONENT) {
      let out;
      try {
        out = await C.handleComponent(interaction, interaction.data.custom_id);
      } catch (err) {
        console.error('[discord] component failed', err);
        out = { mode: 'ephemeral', payload: { content: '⚠️ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' } };
      }
      if (out.mode === 'modal') {
        // An edit picker answers with the form itself. A modal has to be the
        // first response to the interaction — it cannot follow a defer or an
        // update — which is why handleComponent does its Firestore reads
        // before returning rather than after.
        res.json({ type: D.MODAL, data: out.payload });
      } else if (out.mode === 'update') {
        // Rewrite the existing message so a shared checklist stays one message
        // instead of spawning a new copy per click.
        res.json({ type: D.UPDATE_MESSAGE, data: out.payload });
      } else {
        out.payload.flags = D.EPHEMERAL;
        res.json({ type: D.CHANNEL_MESSAGE, data: out.payload });
      }
      return;
    }

    // A submitted edit form.
    if (interaction.type === D.MODAL_SUBMIT) {
      let out;
      try {
        out = await C.handleModal(interaction);
      } catch (err) {
        console.error('[discord] modal failed', err);
        out = { mode: 'ephemeral', payload: { content: '⚠️ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' } };
      }
      // `interaction.message` is present only when the modal was opened from a
      // component — that message is the picker, so the result replaces it.
      // A modal opened straight from a slash command has no message to update,
      // and answering with UPDATE_MESSAGE there is a 400.
      if (out.mode === 'update' && interaction.message) {
        res.json({ type: D.UPDATE_MESSAGE, data: out.payload });
      } else {
        // 'reply' is a form that created something the whole channel should
        // see — the add form. Everything else that lands here is either an
        // error or an edit whose picker message is gone, and stays private.
        if (!['update', 'reply'].includes(out.mode)) out.payload.flags = D.EPHEMERAL;
        res.json({ type: D.CHANNEL_MESSAGE, data: out.payload });
      }
      return;
    }

    // A date box being typed in. Pure computation — no Firestore — because
    // this fires on every keystroke and shares the same 3-second budget.
    if (interaction.type === D.AUTOCOMPLETE) {
      let choices = [];
      try {
        choices = C.handleAutocomplete(interaction);
      } catch (err) {
        console.error('[discord] autocomplete failed', err);
      }
      res.json(D.autocomplete(choices));
      return;
    }

    if (interaction.type !== D.APPLICATION_COMMAND) {
      res.json(D.reply('ยังไม่รองรับ interaction ชนิดนี้', { ephemeral: true }));
      return;
    }

    const name = interaction.data.name;
    const handler = HANDLERS[name];
    if (!handler) {
      res.json(D.reply(`ไม่รู้จักคำสั่ง \`/${name}\``, { ephemeral: true }));
      return;
    }

    const ephemeral = EPHEMERAL_COMMANDS.has(name);
    const parsed = D.readOptions(interaction.data);

    // Work first, respond once — see the CPU-throttling note at the top.
    let payload;
    try {
      payload = await handler(interaction, parsed);
    } catch (err) {
      console.error(`[discord] /${name} failed`, err);
      payload = { content: '⚠️ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง (Something went wrong — try again.)' };
    }

    // `/todo edit`, `/project edit` and `/schedule edit` open a form instead
    // of posting a message when the target is unambiguous.
    if (payload.modal) {
      res.json({ type: D.MODAL, data: payload.modal });
      return;
    }

    if (ephemeral) payload.flags = D.EPHEMERAL;
    res.json({ type: D.CHANNEL_MESSAGE, data: payload });
  },
);

/**
 * Keep the interactions endpoint warm.
 *
 * Discord allows 3 seconds and does not retry; a cold start measured 3.9s, so
 * the first command after an idle spell would always fail. Cloud Run keeps an
 * instance alive for a while after each request, so a ping every few minutes
 * means there is never a cold one to hit.
 *
 * Cheaper than minInstances: 1 — that bills for idle CPU 24/7, whereas this
 * bills only the few milliseconds each ping actually runs, and Cloud
 * Scheduler's first three jobs are free.
 *
 * It is a strong mitigation, not a guarantee: Cloud Run can still reclaim an
 * instance. If "did not respond" ever reappears, switch to minInstances: 1.
 */
exports.keepWarm = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-east1',
    timeZone: 'Asia/Bangkok',
    retryCount: 0,          // a missed ping is harmless; the next one is 5 min away
  },
  async () => {
    const url = 'https://us-east1-arthid-0417.cloudfunctions.net/discord';
    try {
      // GET is answered with 405 by the handler above — which is the point:
      // a 405 proves the container is up and executing our code. Anything
      // else means the endpoint is unhealthy and worth a log line.
      const res = await fetch(url, { method: 'GET' });
      if (res.status !== 405) {
        console.warn('[keepWarm] unexpected status from endpoint:', res.status);
      }
    } catch (err) {
      console.error('[keepWarm] ping failed', err);
    }
  },
);
