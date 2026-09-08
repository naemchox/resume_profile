// ===== Edge Function: push-reminders =====
// Background block reminders. A pg_cron job hits this every minute (with the shared CRON_KEY). For
// every stored push subscription we read that user's synced schedule from `user_state`, work out the
// local weekday + minute-of-day in the subscription's timezone, and Web-Push a nudge for any block
// whose start == this minute. Expired subscriptions (404/410) are deleted.
//
// Deploy:  supabase functions deploy push-reminders --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC=... VAPID_PRIVATE=... CRON_KEY=<random>
//          (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected.)
// Schedule (pg_cron + pg_net, run once in SQL editor — see supabase_push.sql).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Local weekday (0=Mon..6=Sun) + minute-of-day for `now` in IANA `tz`.
function localParts(now: Date, tz: string) {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short", year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  };
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat("en-US", { timeZone: tz || "Asia/Bangkok", ...opts }).formatToParts(now); }
  catch { parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", ...opts }).formatToParts(now); }
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const weekday = WD[get("weekday")] ?? 0;
  let hour = parseInt(get("hour"), 10); if (hour === 24) hour = 0;
  const minute = parseInt(get("minute"), 10) || 0;
  // dayKey must match the app's dayKey(ts) = `${y}-${m}-${d}` with NO zero-padding.
  const dayKey = parseInt(get("year"), 10) + "-" + parseInt(get("month"), 10) + "-" + parseInt(get("day"), 10);
  return { weekday, minuteOfDay: (Number.isFinite(hour) ? hour : 0) * 60 + minute, dayKey };
}

// `tm_activities` is stored packed ({v:2,items}) or as a bare array.
function unpackActs(stored: any): any[] {
  if (Array.isArray(stored)) return stored;
  if (stored && Array.isArray(stored.items)) return stored.items;
  return [];
}

// Constant-time string compare — avoids leaking CRON_KEY one byte at a time via response timing.
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  const KEY = Deno.env.get("CRON_KEY") || "";
  if (!KEY || !safeEqual(req.headers.get("x-cron-key") || "", KEY)) return json({ error: "forbidden" }, 403);

  const SB_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const PUB = Deno.env.get("VAPID_PUBLIC") || "";
  const PRIV = Deno.env.get("VAPID_PRIVATE") || "";
  if (!SB_URL || !SERVICE || !PUB || !PRIV) return json({ error: "not configured" }, 500);
  webpush.setVapidDetails("mailto:ijek@app", PUB, PRIV);

  const admin = createClient(SB_URL, SERVICE);
  const now = new Date();

  // All subscriptions, grouped by user (one user_state read per user).
  const { data: subs, error } = await admin
    .from("push_subscriptions").select("endpoint,user_id,p256dh,auth,tz");
  if (error) return json({ error: "subs", detail: error.message }, 500);
  if (!subs || !subs.length) return json({ ok: true, sent: 0 });

  const byUser = new Map<string, any[]>();
  for (const s of subs) { (byUser.get(s.user_id) || byUser.set(s.user_id, []).get(s.user_id)!).push(s); }

  let sent = 0;
  for (const [uid, list] of byUser) {
    const { data: stRow } = await admin.from("user_state").select("data").eq("user_id", uid).maybeSingle();
    const data = stRow && stRow.data;
    if (!data) continue;
    const blocks = Array.isArray(data["tm_schedule"]) ? data["tm_schedule"] : [];
    if (!blocks.length) continue;
    const acts = unpackActs(data["tm_activities"]);
    const actById: Record<string, any> = {};
    for (const a of acts) { if (a && a.id) actById[a.id] = a; }
    const th = data["tm_lang"] === "th";

    for (const sub of list) {
      const { weekday, minuteOfDay, dayKey } = localParts(now, sub.tz);
      const due = blocks.filter((b: any) =>
        b && Array.isArray(b.days) && b.days.indexOf(weekday) !== -1 && Number(b.start) === minuteOfDay);
      for (const b of due) {
        const a = actById[b.activityId];
        const name = (a && a.name) || (th ? "กิจกรรม" : "your block");
        const emoji = (a && typeof a.emoji === "string" && a.emoji.indexOf("idbimg:") !== 0 && a.emoji.slice(0, 5) !== "data:") ? a.emoji + " " : "";
        const payload = JSON.stringify({
          title: emoji + name,
          body: th ? "ถึงเวลาแล้ว — แตะเพื่อเริ่ม" : "Time to go — tap to start",
          tag: "blk-" + (b.id || b.activityId), url: "./train.html?view=day",
          blockId: String(b.id || b.activityId), dayKey,
        });
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          sent++;
        } catch (e: any) {
          const code = e && e.statusCode;
          if (code === 404 || code === 410) { // gone — clean it up
            try { await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); } catch (_) {}
          }
        }
      }
    }
  }
  return json({ ok: true, sent });
});
