// POST /report — the only way anything comes back from a Gloss install.
//
// WHY THIS EXISTS. Until this endpoint the app had no outbound channel at all: no feedback button,
// no mailto, no contact page anywhere in the app or on the site (checked 2026-08-27). Every bug a
// tester hit had to survive being remembered, retyped into a comment thread days later, and matched
// to a version by someone who no longer had the app open. Most of them did not survive that.
//
// Deliberately the same boring shape as notify.js — one KV write, no queue, no third party, nothing
// to renew — and the SAME binding, because a second namespace is a second id to paste into
// wrangler.toml and the id in this repo has been a placeholder before. Reports are told apart from
// signups by the `report:` key prefix, not by where they live.
//
// NOT collected on purpose: no screenshot (that is the tester's screen, and a checkbox on a window
// that sits over a game is not consent anyone reads), no email, no device id. If someone wants an
// answer they can put a contact in the note themselves — the placeholder says so.
const MAX_NOTE = 2000;
const MAX_FIELD = 300;

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

export async function onRequestPost({ request, env }) {
  const json = (status, body) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });

  // The app sends JSON; the form on the site is a plain <form> that still submits without scripting.
  // Reading both is four lines — and the alternative is the exact failure notify.js was written to
  // end: a submit that looks like it worked and reached nothing.
  let body;
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = { kind: 'general', note: form.get('note') };
    }
  } catch {
    return json(400, { ok: false, error: 'could not read the report' });
  }

  const note = clip(body?.note, MAX_NOTE).trim();
  const kind = body?.kind === 'ocr' ? 'ocr' : 'general';
  // An OCR report carries the misread line instead of a note — that text IS the bug, and asking a
  // tester to describe it in words loses the exact characters that went wrong.
  const text = clip(body?.text, MAX_FIELD);
  if (!note && !text) return json(400, { ok: false, error: 'nothing to report' });

  if (!env.GLOSS_LEADS) {
    return json(500, { ok: false, error: 'storage is not configured' });
  }

  // Keyed by time so nothing overwrites anything — unlike a signup, two reports from one person on
  // one day are two different bugs, and the second must not replace the first.
  const at = new Date().toISOString();
  const key = `report:${at}:${Math.random().toString(36).slice(2, 8)}`;
  await env.GLOSS_LEADS.put(key, JSON.stringify({
    kind,
    note,
    text,
    app: clip(body?.app, 40),          // which app was in front — the game, when there is one
    version: clip(body?.version, 20),
    os: clip(body?.os, 60),
    langs: clip(body?.langs, 20),
    engine: clip(body?.engine, 40),    // which OCR read it: Vision / Windows.Media.Ocr / tesseract
    at,
    ua: clip(request.headers.get('user-agent'), 200),
  }));

  return json(200, { ok: true });
}

// Read what came in with:
//   npx wrangler kv key list --namespace-id <GLOSS_LEADS id> --prefix report: --remote
// The --remote is not optional: without it wrangler reads a LOCAL store and prints [], which looks
// exactly like "nobody reported anything" rather than "you asked the wrong copy" (see wrangler.toml).
export function onRequestGet() {
  return new Response('This endpoint takes bug reports from the Gloss app (POST).', {
    status: 405, headers: { 'content-type': 'text/plain' },
  });
}
