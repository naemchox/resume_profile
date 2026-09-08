// ===== Edge Function: ls-webhook =====
// Lemon Squeezy (Merchant of Record) calls this on every subscription lifecycle event.
// LS is the source of truth for the subscription; we verify the HMAC signature, then mirror
// the subscription's state into our `entitlements` table (the only place Pro is granted).
// The app reads entitlements (RLS, read-own) and treats expires_at>now as "Pro right now".
//
// Deploy:  supabase functions deploy ls-webhook --no-verify-jwt
//   (Lemon Squeezy is not a Supabase user — no JWT — so JWT verification must be OFF; we
//    authenticate the caller instead by verifying the X-Signature HMAC below.)
// Then in LS dashboard → Settings → Webhooks → add this function's URL, sign with the same
// secret you set as LEMONSQUEEZY_SIGNING_SECRET, and subscribe to the "subscription_*" events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });

  const SECRET = Deno.env.get("LEMONSQUEEZY_SIGNING_SECRET") || "";
  const SB_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SECRET || !SB_URL || !SERVICE) return new Response("not configured", { status: 500 });

  // Read the RAW body and verify the HMAC-SHA256 signature LS sends in X-Signature (hex).
  const raw = await req.text();
  const sig = (req.headers.get("X-Signature") || "").toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  // X-Signature is hex. Decode to bytes and let WebCrypto verify in CONSTANT TIME — comparing the
  // hex strings with !== short-circuits on the first differing byte and leaks the MAC to a timing
  // attack. crypto.subtle.verify is spec'd constant-time.
  const sigBytes = /^[0-9a-f]*$/.test(sig) && sig.length % 2 === 0
    ? Uint8Array.from(sig.match(/../g) ?? [], (h) => parseInt(h, 16))
    : new Uint8Array(0);
  const valid = sigBytes.length > 0 &&
    await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(raw));
  if (!valid) return new Response("bad signature", { status: 401 });

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("bad body", { status: 400 }); }

  // Only subscription LIFECYCLE events carry the subscription object (d.id = subscription id,
  // attributes.status = subscription status). The subscription_payment_* events carry an INVOICE
  // instead (d.id = invoice id, no subscription status/renews_at) — mirroring them would corrupt
  // ls_subscription_id and compute a bogus exp=now, so exclude them explicitly.
  const event = String(evt?.meta?.event_name || "");
  const SUB_EVENTS = new Set(["subscription_created", "subscription_updated", "subscription_cancelled",
    "subscription_resumed", "subscription_expired", "subscription_paused", "subscription_unpaused"]);
  if (!SUB_EVENTS.has(event)) return new Response("ignored", { status: 200 });

  const d = evt?.data || {};
  const a = d.attributes || {};
  const subId = String(d.id || "");
  if (!subId) return new Response("no sub", { status: 200 });

  const admin = createClient(SB_URL, SERVICE);

  // Find the account to credit: custom_data.user_id (set at checkout) is present on most events;
  // for any event that lacks it, fall back to the subscription→user map we stored on the first one.
  let userId: string | null = evt?.meta?.custom_data?.user_id || null;
  if (!userId) {
    const { data: row } = await admin.from("entitlements").select("user_id").eq("ls_subscription_id", subId).maybeSingle();
    userId = row?.user_id || null;
  }
  if (!userId) return new Response("no user", { status: 200 });

  // Translate LS subscription status → an access-end date. The app's expires_at>now check then
  // does the rest, so we never need a separate "is pro" flag.
  const st = String(a.status || "");
  const now = new Date();
  let plan = "pro";
  let exp: Date;
  if (st === "expired" || st === "unpaid") {
    plan = "free"; exp = now;                       // access ended → revoke
  } else if (st === "cancelled") {
    exp = a.ends_at ? new Date(a.ends_at) : now;    // keep Pro until the paid period ends
  } else {
    // active | on_trial | paid | past_due → keep Pro until next renewal (+2d grace so a brief
    // delay in the renewal webhook never flips the user to Free mid-subscription).
    // subscription_created often arrives with renews_at STILL NULL (first invoice not finalized yet);
    // an active subscription with no date must NOT be revoked (exp=now) — grant a short grace window
    // so the buyer gets Pro immediately, and the follow-up subscription_updated (carrying renews_at)
    // extends it to the real period end.
    const end = a.renews_at || a.ends_at;
    exp = end ? new Date(new Date(end).getTime() + 2 * 24 * 3600 * 1000)
              : new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  }
  if (plan === "pro" && !(exp > now)) plan = "free";

  // Replay protection: each LS event carries a unique meta.event_id. Record it in `payments` (PK)
  // as a processed-marker; a duplicate/replayed event hits the unique-violation and is a no-op.
  // Without this, a captured "active" event could be replayed AFTER a cancel to re-grant Pro.
  const eventId = String(evt?.meta?.event_id || "");
  const marker = eventId ? "ls_event:" + eventId : null;
  if (marker) {
    const { error: dupErr } = await admin.from("payments").insert({
      charge_id: marker, user_id: userId, plan, period: a.variant_name || null,
      method: "ls_webhook", status: event, created_at: now.toISOString(),
    });
    if (dupErr?.code === "23505") return new Response("duplicate", { status: 200 }); // already processed
  }

  const { error: uErr } = await admin.from("entitlements").upsert({
    user_id: userId, plan,
    expires_at: exp.toISOString(), charge_id: "ls:" + subId,
    ls_subscription_id: subId, updated_at: now.toISOString(),
  }, { onConflict: "user_id" });
  if (uErr) {
    // Roll back the processed-marker so LS's retry isn't deduped away, and 500 so LS DOES retry.
    if (marker) await admin.from("payments").delete().eq("charge_id", marker);
    return new Response("db_error", { status: 500 });
  }

  return new Response("ok", { status: 200 }); // 200 so LS stops retrying
});
