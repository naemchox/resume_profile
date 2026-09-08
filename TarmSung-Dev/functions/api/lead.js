/* =============================================================================
   /api/lead — ท่อรับใบสั่งงาน (Cloudflare Pages Function)

   ทำไมต้องมี ไม่ยิงจาก main.js ตรงไปที่ Apps Script เหมือนเดิม:
   1) เดิม URL ของ Apps Script ถูกพิมพ์ไว้ใน js/main.js ซึ่งใครเปิดดูซอร์สก็เห็น
      แล้วยิงตรงเข้าไปยัดขยะเต็มชีต หรือทำให้โควตารายวันเต็มจนใบสั่งจริงหล่นได้
      ตอนนี้ URL อยู่ฝั่งเซิร์ฟเวอร์ หน้าเว็บรู้จักแค่ /api/lead
   2) เดิมยิงด้วย mode:"no-cors" แปลว่าเบราว์เซอร์อ่านคำตอบไม่ได้เลย ฟอร์มจึงขึ้น
      "ส่งสำเร็จ" ทุกครั้ง แม้ Apps Script จะพัง โควตาเต็ม หรือ deploy ถูกถอน —
      ใบสั่งหายเงียบๆ โดยไม่มีใครรู้ ตัวนี้อ่านคำตอบจริงแล้วส่งสถานะจริงกลับไป

   ตั้งค่า: ถ้าอยากเปลี่ยน endpoint โดยไม่แก้โค้ด ใส่ตัวแปร LEAD_ENDPOINT ใน
   Cloudflare Pages → Settings → Environment variables แล้วมันจะถูกใช้ก่อนค่าสำรอง
   ========================================================================== */

const FALLBACK_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbypCjbtwd23ezmydPg6it7d95sJc4Yt-bEkMVVvueClJkIViBVlrZ5Ck-S_33lFN_Ss/exec";

const MAX_BODY = 8 * 1024;          // ใบสั่งงานยาวสุดที่รับ — กันคนยัดไฟล์เข้ามา

/* ---- ด่านกันยิงถล่ม -------------------------------------------------------
   ก่อนหน้านี้ใครก็ยิง POST เข้ามารัวๆ ได้ ทดสอบเองแล้ว 5 ครั้งติดผ่านหมด (21/8/26)
   ผลที่ตามมาไม่ใช่แค่ชีตเต็มขยะ แต่โควตาเขียนรายวันของ Apps Script จะหมด แล้ว
   "ใบสั่งงานจริงจะเด้งทิ้งเงียบๆ" โดยไม่มีใครรู้ — เสียลูกค้าโดยไม่รู้ตัว

   วิธี: ต้องขอโทเคนที่เซ็นชื่อไว้ (GET /api/lead) ก่อน แล้วแนบมากับใบสั่งงาน
   โทเคนมีอายุ 30 นาที และต้องมีอายุอย่างน้อย 1.5 วินาที — สคริปต์ที่ยิง POST
   ตรงๆ โดยไม่แวะขอโทเคนจะถูกปัดตกทันที ส่วนคนจริงไม่รู้สึกอะไรเลยเพราะหน้าเว็บ
   ขอโทเคนให้ตั้งแต่ตอนคลิกช่องแรกของฟอร์ม
   ความลับใช้ค่าจากตัวแปรแวดล้อม LEAD_SECRET ถ้าตั้งไว้ — ตั้งใน Cloudflare Pages
   แล้วหมุนได้โดยไม่ต้องแก้โค้ด (ค่าสำรองมีไว้ให้ทำงานได้ทันทีเท่านั้น) */
const TOKEN_TTL_MS = 30 * 60 * 1000;
const TOKEN_MIN_AGE_MS = 1500;
const FALLBACK_SECRET = "ts-lead-2026-08-21";

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(ts, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(ts))));
}
const secretOf = (env) => (env && env.LEAD_SECRET) || FALLBACK_SECRET;

async function tokenOk(token, env) {
  if (typeof token !== "string" || token.indexOf(".") < 1) return false;
  const [tsRaw, mac] = token.split(".");
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) return false;
  const age = Date.now() - ts;
  if (age < TOKEN_MIN_AGE_MS || age > TOKEN_TTL_MS) return false;
  return (await sign(ts, secretOf(env))) === mac;
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/* ปิดรับคำขอชั่วคราว 22/8/26 — ใบสั่งงานถูกถอดออกจากหน้าเว็บแล้ว (รับงานผ่าน Fastwork
   อย่างเดียว) ปลายทางนี้จึงไม่มีอะไรบนเว็บเรียกใช้ แต่ยังเปิดให้ยิงตรงได้ = ช่องให้ยัดขยะ
   ลงชีตและกินโควตา Apps Script รายวันฟรีๆ ปิดไว้ดีกว่าเปิดทิ้ง
   เปิดกลับ: ลบบล็อก DISABLED ข้างล่างนี้ทิ้ง แล้วเอาฟอร์มกลับเข้า index.html
   (ดู git: คอมมิต "ถอดใบสั่งงานออกทั้งก้อน") ตัวโค้ดข้างใต้ยังครบ ไม่ได้ลบ */
const DISABLED = true;

export async function onRequestPost({ request, env }) {
  if (DISABLED) return json({ result: "error", message: "ช่องทางนี้ปิดอยู่ — สั่งงานผ่าน Fastwork" }, 410);
  let data;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ result: "error", message: "ข้อความยาวเกินไป" }, 413);
    data = JSON.parse(raw);
  } catch {
    return json({ result: "error", message: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
  }

  /* ช่องล่อบอท: คนจริงไม่เคยเห็นช่องนี้ บอทกรอกทุกช่อง — ตอบสำเร็จไปเฉยๆ
     บอทที่ถูกบอกว่าล้มเหลวจะยิงซ้ำ ส่วน Apps Script ก็มีด่านเดียวกันนี้อีกชั้น */
  if (data && data.ts_note) return json({ result: "success" });

  /* โทเคนต้องผ่านก่อน ไม่งั้นไม่ต้องแตะโควตาของ Apps Script เลย
     ตอบ 403 พร้อมข้อความที่หน้าเว็บเอาไปบอกผู้ใช้ให้ลองใหม่ได้ */
  if (!(await tokenOk(data && data.ts_token, env))) {
    return json({ result: "error", message: "หมดเวลาส่งฟอร์ม กรุณากดส่งอีกครั้ง" }, 403);
  }

  // ไม่มีทั้งชื่อ อีเมล และเบอร์ = ไม่มีทางติดต่อกลับ ไม่ต้องเปลืองโควตาเขียนแถว
  if (!data || (!data.name && !data.email && !data.phone)) {
    return json({ result: "error", message: "กรุณากรอกชื่อและช่องทางติดต่อ" }, 400);
  }

  const endpoint = (env && env.LEAD_ENDPOINT) || FALLBACK_ENDPOINT;
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      redirect: "follow",            // Apps Script ตอบ 302 ไปหน้าที่มี JSON จริง
    });
    const text = await upstream.text();
    /* Apps Script ตอบ JSON เสมอเมื่อสคริปต์รันได้ ถ้าได้ HTML กลับมาแปลว่าเจอหน้า
       ล็อกอิน/หน้าขออนุญาต = deploy ถูกถอนหรือสิทธิ์เปลี่ยน ต้องรู้ ไม่ใช่กลืนไว้ */
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* ปล่อยเป็น null */ }
    if (parsed && parsed.result === "success") return json({ result: "success" });
    return json({ result: "error", message: (parsed && parsed.message) || "ปลายทางไม่ตอบรับใบสั่งงาน" }, 502);
  } catch (err) {
    return json({ result: "error", message: "ส่งไม่ถึงปลายทาง: " + String(err).slice(0, 120) }, 502);
  }
}

/* GET = ขอโทเคนสำหรับส่งฟอร์มหนึ่งครั้ง (และเป็นหน้า "ยังมีชีวิต" ไปในตัว)
   ไม่เก็บสถานะฝั่งเซิร์ฟเวอร์เลย — โทเคนพิสูจน์ตัวเองด้วยลายเซ็น จึงทำงานได้บน
   Pages Functions ที่ไม่มีหน่วยความจำร่วมระหว่างคำขอ */
export async function onRequestGet({ env }) {
  const ts = Date.now();
  return json({ result: "ok", token: ts + "." + (await sign(ts, secretOf(env))), ttl: TOKEN_TTL_MS });
}
