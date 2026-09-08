/* ตัวเฝ้าเว็บ — เช็คว่าเว็บจริงยัง "พูดสิ่งที่เราตั้งใจให้พูด" อยู่ไหม
   ใช้:  node playbook/watch-site.mjs           ตรวจ (ต่างจากค่าอ้างอิง = แจ้งเตือน + exit 1)
        node playbook/watch-site.mjs --save    บันทึกสถานะปัจจุบันเป็นค่าอ้างอิง

   ทำไมต้องมี: ถ้าบัญชี Cloudflare หรือ GitHub หลุด คนที่เข้าถึงได้จะแก้หน้าเว็บเป็นอะไร
   ก็ได้ — รวมถึงเปลี่ยนเบอร์โทร ไลน์ หรือใส่เลขบัญชีปลอมให้ลูกค้าโอนเงินผิดคน — และเรา
   จะรู้ตัวช้ามาก เพราะไม่มีใครมาบอก ตัวนี้เปิดหน้าเว็บจริงด้วยเบราว์เซอร์ (ไม่ใช่แค่ดึง
   HTML ดิบ เพราะข้อมูลติดต่อบางส่วนถูกใส่ด้วย JavaScript) แล้วเทียบกับค่าที่เรายืนยันไว้

   ตรวจอะไรบ้าง: เบอร์/ไลน์/อีเมล · ราคาทุกแพ็กเกจ · คำรับประกัน · จำนวนการ์ดผลงาน ·
   ปลายทางฟอร์ม · สคริปต์/iframe/ฟอร์มที่ชี้ออกนอกโดเมน (ช่องทางฝังโค้ดแปลกปลอม) ·
   คำที่ไม่ควรโผล่ เช่น เลขบัญชี/พร้อมเพย์
*/
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://tarmsung.pages.dev";
const REF_FILE = join(ROOT, "playbook", "site-fingerprint.json");
const SAVE = process.argv.includes("--save");

/* คำที่ไม่ควรโผล่บนหน้าเว็บนี้เลย — ถ้าโผล่แปลว่ามีคนใส่ช่องทางรับเงินเข้ามา */
const FORBIDDEN = [/พร้อมเพย์/, /เลขที่บัญชี/, /เลขบัญชี/, /ธนาคาร\s*[:：]?\s*\d/, /\b\d{3}-\d-\d{5}-\d\b/];

/* ต้องดูสองหน้า: หน้าแรกคือที่ราคาและการ์ดผลงานอยู่ ส่วนเบอร์โทรกับอีเมลอยู่ในหน้า
   privacy เท่านั้น (ตรวจแล้ว 21/8/26) — ถ้าเฝ้าแค่หน้าแรกจะมองไม่เห็นวันที่มีคนแก้
   ช่องทางติดต่อ ซึ่งเป็นจุดที่อันตรายที่สุด */
const PAGES = ["/", "/privacy.html"];

async function readOne(p, path) {
  await p.goto(BASE + path + "?cb=" + Date.now(), { waitUntil: "load", timeout: 90000 });
  await p.waitForTimeout(2000);
  return await p.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    const uniq = (a) => [...new Set(a)].sort();
    const origin = (u) => { try { return new URL(u, location.href).origin; } catch { return u; } };
    return {
      phones: uniq([...t.matchAll(/0\d{1,2}[- ]\d{3}[- ]\d{4}(?!\d)/g)].map((m) => m[0].replace(/\s/g, "-"))),
      lines: uniq([...document.querySelectorAll('a[href*="line."]')].map((a) => a.getAttribute("href"))),
      mails: uniq([...t.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)].map((m) => m[0])),
      prices: uniq([...t.matchAll(/฿\s?[\d,]+/g)].map((m) => m[0].replace(/\s/g, ""))),
      warranty: uniq([...t.matchAll(/รับประกัน[^·|]{0,28}/g)].map((m) => m[0].trim())),
      cards: document.querySelectorAll(".card.work").length,
      extScripts: uniq([...document.querySelectorAll("script[src]")].map((s) => origin(s.src)).filter((o) => o !== location.origin)),
      frames: uniq([...document.querySelectorAll("iframe[src]")].map((f) => origin(f.src))),
      formActions: uniq([...document.querySelectorAll("form")].map((f) => f.getAttribute("action") || "(js)")),
      text: t,
    };
  });
}

async function readSite() {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const parts = [];
  for (const path of PAGES) parts.push(await readOne(p, path));
  await b.close();
  const u = (k) => [...new Set(parts.flatMap((x) => x[k]))].sort();
  return {
    phones: u("phones"), lines: u("lines"), mails: u("mails"), prices: u("prices"),
    warranty: u("warranty"), extScripts: u("extScripts"), frames: u("frames"),
    formActions: u("formActions"),
    cards: parts[0].cards,                    // การ์ดผลงานนับจากหน้าแรกเท่านั้น
    text: parts.map((x) => x.text).join(" "),
  };
}

const notify = (title, msg) => {
  try {
    execFileSync("osascript", ["-e",
      `display notification ${JSON.stringify(msg.slice(0, 200))} with title ${JSON.stringify(title)} sound name "Basso"`]);
  } catch { /* ไม่มี osascript ก็ปล่อย — ข้อความยังขึ้นใน log */ }
};

const snap = await readSite();

/* ปลายทางฟอร์มต้องยังมีชีวิตและยังแจกโทเคน — ถ้าถูกเปลี่ยนไปชี้ที่อื่น อันนี้จะรู้ */
let leadOk = false;
try {
  const r = await fetch(BASE + "/api/lead");
  const j = await r.json();
  leadOk = !!(j && j.result === "ok" && typeof j.token === "string" && j.token.includes("."));
} catch { leadOk = false; }

const now = { phones: snap.phones, lines: snap.lines, mails: snap.mails, prices: snap.prices,
              warranty: snap.warranty, cards: snap.cards, extScripts: snap.extScripts,
              frames: snap.frames, formActions: snap.formActions, leadOk };

if (SAVE) {
  writeFileSync(REF_FILE, JSON.stringify(now, null, 2) + "\n");
  console.log("บันทึกค่าอ้างอิงแล้ว →", REF_FILE);
  console.log(JSON.stringify(now, null, 2));
  process.exit(0);
}

if (!existsSync(REF_FILE)) {
  console.error("ยังไม่มีค่าอ้างอิง — รัน  node playbook/watch-site.mjs --save  ก่อนหนึ่งครั้ง");
  process.exit(2);
}
const ref = JSON.parse(readFileSync(REF_FILE, "utf8"));
const problems = [];
const cmp = (k, label) => {
  const a = JSON.stringify(ref[k]), b = JSON.stringify(now[k]);
  if (a !== b) problems.push(`${label}\n     เดิม: ${a}\n     ตอนนี้: ${b}`);
};
cmp("phones", "เบอร์โทรบนหน้าเว็บเปลี่ยน");
cmp("lines", "ลิงก์ไลน์เปลี่ยน");
cmp("mails", "อีเมลเปลี่ยน");
cmp("prices", "ราคาบนหน้าเว็บเปลี่ยน");
cmp("warranty", "ข้อความรับประกันเปลี่ยน");
cmp("extScripts", "มีสคริปต์จากโดเมนอื่นโผล่/หายไป");
cmp("frames", "iframe จากโดเมนอื่นเปลี่ยน");
cmp("formActions", "ปลายทางของฟอร์มเปลี่ยน");
if (now.cards !== ref.cards) problems.push(`จำนวนการ์ดผลงานเปลี่ยน: ${ref.cards} → ${now.cards}`);
if (!now.leadOk) problems.push("ปลายทางฟอร์ม /api/lead ไม่ตอบหรือตอบผิดรูปแบบ — ใบสั่งงานอาจส่งไม่ถึง");
for (const re of FORBIDDEN) if (re.test(snap.text)) problems.push(`พบคำที่ไม่ควรอยู่บนหน้านี้: ${re}`);

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
if (!problems.length) { console.log(`[${stamp}] ✓ เว็บยังเป็นของเราทุกจุดที่ตรวจ`); process.exit(0); }
console.error(`[${stamp}] ✗ เจอ ${problems.length} จุดที่เปลี่ยนไปโดยไม่ได้ตั้งใจ:`);
problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`));
notify("tarmsung.pages.dev เปลี่ยนไป!", problems[0].split("\n")[0]);
process.exit(1);
