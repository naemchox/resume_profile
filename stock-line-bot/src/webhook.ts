import type { Env, Meta, UserState } from "./types";
import { loadMeta, loadUser, saveMeta, saveUser } from "./state";
import { fetchQuotes, resolveSymbol } from "./yahoo";
import { getDisplayName, getQuota, reply, verifySignature } from "./line";
import { displaySymbol, flag, priceMessage } from "./flex";
import {
  MAX_PUSH_USERS,
  effectiveInterval,
  estimateMonthly,
  isActive,
  isReceiving,
  loadReceivers,
  shareFor,
} from "./schedule";

const MAX_WATCH = 20;
const MIN_INTERVAL = 15;

function helpText(isOwner: boolean) {
  return [
    "คำสั่งที่ใช้ได้",
    "• เพิ่ม PTT AAPL — เพิ่มหุ้น (ไทยไม่ต้องใส่ .BK)",
    "• ลบ PTT — เอาหุ้นออก",
    "• รายการ — ดูหุ้นที่ติดตาม",
    "• รอบ 1ชม — ตั้งรอบแจ้งเตือน (ขั้นต่ำ 15 นาที)",
    "• ราคา — ดูราคาตอนนี้ (ไม่เสียโควตา)",
    "• หยุด / เริ่ม — พัก/เปิดการแจ้งเตือน",
    "• โควตา — ดูจำนวนข้อความเดือนนี้",
    ...(isOwner ? ["• ผู้ใช้ — ดูว่าใครใช้บอทอยู่บ้าง (เฉพาะเจ้าของ)"] : []),
  ].join("\n");
}

const HOWTO = [
  "📘 วิธีใช้ — พิมพ์ตามตัวอย่างได้เลย",
  "",
  "➕ เพิ่มหุ้น (ไทยไม่ต้องใส่ .BK)",
  "เพิ่ม PTT",
  "เพิ่ม PTT KBANK AAPL",
  "",
  "➖ ลบหุ้น",
  "ลบ PTT",
  "",
  "📋 ดูหุ้นที่ติดตาม",
  "รายการ",
  "",
  "💹 ดูราคาตอนนี้ (ไม่เสียโควตา)",
  "ราคา",
  "",
  "⏰ ตั้งรอบแจ้งเตือน",
  "รอบ 1ชม",
  "รอบ 2ชม",
  "รอบ 30",
  "",
  "⏸️ พัก / เปิดแจ้งเตือน",
  "หยุด",
  "เริ่ม",
  "",
  "📊 ดูโควตาข้อความเดือนนี้",
  "โควตา",
].join("\n");

const quickReply = {
  items: ["ราคา", "รายการ", "โควตา", "วิธีใช้", "ช่วย"].map((label) => ({
    type: "action",
    action: { type: "message", label, text: label },
  })),
};

function text(t: string) {
  return { type: "text", text: t, quickReply };
}

/** "30", "30m", "30นาที", "1h", "1ชม", "2ชั่วโมง" → นาที */
export function parseInterval(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(m|min|นาที|h|hr|ชม\.?|ชั่วโมง)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] ?? "m";
  const minutes = /^(h|hr|ชม|ชั่วโมง)/.test(unit) ? n * 60 : n;
  return Number.isInteger(minutes) ? minutes : null;
}

/** 30 → "30 นาที", 60 → "1 ชม.", 90 → "1 ชม. 30 นาที" */
export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} นาที`;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

interface Ctx {
  id: string;
  isOwner: boolean;
  /** อยู่ในกลุ่มที่ได้แจ้งเตือนอัตโนมัติไหม */
  receiver: boolean;
  user: UserState;
  /** คนอื่นในกลุ่มแจ้งเตือนที่กำลังรับอยู่ (ไม่นับตัวเอง) */
  othersReceiving: number;
}

function shareOf(ctx: Ctx): { share: number; count: number } {
  const count = ctx.othersReceiving + (isReceiving(ctx.user) ? 1 : 0);
  return { share: shareFor(count), count };
}

/** บรรทัดสรุปรอบจริง + ประมาณการ — คำนวณจากสถานะล่าสุดหลังแก้แล้ว */
function statusLine(ctx: Ctx): string {
  if (!ctx.receiver)
    return `ℹ️ แจ้งเตือนอัตโนมัติเต็มแล้ว (รับได้ ${MAX_PUSH_USERS} คน)\nพิมพ์ ราคา เพื่อดูราคาได้ตลอด ไม่เสียโควตา`;
  const u = ctx.user;
  if (!u.watch.length) return `แจ้งทุก ${fmtMin(u.intervalMin)} (ยังไม่มีหุ้น)`;
  if (u.paused) return `แจ้งทุก ${fmtMin(u.intervalMin)} (พักอยู่)`;

  const { share, count } = shareOf(ctx);
  const eff = effectiveInterval(u, share);
  const est = estimateMonthly(u.watch.map((w) => w.symbol), eff);
  const head =
    eff > u.intervalMin
      ? `ตั้งไว้ทุก ${fmtMin(u.intervalMin)} แต่ตอนนี้ได้จริงทุก ${fmtMin(eff)} เพราะแบ่งโควตากับผู้ใช้ ${count} คน`
      : `แจ้งทุก ${fmtMin(eff)} (เฉพาะตอนตลาดเปิด)`;
  return `${head}\nประมาณ ${est} ข้อความ/เดือน (ส่วนของคุณ ${share})`;
}

async function usersReport(env: Env, meta: Meta): Promise<string> {
  const { users, share } = await loadReceivers(env);
  const name = async (id: string) => (await getDisplayName(env, id)) ?? id.slice(0, 8);
  const lines = [`👥 ได้แจ้งเตือนอัตโนมัติ ${users.length}/${MAX_PUSH_USERS} คน`];
  for (const { id, state } of users) {
    const status = !state.watch.length
      ? "ยังไม่มีหุ้น"
      : state.paused
        ? "พักอยู่"
        : `ทุก ${fmtMin(effectiveInterval(state, share))} · ${state.watch.length} หุ้น`;
    lines.push(`• ${await name(id)}${id === meta.owner ? " (เจ้าของ)" : ""} — ${status}`);
  }
  if (meta.guests.length) {
    lines.push("", `ใช้ได้แค่คำสั่ง (เต็มแล้ว) ${meta.guests.length} คน`);
    for (const id of meta.guests) lines.push(`• ${await name(id)}`);
  }
  return lines.join("\n");
}

async function handleCommand(env: Env, ctx: Ctx, meta: Meta, input: string): Promise<unknown[]> {
  const [cmd = "", ...args] = input.trim().split(/\s+/);
  const { id, user: state } = ctx;
  const now = new Date();

  switch (cmd.toLowerCase()) {
    case "เพิ่ม":
    case "add": {
      if (!args.length) return [text("พิมพ์ชื่อหุ้นด้วย เช่น เพิ่ม PTT AAPL")];
      const added: string[] = [];
      const failed: string[] = [];
      for (const raw of args) {
        if (state.watch.length >= MAX_WATCH) {
          failed.push(`${raw} (เต็ม ${MAX_WATCH} ตัว)`);
          continue;
        }
        const q = await resolveSymbol(raw);
        if (!q) failed.push(raw);
        else if (state.watch.some((w) => w.symbol === q.symbol)) added.push(`${displaySymbol(q.symbol)} (มีอยู่แล้ว)`);
        else {
          state.watch.push({ symbol: q.symbol, name: q.name });
          added.push(`${flag(q.symbol)} ${displaySymbol(q.symbol)} — ${q.name}`);
        }
      }
      await saveUser(env, id, state);
      const lines = [];
      if (added.length) lines.push("เพิ่มแล้ว", ...added);
      if (failed.length) lines.push(`ไม่พบหุ้น: ${failed.join(", ")}`);
      lines.push("", statusLine(ctx));
      return [text(lines.join("\n"))];
    }

    case "ลบ":
    case "del":
    case "remove": {
      const targets = args.map((a) => a.toUpperCase());
      const before = state.watch.length;
      state.watch = state.watch.filter(
        (w) => !targets.includes(w.symbol) && !targets.includes(displaySymbol(w.symbol)),
      );
      await saveUser(env, id, state);
      return [text(before === state.watch.length ? "ไม่พบหุ้นนี้ในรายการ" : `ลบแล้ว เหลือ ${state.watch.length} ตัว`)];
    }

    case "รายการ":
    case "list": {
      if (!state.watch.length) return [text("ยังไม่มีหุ้นในรายการ\nพิมพ์ เพิ่ม PTT เพื่อเริ่ม")];
      const lines = state.watch.map((w) => `${flag(w.symbol)} ${displaySymbol(w.symbol)} — ${w.name}`);
      lines.push("", statusLine(ctx));
      return [text(lines.join("\n"))];
    }

    case "รอบ":
    case "every": {
      const min = parseInterval(args.join(""));
      if (min === null || min < MIN_INTERVAL || min > 1440 || min % 5 !== 0)
        return [text(`ใส่เป็นนาทีที่หาร 5 ลงตัว ตั้งแต่ ${MIN_INTERVAL} นาทีขึ้นไป เช่น รอบ 30 หรือ รอบ 1ชม`)];
      state.intervalMin = min;
      await saveUser(env, id, state);
      return [text(`ตั้งแล้ว ✅\n${statusLine(ctx)}`)];
    }

    case "ราคา":
    case "now": {
      if (!state.watch.length) return [text("ยังไม่มีหุ้นในรายการ")];
      const quotes = await fetchQuotes(state.watch.map((w) => w.symbol));
      if (!quotes.length) return [text("ดึงราคาไม่สำเร็จ ลองใหม่อีกครั้ง")];
      const closed = new Set(quotes.filter((q) => !isActive(q, now)).map((q) => q.symbol));
      return [{ ...priceMessage(quotes, now, closed), quickReply }];
    }

    case "หยุด":
    case "stop":
      state.paused = true;
      await saveUser(env, id, state);
      return [text("พักการแจ้งเตือนแล้ว พิมพ์ เริ่ม เพื่อเปิดอีกครั้ง")];

    case "เริ่ม":
    case "start":
      state.paused = false;
      await saveUser(env, id, state);
      return [text(`เปิดการแจ้งเตือนแล้ว\n${statusLine(ctx)}`)];

    case "โควตา":
    case "quota": {
      if (!ctx.isOwner) return [text(statusLine(ctx))];
      const q = await getQuota(env);
      if (!q) return [text("เช็กโควตาไม่สำเร็จ")];
      const used = q.limit === null ? `${q.used} ข้อความ (ไม่จำกัด)` : `${q.used}/${q.limit} ข้อความ`;
      return [text(`ทั้งบอทเดือนนี้ใช้ไป ${used}\n\n${statusLine(ctx)}`)];
    }

    case "ผู้ใช้":
    case "users":
      if (!ctx.isOwner) return [text(helpText(false))];
      return [text(await usersReport(env, meta))];

    case "วิธีใช้":
    case "howto":
      return [text(HOWTO)];

    default:
      return [text(helpText(ctx.isOwner))];
  }
}

/** ลงทะเบียนผู้ใช้: คนแรก = เจ้าของ, ได้แจ้งเตือนอัตโนมัติถึง MAX_PUSH_USERS คน ที่เหลือเป็น guest */
function register(meta: Meta, id: string): boolean {
  if (meta.users.includes(id)) return false;
  if (!meta.owner) meta.owner = id;
  if (meta.users.length < MAX_PUSH_USERS) {
    meta.users.push(id);
    meta.guests = meta.guests.filter((g) => g !== id);
    return true;
  }
  if (meta.guests.includes(id)) return false;
  meta.guests.push(id);
  return true;
}

export async function handleWebhook(req: Request, env: Env): Promise<Response> {
  const body = await req.text();
  if (!(await verifySignature(env.LINE_CHANNEL_SECRET, body, req.headers.get("x-line-signature"))))
    return new Response("bad signature", { status: 401 });

  const { events = [] } = JSON.parse(body) as { events?: any[] };
  for (const ev of events) {
    const id: string | undefined = ev.source?.userId;
    if (ev.source?.type !== "user" || !id) continue;
    const meta = await loadMeta(env);

    // บล็อกบอท → คืนที่ให้คนอื่น และไม่หารโควตาอีก (ข้อมูลหุ้นยังเก็บไว้ ถ้ากลับมาก็ใช้ต่อได้)
    if (ev.type === "unfollow") {
      if (meta.users.includes(id) || meta.guests.includes(id)) {
        meta.users = meta.users.filter((u) => u !== id);
        meta.guests = meta.guests.filter((g) => g !== id);
        await saveMeta(env, meta);
      }
      continue;
    }
    if (!ev.replyToken) continue;

    if (register(meta, id)) await saveMeta(env, meta);

    const others = await Promise.all(meta.users.filter((u) => u !== id).map((u) => loadUser(env, u)));
    const ctx: Ctx = {
      id,
      isOwner: id === meta.owner,
      receiver: meta.users.includes(id),
      user: await loadUser(env, id),
      othersReceiving: others.filter(isReceiving).length,
    };

    if (ev.type === "follow") {
      const extra = ctx.receiver ? "" : `\n\n${statusLine(ctx)}`;
      await reply(env, ev.replyToken, [text(`สวัสดีครับ 👋\n${helpText(ctx.isOwner)}${extra}`)]);
    } else if (ev.type === "message" && ev.message?.type === "text")
      await reply(env, ev.replyToken, await handleCommand(env, ctx, meta, ev.message.text));
  }
  return new Response("ok");
}
