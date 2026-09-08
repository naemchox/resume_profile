// ===== Edge Function: jek-ai =====
// Generates JEK's daily check-in line with a real LLM (Anthropic Claude Haiku 4.5), in the
// caller's chosen persona + language. Pro-only. The browser NEVER sees ANTHROPIC_API_KEY.
// The client falls back to the deterministic checkInLine() if this errors or the user
// isn't Pro — so this is a pure enhancement, never a dependency.
//
// Deploy:  supabase functions deploy jek-ai --no-verify-jwt
//   (we verify the JWT ourselves below so we can read the user id + check entitlement.)
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase.)
//
// POST { lang:'en'|'th', persona, moment, name, keptDays, streak,
//        todayPlanCount, todayPct, missedYesterday }
//   -> { text }            on success
//   -> { error }           on any failure (client then uses its deterministic line)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

// --- Allowlists: the client sends only enums; we build the prompt server-side so a
// --- compromised client can't inject arbitrary system text. Unknown → safe default.
const PERSONAS: Record<string, string> = {
  coach:  "an encouraging, warm personal coach",
  drill:  "a tough, no-excuses drill sergeant (still caring underneath)",
  chill:  "a relaxed, easygoing friend who keeps it light",
  rival:  "a playful, competitive rival who eggs the user on",
  bestie: "the user's loyal hype-bestie, warm and a little informal",
  zen:    "a calm, mindful guide who speaks softly",
  hype:   "a high-energy hype-person, loud and celebratory",
  snarky: "a witty, lightly sarcastic but ultimately supportive sidekick",
  custom: "a supportive personal coach",
};
const MOMENTS: Record<string, string> = {
  rest:    "It's the user's planned REST day — reassure them rest is part of the plan; do not push training.",
  empty:   "The user has nothing scheduled today — gently nudge them to add or pick a habit.",
  done:    "The user has ALREADY completed today's whole plan — celebrate and acknowledge it.",
  streak:  "The user is on a multi-day streak — hype the momentum and protect the streak.",
  missed:  "The user missed yesterday's plan — be kind, no shame, focus on today as a fresh start.",
  plan:    "It's a normal training day with a plan ahead — a short motivating nudge to start.",
  comeback: "The user is back after being away for a few days — welcome them warmly, no guilt, invite them to pick one thing.",
  behind:  "It's past midday and the user is behind on today's plan — encouraging, there's still time, nudge them to start one block.",
  ontrack: "It's past midday and the user is on track with today's plan — affirm the pace and encourage keeping the rhythm.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const SB_URL  = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!API_KEY || !SB_URL || !SERVICE) return json({ error: "server not configured" }, 500);

  // 1) Identify the caller from their Supabase JWT.
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "auth required" }, 401);
  const admin = createClient(SB_URL, SERVICE);
  const { data: u, error: uerr } = await admin.auth.getUser(jwt);
  if (uerr || !u?.user) return json({ error: "bad token" }, 401);
  const userId = u.user.id;

  // 2) Pro gate — read entitlements exactly like the other functions do. Free → 402; the
  //    client silently uses its deterministic line (never surfaced as an error to the user).
  //    'pro' and 'proplus' both unlock AI; only the daily CAP differs.
  const { data: ent } = await admin
    .from("entitlements").select("plan,expires_at").eq("user_id", userId).maybeSingle();
  const active = !!(ent && ent.expires_at &&
    new Date(String(ent.expires_at).replace(" ", "T")) > new Date());
  const plan = active && ent ? String(ent.plan) : "free";
  const isPro = active && (plan === "pro" || plan === "proplus");
  if (!isPro) return json({ error: "pro required" }, 402);

  // 3) Parse the compact payload FIRST — the cap step below prices the call by its kind, so we must
  //    know the kind before counting. (Body holds only client enums; the prompt is built server-side.)
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad body" }, 400); }
  const kind = body.kind === "weekly" ? "weekly" : body.kind === "chat" ? "chat"
    : body.kind === "plan" ? "plan" : body.kind === "plan-multi" ? "plan-multi"
    : body.kind === "week-plan" ? "week-plan" : body.kind === "vision" ? "vision" : "daily";

  // 2b) SERVER-SIDE daily cap (the client cap is bypassable). Mirror AI_DAILY_CAP in train.html:
  //     pro = 8/day, proplus = 30/day. The cap is a CREDIT budget, not a raw call count: a normal
  //     daily/chat/plan line (max_tokens 120-300) costs 1 credit, but a week-plan call (max_tokens
  //     1024 ≈ 8x the output cost) costs WEEK_PLAN_COST credits — so a user can't spam the expensive
  //     call past the plan's real token budget (the leak the cost audit flagged). bump_ai_usage
  //     atomically adds the weight; over → 429 and the client falls back to its deterministic line.
  const CAP = plan === "proplus" ? 30 : 8;
  const WEEK_PLAN_COST = 4;
  // Weight the credit by the call's REAL token cost, not a flat 1. week-plan (max_tokens 1024),
  // plan-multi (700 → several structured habits), and vision (image tokens + 1500-token JSON) all
  // cost ~4x a normal daily/chat line — so they burn WEEK_PLAN_COST credits. Pricing plan-multi at 1
  // credit (its old weight) let a Pro+ user spam the cap and cost more in tokens than the plan earns
  // (billing audit flag); charging its true 4x closes that.
  const HEAVY = kind === "week-plan" || kind === "vision" || kind === "plan-multi";
  const cost = HEAVY ? WEEK_PLAN_COST : 1;
  const { data: usage, error: capErr } = await admin.rpc("bump_ai_usage", { p_user: userId, p_cap: CAP, p_weight: cost });
  const uRow = Array.isArray(usage) ? usage[0] : usage;
  if (capErr) return json({ error: "cap-check" }, 500);          // fail CLOSED: never call Anthropic uncapped
  if (uRow && uRow.allowed === false) return json({ error: "cap", cap: CAP }, 429);

  // 4) Validate the rest of the compact payload.
  const lang    = body.lang === "th" ? "th" : "en";
  const persona = PERSONAS[String(body.persona)] ? String(body.persona) : "coach";
  const moment  = MOMENTS[String(body.moment)] ? String(body.moment) : "plan";
  const name    = String(body.name || "JEK").slice(0, 24);
  const n        = (v: unknown, d = 0) => Number.isFinite(Number(v)) ? Math.round(Number(v)) : d;
  const keptDays = n(body.keptDays);
  const streak   = n(body.streak);
  const planCnt  = n(body.todayPlanCount);
  const todayPct = Math.max(0, Math.min(100, n(body.todayPct)));
  const missedY  = !!body.missedYesterday;
  // Slice 2 AI ctx: user-supplied activity names — MUST be sanitized before prompt injection.
  // Strip all control chars (incl. newlines) and cap at 24 chars to prevent prompt injection
  // through user-created activity names.
  const _san = (v: unknown, max = 24): string | null => {
    if (!v || typeof v !== "string") return null;
    const s = v.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
    return s || null;
  };
  const missedName     = _san(body.missedName);
  const todayFirstName = _san(body.todayFirstName);
  const bestName       = _san(body.bestName);
  // weekly-only facts
  const total     = n(body.total);
  const weekPct   = Math.max(0, Math.min(100, n(body.pct)));
  const highlight = _san(body.highlight, 40) || "";
  // chat-only: sanitize the conversation the client sent. Roles + length are capped server-side so
  // a compromised client can't smuggle a system prompt or a huge payload through the messages array.
  let chatMsgs: { role: string; content: string }[] = [];
  if (kind === "chat") {
    const raw = Array.isArray(body.messages) ? body.messages : [];
    chatMsgs = raw.slice(-12)
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
      .map((m: any) => ({ role: m.role, content: String(m.text).slice(0, 800) }))
      .filter((m) => m.content.trim().length > 0);
    if (!chatMsgs.length || chatMsgs[chatMsgs.length - 1].role !== "user")
      return json({ error: "bad chat" }, 400);
  }

  // 4) Tight system prompt: persona + language + brevity. JEK is the avatar speaking TO the
  //    user (second person). No markdown, no quotes.
  const langName = lang === "th" ? "Thai" : "English";

  // ── kind:'plan' — "Plan with JEK": turn a natural-language sentence into ONE structured
  //    activity (name/emoji/days/time/goal). Returns { plan } (NOT { text }); the client previews
  //    it and the user confirms before anything is created. Counts against the same daily AI cap.
  if (kind === "plan") {
    const userText = String(body.text || "").slice(0, 300).trim();
    if (!userText) return json({ error: "bad plan" }, 400);
    const sys =
      `You convert a user's natural-language description of a habit into ONE structured activity for a habit-scheduling app. ` +
      `The user writes in ${langName}. Output ONLY a single minified JSON object — no markdown, no prose — with EXACTLY these keys: ` +
      `"name" (string, the habit name in the user's language, max 24 chars), ` +
      `"emoji" (ONE single emoji that best represents it), ` +
      `"days" (array of integers 0-6 where 0=Monday … 6=Sunday — the days to do it; "weekdays"=[0,1,2,3,4], "every day"=[0,1,2,3,4,5,6]; if unstated use [0,1,2,3,4]), ` +
      `"start" (integer minutes from midnight; use the named time of day — morning=480, afternoon=840, evening=1140 — or an explicit clock time; default 480), ` +
      `"end" (integer minutes from midnight = start + the stated duration; if no duration, start+60), ` +
      `"goalMode" ("time" | "amount" | "percent" — use "amount" only if the user names a countable target like pages or reps, otherwise "time"), ` +
      `"target" (integer amount for goalMode "amount", else 0), ` +
      `"unit" (the unit word in the user's language for the amount, e.g. pages/reps, else ""). ` +
      `Ensure 0<=start<1440, start<end<=1440.`;
    let presp: Response;
    try {
      presp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 300, system: sys, messages: [{ role: "user", content: userText }] }),
      });
    } catch (_) { return json({ error: "upstream" }, 502); }
    if (!presp.ok) return json({ error: "anthropic", status: presp.status }, 502);
    const pdata = await presp.json();
    const raw = (Array.isArray(pdata?.content)
      ? pdata.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("") : "").trim();
    let spec: any = null;
    try { const m = raw.match(/\{[\s\S]*\}/); spec = m ? JSON.parse(m[0]) : null; } catch { spec = null; }
    if (!spec || typeof spec !== "object") return json({ error: "parse" }, 502);
    const ci = (v: unknown, lo: number, hi: number, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
    let days = Array.isArray(spec.days) ? [...new Set(spec.days.map((d: unknown) => ci(d, 0, 6, 0)))].sort((a, b) => (a as number) - (b as number)) : [0, 1, 2, 3, 4];
    if (!days.length) days = [0, 1, 2, 3, 4];
    const start = ci(spec.start, 0, 1439, 480);
    let end = ci(spec.end, 1, 1440, start + 60);
    if (end <= start) end = Math.min(1440, start + 60);
    const goalMode = (spec.goalMode === "amount" || spec.goalMode === "percent") ? spec.goalMode : "time";
    const out = {
      name: String(spec.name || "").slice(0, 24) || (lang === "th" ? "กิจกรรมใหม่" : "New habit"),
      emoji: (typeof spec.emoji === "string" && spec.emoji) ? Array.from(spec.emoji)[0] : "✅",
      days, start, end, goalMode,
      target: goalMode === "amount" ? ci(spec.target, 0, 100000, 0) : 0,
      unit: goalMode === "amount" ? String(spec.unit || "").slice(0, 12) : "",
    };
    return json({ plan: out });
  }

  // ── kind:'plan-multi' — "Plan my week with JEK": turn ONE free-text paragraph describing several
  //    goals into a LIST of structured activities (1–8). Unlike 'plan' this returns NO clock time —
  //    each activity carries a weekly FREQUENCY ("freq" = how many days/week) so the client can chain
  //    straight into 'week-plan' to lay them on the grid. Returns { activities:[...] }. The client
  //    previews them, then creates + schedules on confirm. Counts as ONE call against the daily cap.
  if (kind === "plan-multi") {
    const userText = String(body.text || "").slice(0, 600).trim();
    if (!userText) return json({ error: "bad plan" }, 400);
    const sys =
      `You convert a user's natural-language description of their goals into a LIST of structured habits for a weekly habit-scheduling app. ` +
      `The user writes in ${langName}. Identify each distinct habit they mention (split compound goals; merge obvious duplicates). Produce between 1 and 8 habits. ` +
      `Output ONLY a single minified JSON object — no markdown, no prose — of the form {"activities":[...]}. ` +
      `Each activity has EXACTLY these keys: ` +
      `"name" (string, the habit name in the user's language, max 24 chars), ` +
      `"emoji" (ONE single emoji that best represents it), ` +
      `"freq" (integer 1-7 = how many days per week to do it; "daily"/"every day"=7, "weekdays"=5; if the user names a count like "3 times a week" use it; if unstated pick a sensible default for that habit), ` +
      `"goalMode" ("time" | "amount" — use "amount" ONLY if the user names a countable per-session target like pages or reps, otherwise "time"), ` +
      `"target" (integer per-session amount when goalMode="amount", else 0), ` +
      `"unit" (the unit word in the user's language for the amount, e.g. pages/reps, else ""). ` +
      `Do NOT include clock times — scheduling happens in a separate step.`;
    let presp: Response;
    try {
      presp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 700, system: sys, messages: [{ role: "user", content: userText }] }),
      });
    } catch (_) { return json({ error: "upstream" }, 502); }
    if (!presp.ok) return json({ error: "anthropic", status: presp.status }, 502);
    const pdata = await presp.json();
    const raw = (Array.isArray(pdata?.content)
      ? pdata.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("") : "").trim();
    let parsed: any = null;
    try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    const list = parsed && Array.isArray(parsed.activities) ? parsed.activities : null;
    if (!list || !list.length) return json({ error: "parse" }, 502);
    const ci = (v: unknown, lo: number, hi: number, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
    const activities = list.slice(0, 8).map((a: any) => {
      if (!a || typeof a !== "object") return null;
      const name = String(a.name || "").slice(0, 24).trim();
      if (!name) return null;
      const goalMode = a.goalMode === "amount" ? "amount" : "time";
      return {
        name,
        emoji: (typeof a.emoji === "string" && a.emoji) ? Array.from(a.emoji)[0] : "✅",
        freq: ci(a.freq, 1, 7, 3),
        goalMode,
        target: goalMode === "amount" ? ci(a.target, 0, 100000, 0) : 0,
        unit: goalMode === "amount" ? String(a.unit || "").slice(0, 12) : "",
      };
    }).filter(Boolean);
    if (!activities.length) return json({ error: "empty" }, 502);
    return json({ activities });
  }

  // ── kind:'vision' — "From a photo": read a PHOTO of a schedule / timetable / to-do list and extract
  //    it into structured activities (time-bound, recurring) + todos (untimed checklist items). The
  //    client previews everything and the user edits/confirms before anything is created. Image is a
  //    RAW base64 string (no data: prefix). Priced as WEEK_PLAN_COST against the daily cap. Vision is
  //    supported on Haiku 4.5 — kept on the same cheap model as the rest of jek-ai for cost parity;
  //    bump to claude-sonnet-5 / claude-opus-4-8 if extraction accuracy on messy photos needs it.
  if (kind === "vision") {
    const image = String(body.image || "");
    const mediaType = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(String(body.mediaType))
      ? String(body.mediaType) : "image/jpeg";
    if (image.length < 100) return json({ error: "bad image" }, 400);
    if (image.length > 7_000_000) return json({ error: "image too large" }, 413); // ~5MB decoded
    const sys =
      `You read a photo of a schedule, timetable, class list, planner, or to-do list and extract it for a habit-scheduling app. ` +
      `The user's language is ${langName}; write names/text in that language. ` +
      `Output ONLY one minified JSON object — no markdown, no prose — of the form {"activities":[...],"todos":[...]}. ` +
      `"activities" = items with a specific TIME (classes, workouts, work blocks, appointments). Each has EXACTLY these keys: ` +
      `"name" (string, max 24 chars), ` +
      `"emoji" (ONE single emoji that best represents it), ` +
      `"days" (array of integers 0-6 where 0=Monday … 6=Sunday — the days it occurs; a one-off/undated item = [0,1,2,3,4]), ` +
      `"start" (integer minutes from midnight — read the clock time shown; default 480), ` +
      `"end" (integer minutes from midnight — read it, else start+60). ` +
      `"todos" = checklist / one-off tasks with NO specific time. Each has EXACTLY: ` +
      `"text" (string, max 60 chars), "emoji" (ONE single emoji, or ""). ` +
      `Only include what you can actually read in the image. If there are no timed items return "activities":[]; if no checklist items return "todos":[]. ` +
      `Ensure 0<=start<1440 and start<end<=1440.`;
    let vresp: Response;
    try {
      vresp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 1500,
          system: sys,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
              { type: "text", text: lang === "th" ? "อ่านรูปนี้แล้วดึงเป็น activities/todos" : "Read this image and extract activities/todos." },
            ],
          }],
        }),
      });
    } catch (_) { return json({ error: "upstream" }, 502); }
    if (!vresp.ok) return json({ error: "anthropic", status: vresp.status }, 502);
    const vdata = await vresp.json();
    const raw = (Array.isArray(vdata?.content)
      ? vdata.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("") : "").trim();
    let parsed: any = null;
    try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    if (!parsed || typeof parsed !== "object") return json({ error: "parse" }, 502);
    const ci = (v: unknown, lo: number, hi: number, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
    const inActs = Array.isArray(parsed.activities) ? parsed.activities : [];
    const inTodos = Array.isArray(parsed.todos) ? parsed.todos : [];
    const activities = inActs.slice(0, 20).map((a: any) => {
      if (!a || typeof a !== "object") return null;
      const name = String(a.name || "").slice(0, 24).trim();
      if (!name) return null;
      let days = Array.isArray(a.days) ? [...new Set(a.days.map((d: unknown) => ci(d, 0, 6, 0)))].sort((x, y) => (x as number) - (y as number)) : [0, 1, 2, 3, 4];
      if (!days.length) days = [0, 1, 2, 3, 4];
      const start = ci(a.start, 0, 1439, 480);
      let end = ci(a.end, 1, 1440, start + 60);
      if (end <= start) end = Math.min(1440, start + 60);
      return { name, emoji: (typeof a.emoji === "string" && a.emoji) ? Array.from(a.emoji)[0] : "✅", days, start, end };
    }).filter(Boolean);
    const todos = inTodos.slice(0, 20).map((t: any) => {
      const text = String((t && (t.text ?? t)) || "").slice(0, 60).trim();
      if (!text) return null;
      return { text, emoji: (t && typeof t.emoji === "string" && t.emoji) ? Array.from(t.emoji)[0] : "" };
    }).filter(Boolean);
    if (!activities.length && !todos.length) return json({ error: "empty" }, 502);
    return json({ activities, todos });
  }

  // ── kind:'week-plan' — "JEK plans your week": given the wake/sleep window, an optional free-text
  //    note of FIXED commitments, and the user's EXISTING activities (each with a weekly-frequency
  //    target), lay out a full week of recurring blocks. Returns { blocks:[{activityId,days[],start,
  //    end}] }; the client previews them as ghost blocks and the user accepts before anything lands.
  //    Same daily AI cap. activityId is validated against the sent set so the client can trust it.
  if (kind === "week-plan") {
    const wake  = Math.max(0, Math.min(1439, n(body.wakeMin, 420)));
    const sleep = Math.max(wake + 30, Math.min(1440, n(body.sleepMin, 1380)));
    const note  = String(body.note || "").slice(0, 300).trim();
    const acts = (Array.isArray(body.activities) ? body.activities : [])
      .slice(0, 30)
      .map((a: any) => ({
        id: String(a?.id || "").slice(0, 40),
        name: String(a?.name || "").slice(0, 24),
        weeklyAmount: n(a?.weeklyAmount),
        goalMode: a?.goalMode === "amount" ? "amount" : a?.goalMode === "percent" ? "percent" : "time",
        unit: String(a?.unit || "").slice(0, 12),
      }))
      .filter((a: any) => a.id && a.name);
    if (!acts.length) return json({ error: "no-activities" }, 400);
    const allowed = new Set(acts.map((a: any) => a.id));
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const actLines = acts.map((a: any) =>
      `- id="${a.id}" "${a.name}"${a.weeklyAmount ? ` (target ${a.weeklyAmount}${a.goalMode === "amount" && a.unit ? " " + a.unit : ""} per week)` : ""}`).join("\n");
    const sys =
      `You are a scheduling assistant for a weekly habit planner. The user is awake from ${fmt(wake)} to ${fmt(sleep)}. ` +
      `Lay out their activities across the week as recurring time blocks. ` +
      `Output ONLY a single minified JSON object — no markdown, no prose — of the form {"blocks":[...]}. ` +
      `Each block has EXACTLY these keys: "activityId" (one of the given ids, copied verbatim), ` +
      `"days" (array of integers 0-6, 0=Monday … 6=Sunday — the weekdays this block recurs on), ` +
      `"start" (integer minutes from midnight), "end" (integer minutes from midnight). ` +
      `Rules: every block must satisfy ${wake} <= start < end <= ${sleep}. ` +
      `For an activity whose weekly target is N, schedule it on N distinct days — typically ONE block whose "days" lists those N days at a sensible recurring time. ` +
      `Spread the load so no single day is overloaded; honor natural times of day (exercise in the morning or evening, focused work midday, reading in the evening). ` +
      `Use ONLY the activity ids provided; never invent activities. Keep the total number of blocks reasonable (at most 20).` +
      (note ? ` The user also notes these FIXED commitments — do NOT place blocks that overlap them: "${note}".` : "");
    let presp: Response;
    try {
      presp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1024, system: sys,
          messages: [{ role: "user", content: `Activities:\n${actLines}\n\nPlan my week now.` }] }),
      });
    } catch (_) { return json({ error: "upstream" }, 502); }
    if (!presp.ok) return json({ error: "anthropic", status: presp.status }, 502);
    const pdata = await presp.json();
    const raw = (Array.isArray(pdata?.content)
      ? pdata.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("") : "").trim();
    let parsed: any = null;
    try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    const list = parsed && Array.isArray(parsed.blocks) ? parsed.blocks : null;
    if (!list) return json({ error: "parse" }, 502);
    const ci = (v: unknown, lo: number, hi: number, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
    const blocks = list.slice(0, 20).map((b: any) => {
      if (!b || !allowed.has(String(b.activityId))) return null;
      const days = Array.isArray(b.days)
        ? [...new Set(b.days.map((d: unknown) => ci(d, 0, 6, 0)))].sort((a, b) => (a as number) - (b as number))
        : [];
      if (!days.length) return null;
      const start = ci(b.start, wake, sleep - 5, wake);
      let end = ci(b.end, start + 5, sleep, Math.min(sleep, start + 60));
      if (end <= start) end = Math.min(sleep, start + 60);
      return { activityId: String(b.activityId), days, start, end };
    }).filter(Boolean);
    if (!blocks.length) return json({ error: "empty" }, 502);
    return json({ blocks });
  }

  const system = kind === "chat"
    ? `You are ${name}, the user's "committed self" avatar in a habit app — ${PERSONAS[persona]}. ` +
      `You are having a short back-and-forth chat with the user in ${langName}, speaking directly to them in the second person. ` +
      `Reply in at most 2-3 short sentences. Be warm, specific, and in character; encourage their habits without shaming. ` +
      `If the user explains a real-life obstacle that got in the way of their plan, acknowledge it briefly with no judgment, then offer ONE concrete, practical next step or a small adjustment to their schedule to work around it. ` +
      `No markdown, no surrounding quotes, no preamble — output only your reply.`
    : kind === "weekly"
    ? `You are ${name}, the user's "committed self" avatar in a habit app — ${PERSONAS[persona]}. ` +
      `Speak DIRECTLY to the user in the second person, in ${langName}. ` +
      `Write a short, warm WEEKLY LETTER body of 2–3 sentences (under ~220 characters) reflecting on last week. ` +
      `No markdown, no surrounding quotes, no greeting and no sign-off (those are added separately) — output only the body. ` +
      `Stay in character; be specific and encouraging, never shaming.`
    : `You are ${name}, the user's "committed self" avatar in a habit app — ${PERSONAS[persona]}. ` +
      `Speak DIRECTLY to the user in the second person, in ${langName}. ` +
      `Write ONE line of at most 2 short sentences (under ~140 characters). ` +
      `No markdown, no emojis, no surrounding quotes, no preamble — output only the line itself. ` +
      `Stay in character and keep it personal and specific to today's situation.`;

  const situation = kind === "weekly"
    ? `Last week's recap: kept ${keptDays} of ${total} planned days (${weekPct}%). ` +
      `Current streak ${streak} day(s).` +
      (highlight ? ` They kept "${highlight}" every single time last week.` : "") +
      `\nWrite ${name}'s weekly letter body now.`
    : `Today's situation: ${MOMENTS[moment]}\n` +
      `Facts you may use: planned habits today=${planCnt}, today's progress=${todayPct}%, ` +
      `current streak=${streak} day(s), days kept this week=${keptDays}, ` +
      `missed yesterday=${missedY ? "yes" : "no"}.` +
      (missedName     ? ` The habit they missed yesterday was "${missedName}".` : "") +
      (todayFirstName ? ` Their next planned habit today is "${todayFirstName}".` : "") +
      (bestName       ? ` Their most consistent habit is "${bestName}".` : "") +
      `\nWrite ${name}'s check-in line now.`;

  // 5) Call the Anthropic Messages API. Short output = tiny cost. Haiku 4.5 does NOT accept
  //    thinking/effort params (they 400), so this is a plain messages call.
  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: kind === "daily" ? 120 : 200,  // daily line is shortest; chat/weekly get a touch more room
        system,
        messages: kind === "chat" ? chatMsgs : [{ role: "user", content: situation }],
      }),
    });
  } catch (_) {
    return json({ error: "upstream" }, 502);
  }
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return json({ error: "anthropic", status: resp.status, detail: detail.slice(0, 200) }, 502);
  }
  const data = await resp.json();
  // Response shape: { content: [{ type:'text', text:'...' }], ... }
  const text = (Array.isArray(data?.content)
    ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("").trim()
    : "").replace(/^["“]|["”]$/g, "").trim();
  if (!text) return json({ error: "empty" }, 502);

  return json({ text });
});
