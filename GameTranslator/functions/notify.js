// POST /notify — the mailing-list signup on the website.
//
// WHY THIS EXISTS. The form was written for Netlify Forms (`data-netlify="true"`), which is a build-
// time hook, not markup: the host has to recognise the attribute and stand up an endpoint for it.
// The site moved to Cloudflare Pages and nothing recognised anything, so the form POSTed to the page
// itself and got 405 — measured, 2026-08-09. No error reached the visitor either, because a plain
// form POST that fails just leaves them on a page that looks unchanged. Every address typed into it
// since the move was discarded silently, under a paragraph promising "you'll hear when that happens".
//
// Deliberately boring: one KV write, no queue, no third party, nothing to renew. This list will be
// tens of addresses, not thousands, and the failure mode of anything cleverer is the same failure we
// are fixing — a signup that looks like it worked and didn't.
export async function onRequestPost({ request, env }) {
  const json = (status, body) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });

  let email = '';
  let honey = '';
  let note = '';   // what the payer said about their transfer — the only thing tying it to them
  try {
    const form = await request.formData();
    email = String(form.get('email') || '').trim();
    honey = String(form.get('company') || '').trim();
    note = String(form.get('note') || '').trim().slice(0, 120);
  } catch {
    return json(400, { ok: false, error: 'could not read the form' });
  }

  // The honeypot the markup already had: a field no human sees and a bot fills in. Answer 200 rather
  // than an error — a bot that learns it was caught comes back differently, and there is no visitor
  // on the other end of this to inform.
  if (honey) return json(200, { ok: true });

  // Same shape the input element enforces, checked again here because the element is a suggestion:
  // anything can POST to this endpoint without going near the page.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return json(400, { ok: false, error: 'that does not look like an email address' });
  }

  if (!env.GLOSS_LEADS) {
    // Binding missing = the deploy is misconfigured. Say so with a 500 instead of returning ok:true,
    // which would recreate the exact bug this endpoint exists to end.
    return json(500, { ok: false, error: 'storage is not configured' });
  }

  // Key by address so a double submit is one row rather than two, and the value carries when and
  // where from — enough to tell the launch-post spike apart from everything after it.
  await env.GLOSS_LEADS.put(`lead:${email.toLowerCase()}`, JSON.stringify({
    email,
    at: new Date().toISOString(),
    // A static PromptPay code carries no order id, so this line is how a THB 390 row on a bank
    // statement becomes a person to send a key to. Stored even when empty, so its absence is
    // visible rather than looking like an older row from before the field existed.
    note,
    ref: request.headers.get('referer') || '',
    ua: (request.headers.get('user-agent') || '').slice(0, 200),
  }));

  return json(200, { ok: true });
}

// A GET here means someone opened the URL by hand. Say what it is instead of a bare 405.
export function onRequestGet() {
  return new Response('This endpoint takes the signup form from the Gloss site (POST).', {
    status: 405, headers: { 'content-type': 'text/plain' },
  });
}
