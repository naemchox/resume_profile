/* ความสอดคล้องของ "หัวเว็บหดตอนเลื่อน" ข้ามเดโมทั้งกอง — ใช้: node playbook/audit-nav.mjs
   ต้องมีเซิร์ฟเวอร์ที่ 127.0.0.1:8098 (ตั้งเองด้วย AUDIT_BASE)

   ทำไมต้องมีไฟล์นี้: ด่านที่มีอยู่ตรวจ "หัวเว็บของใบนี้เตี้ยลงไหม" ทีละใบ ซึ่งผ่านหมดทั้งกอง
   แต่ไม่มีใครตรวจว่า 13 ใบนั้นใช้ **กลไกเดียวกัน** หรือเปล่า — วัดจริง 24/8/26 เจอ 3 ชื่อคลาส
   (small · is-small · is-stuck ยังไม่นับ condensed ที่ homecraft ใส่ซ้อน) และ 3 วิธีหด
   (min-height ของลูก · padding ของลูก · padding ของ header เอง) ทั้งที่คอมเมนต์ในโค้ดเขียนเอง
   ว่า "ทุกเดโมใช้บล็อกนี้ชุดเดียวกัน ต่างได้แค่ตัวเลข"

   ผลลัพธ์เหมือนกันแต่คนละกลไก = บั๊กที่รอเวลา · แก้ที่ใบเดียวแล้วอีก 12 ใบไม่ได้ตาม
   นี่คือรูปแบบเดียวกับที่ทำให้ summit เกยออกนอกแถบ 20px อยู่เป็นเดือนโดยไม่มีใครรู้

   ด่านนี้ไม่ได้บังคับให้รื้อวันนี้ — มันบังคับว่า **ของใหม่ต้องเข้ารูป** และหนี้ต้องมองเห็น */
import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:8098";
const DEMOS = readdirSync(join(REPO, "work"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(REPO, "work", d.name, "index.html")))
  .map((d) => d.name).sort();

/* กลไกที่ตกลงกันไว้ (LOG-DEMO §15) — ยุบเหลือกลไกเดียวจริงแล้ว 26/8/26
   สวิตช์ = คลาส .small ตัวเดียว · ตัวหด = ก้อนกลาง playbook/snippets/nav-shrink.css
   ก้อนกลางสั่งลูกของแถบสองอย่างในกฎเดียว: padding = var(--nav-pad-small) และ min-height = 0
   ใบไหนจะ "เปลี่ยนจริง" กี่ค่าขึ้นกับค่าฐานของใบนั้น (ใบที่ลูกไม่เคยตั้ง min-height ก็เห็นแค่ padding)
   นั่นคือข้อมูล ไม่ใช่คนละกลไก — ที่ห้ามคือหดด้วยตัวแถบเอง (height/padding ของ header) */
const OK_CLASS = "small";
const OK_MECHS = new Set(["ลูก-padding", "ลูก-min-height"]);

/* ใบที่ไม่เข้ากติกาโดยตั้งใจ — ข้อยกเว้นที่ไม่มีคำอธิบาย = บั๊ก */
const EXCEPT = {
  "velvet-leaf": "บันเดิล React ที่คอมไพล์แล้ว ไม่มีซอร์สในรีโป — เปลี่ยนกลไกต้องรื้อบันเดิล",
  "parcela": "ใบนี้ไม่มีหัวเว็บหดตั้งแต่ต้น (แถบไม่ติดหน้าจอ)",
  "the-bed": "เจ้าของทักว่าตัวหนังสือในแถบกระโดดตอนเลื่อน (25/8/26) จึงตรึงแถบไม่ให้หด — ดู #navShell ใน index.html",
  "teung-chao": "อาการเดียวกับ the-bed เป๊ะ — เจ้าของทักว่าของในแถบกระโดดตอนเลื่อนพ้นฮีโร่ (31/8/26) " +
    "วัดแล้ว: หัวข้อฮีโร่ไม่ขยับเลย (top 163.1px · 61px คงที่ทุกค่า y) ตัวที่ขยับคือแถบ 80.4→60.4px " +
    "ใน 'เฟรมเดียว' ที่ y=123 ทำให้ของในแถบกระโดด 10px ทันที — เป็นสแนปตามที่ก้อนกลางตั้งใจ " +
    "(ห้าม transition padding เพราะเป็น layout property · DEMO-SPEC S2.3) จึงตรึงแถบด้วยเหตุผลเดียวกับ the-bed",
};

const snap = () => {
  const h = document.querySelector("header, .site-header, nav.site-header");
  if (!h) return null;
  const cs = getComputedStyle(h);
  const kid = h.firstElementChild ? getComputedStyle(h.firstElementChild) : null;
  return {
    cls: h.className.toString(),
    H: Math.round(h.getBoundingClientRect().height),
    ownPad: cs.paddingTop + "/" + cs.paddingBottom,
    ownMinH: cs.minHeight,
    kidPad: kid ? kid.paddingTop + "/" + kid.paddingBottom : "-",
    kidMinH: kid ? kid.minHeight : "-",
  };
};

const b = await chromium.launch();
const rows = [];
for (const s of DEMOS) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await p.goto(`${BASE}/work/${s}/index.html`, { waitUntil: "load", timeout: 20000 });
    /* ประตูยืนยันอายุ — ท่าเดียวกับด่านอื่นทุกตัว */
    const gate = p.getByRole("button", { name: /yes,? i am 20|ใช่|20\+|ยอมรับ|accept/i }).first();
    if (await gate.count()) { await gate.click({ timeout: 2500 }).catch(() => {}); await p.waitForTimeout(700); }
    await p.waitForTimeout(600);
    const a = await p.evaluate(snap);
    await p.mouse.wheel(0, 500);
    await p.waitForTimeout(700);
    const c = await p.evaluate(snap);
    if (!a) { rows.push({ s, note: "ไม่มี header" }); await p.close(); continue; }

    /* ชื่อคลาสที่ถูกเติมตอนเลื่อน = ตัวสวิตช์ของใบนี้ */
    /* .stuck ไม่ใช่ "กลไกหด" — มันคือการสลับพื้นหัวเว็บตอนเลื่อนพ้นฮีโร่ (js/main.js
       "หัวเว็บที่เปลี่ยนพื้นเมื่อเลื่อนพ้นฮีโร่") ซึ่งเดโมที่มีฮีโร่รูปเต็มจอทุกใบมี
       ด่านนี้เคยไม่เจอเพราะฮีโร่ของใบเก่าสูงพอที่ยังค้างในจอตอนวัด — พอ teung-chao
       ดึงบล็อกถัดไปขึ้นมาคาบฮีโร่ (.lift) มันเลยยิงก่อน แล้วด่านฟ้องว่า "สองกลไก"
       ทั้งที่กลไกหดยังมีตัวเดียว = ด่านนับผิดประเภท ไม่ใช่หน้าเว็บผิด (แก้ 31/8/26) */
    const NOT_SHRINK = new Set(["stuck"]);
    const before = new Set(a.cls.split(/\s+/)), added = c.cls.split(/\s+/).filter((x) => x && !before.has(x) && !NOT_SHRINK.has(x));
    const mech = [];
    if (a.kidPad !== c.kidPad) mech.push("ลูก-padding");
    if (a.kidMinH !== c.kidMinH) mech.push("ลูก-min-height");
    if (a.ownPad !== c.ownPad) mech.push("header-padding");
    if (a.ownMinH !== c.ownMinH) mech.push("header-min-height");
    rows.push({ s, added, mech, shrink: a.H !== c.H ? `${a.H}→${c.H}` : "ไม่หด" });
  } catch (e) {
    rows.push({ s, note: "เปิดไม่ได้: " + String(e).split("\n")[0].slice(0, 40) });
  }
  await p.close();
}
await b.close();

const live = rows.filter((r) => !r.note && r.shrink !== "ไม่หด" && !EXCEPT[r.s]);
const classes = new Set(live.flatMap((r) => r.added));
const mechs = new Set(live.flatMap((r) => r.mech));
const offenders = [];

for (const r of rows) {
  if (r.note) { console.log(`⚠️  ${r.s.padEnd(20)} ${r.note}`); continue; }
  if (EXCEPT[r.s]) {
    console.log(`⚪ ${r.s.padEnd(20)} ${r.shrink.padEnd(10)} ข้อยกเว้น: ${EXCEPT[r.s]}`);
    continue;
  }
  const okC = r.added.length === 1 && r.added[0] === OK_CLASS;
  const okM = r.mech.length > 0 && r.mech.every((m) => OK_MECHS.has(m));
  const mark = okC && okM ? "✅" : "❌";
  console.log(`${mark} ${r.s.padEnd(20)} ${r.shrink.padEnd(10)} คลาส: ${(r.added.join("+") || "-").padEnd(18)} กลไก: ${r.mech.join("+") || "-"}`);
  if (!(okC && okM)) offenders.push(r.s);
}

console.log(`\nสรุปข้ามใบ — ชื่อคลาสที่ใช้จริง ${classes.size} แบบ: ${[...classes].join(" · ")}`);
console.log(`            วิธีหดที่ใช้จริง ${mechs.size} แบบ: ${[...mechs].join(" · ")}`);
/* ด่านที่เดิน 0 ใบแล้วยังตอบ ✅ = ด่านโกหก (โรคเดียวกับ audit-multi.mjs ที่แก้ไป 27/8/26
   แต่ตอนนั้นแก้แค่ใบเดียว ไม่ได้ไล่ทั้งประเภท) เซิร์ฟเวอร์ไม่ขึ้น/ผิดพอร์ต = ทุกหน้าเปิดไม่ได้
   live เหลือ 0 แล้ว offenders ก็ 0 → พิมพ์ "ผ่าน (0 ใบ)" ทั้งที่ไม่ได้ตรวจอะไรเลย */
if (live.length === 0) {
  console.error(`\n✗ ด่านนี้เปิดหน้าไม่ได้สักใบ (${DEMOS.length} ใบในโฟลเดอร์ work/) — ไม่ใช่ "ผ่าน" แต่คือ "ไม่ได้ตรวจ"`);
  console.error(`  เซิร์ฟเวอร์ที่ ${BASE} ขึ้นอยู่หรือเปล่า · ตั้งพอร์ตเองด้วย AUDIT_BASE=http://127.0.0.1:<port>`);
  process.exit(2);
}
const fail = offenders.length > 0;
console.log(fail
  ? `\n❌ ยังมีใบที่ไม่เข้ากติกา: ${offenders.join(" · ")}\n` +
    `   ที่ตกลงกันไว้คือคลาส .${OK_CLASS} + หดด้วยก้อนกลาง (padding/min-height ของลูก) ห้ามหดที่ตัวแถบเอง\n` +
    `   ก้อนกลาง: playbook/snippets/nav-shrink.css · กระจายด้วย node playbook/sync-nav-shrink.mjs`
  : `\n✅ ทุกใบที่อยู่ในกติกาใช้กลไกเดียวกัน (${live.length} ใบ) · ข้อยกเว้นที่ประกาศไว้ ${Object.keys(EXCEPT).length} ใบ`);
process.exit(fail ? 1 : 0);
