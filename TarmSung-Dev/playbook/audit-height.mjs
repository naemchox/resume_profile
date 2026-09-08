/* วัดความสูงหน้าบนมือถือจริง (390x844) — ใช้: node playbook/audit-height.mjs [--measure] [path…]
   (ต้องมีเซิร์ฟเวอร์ที่ 127.0.0.1:8098 หรือ 8099 — ตั้งพอร์ตเองด้วย AUDIT_BASE)
   path ที่ส่งเข้ามาได้ทั้ง /work/<slug>/index.html และไฟล์นอกรีโป (จะเปิดเป็น file://)

   ทำไมต้องมีไฟล์นี้: เดโม Dr.Delight ผ่านด่านเดิมทุกด่าน (มือถือไม่ล้น · ปุ่มไม่เล็ก ·
   ตัวหนังสือไม่เล็ก · fps ผ่าน) แต่คนเปิดแล้วบอกทันทีว่า "สูงเกินไป" เพราะไม่มีด่านไหน
   วัดความยาวหน้าเลย ของที่ยาว 9,000px บนจอ 844px = ต้องปัดนิ้ว 10 ครั้งกว่าจะถึงท้ายหน้า
   และ 3 ครั้งแรกยังอยู่ในการ์ดราคาชุดเดียวกันอยู่เลย

   สิ่งที่วัด (S1.3 ใน playbook/DEMO-SPEC.md):
   1. ความสูงทั้งหน้าเทียบเป็น "จำนวนจอ" ที่ 390x844 — เตือนอย่างเดียว ไม่ตก
   2. ทุก section สูงกี่จอ — ก้อนเดียวห้ามเกิน 3.5 จอ
   3. section ที่ 2 (ที่แรกหลัง hero) ห้ามเกิน 2.1 จอ — ตำแหน่งนั้นคือของบาง/ของพิสูจน์

   24/8/26 ตัวเลขทั้งหมดมาจากการวัดของจริง 13 ใบ ไม่ใช่เลขที่คิดเอาเอง และรอบแรกที่
   ตั้งกฎเป็น "เพดานความสูงทั้งหน้า" นั้น**ผิด**: dr-delight สูง 12.0 จอ ซึ่งสั้นกว่า
   ค่ามัธยฐานของเดโมที่ผ่านตาแล้ว (14.7 จอ) และสั้นกว่า the-bed ที่ 19.5 จอ เกือบเท่าตัว
   เพดานความสูงทั้งหน้าจึงจับของที่พังจริงไม่ได้เลย ของที่คนเรียกว่า "สูงเกินไป" คือ
   กำแพงเดียว 3,668px (4.3 จอ) ที่โผล่ทันทีหลัง hero ต่างหาก — section เดี่ยวที่ใหญ่
   ที่สุดในเดโมทั้งกอง (ของเดิมสูงสุด 3.4 จอ) กฎจึงต้องวัดต่อ section ตามตำแหน่ง

   --measure = พิมพ์ตัวเลขเปล่าๆ ไม่ตัดสิน (ใช้ตอนตั้งเพดานจากของจริง) */
import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:8098";
const args = process.argv.slice(2);
const MEASURE = args.includes("--measure");
const targets = args.filter((a) => !a.startsWith("--"));

/* เพดานมาจากการวัดเดโม 13 ใบที่ผ่านตาแล้ว ไม่ใช่เลขที่คิดเอาเอง (ดู DEMO-SPEC S1.3)
   ของเดิมที่สูงสุดในแต่ละช่อง: ทั้งหน้า the-bed 19.5 จอ · ก้อนเดียว the-bed amenities
   3.4 จอ · section ที่ 2 glow-clinic 1,722px = 2.04 จอ */
const WARN_SCREENS = 20;        /* ทั้งหน้า — เตือนเฉยๆ ไม่ตก เพราะยาวไม่ใช่ตัวปัญหา */
const MAX_SECTION_SCREENS = 3.5; /* ก้อนเดียวเกินนี้ = กำแพง */
const SLOT2_MAX_SCREENS = 2.1;   /* ที่แรกหลัง hero เกินนี้ = หนักผิดตำแหน่ง */

/* ไล่โฟลเดอร์เอง ไม่พิมพ์ลิสต์มือ — ลิสต์ที่พิมพ์มือเคยตกหล่นเดโมสองใบมาแล้ว (audit-mobile.mjs) */
const WORK = readdirSync(join(ROOT, "work"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, "work", d.name, "index.html")))
  .map((d) => d.name).sort();

/* ไฟล์ที่มีอยู่จริงบนดิสก์ = เปิดเป็น file:// (เดโมนอกรีโป เช่น dr-delight) ที่เหลือต่อท้าย BASE
   เดิมเช็คด้วย startsWith("/") แล้วพาธเต็มของ mac ถูกยิงเป็น URL → ได้หน้า 404 มาวัดแทน */
const pages = targets.length
  ? targets.map((t) => (existsSync(t) ? pathToFileURL(resolve(t)).href : BASE + t))
  : WORK.map((s) => `${BASE}/work/${s}/index.html`);

const measure = () => {
  const VH = window.innerHeight;
  /* หา "ส่วนของหน้า" แบบไม่ผูกกับแท็ก <section> — velvet-leaf ทั้งใบไม่มี <section> สักตัว
     ใช้ลูกตรงของ main/body ที่กว้างเต็มหน้าและสูงเกิน 80px แทน */
  const host = document.querySelector("main") || document.body;
  let secs = [...document.querySelectorAll("main > section, body > section")]
    .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height > 80);
  if (secs.length < 3) {
    secs = [...host.children].filter((el) => {
      const r = el.getBoundingClientRect();
      return el.offsetParent !== null && r.height > 80 && r.width > window.innerWidth * 0.8
        && !/^(header|nav|footer|script|style)$/i.test(el.tagName);
    });
  }
  /* นับ "การ์ดเรียงตั้ง": กลุ่มพี่น้องที่หน้าตาเหมือนกัน สูงเกิน 120px และวางซ้อนกันในแนวตั้ง
     (ซ้อนแนวตั้ง = ซ้ายตรงกัน) การ์ดที่วางเรียงข้างกันไม่ทำให้หน้ายาว จึงไม่นับ */
  const stackedCards = (sec) => {
    let best = 0;
    for (const box of [sec, ...sec.querySelectorAll(":scope > *, :scope > * > *")]) {
      const kids = [...box.children].filter((k) => k.getBoundingClientRect().height > 120);
      if (kids.length < 2) continue;
      const groups = {};
      for (const k of kids) {
        const sig = k.tagName + "." + (k.className || "").toString().split(/\s+/).slice(0, 2).join(".");
        (groups[sig] ||= []).push(k);
      }
      for (const g of Object.values(groups)) {
        const stacked = g.filter((k, i) => i === 0 || Math.abs(k.getBoundingClientRect().left - g[0].getBoundingClientRect().left) < 8);
        if (stacked.length > best) best = stacked.length;
      }
    }
    return best;
  };
  return {
    total: document.documentElement.scrollHeight,
    vh: VH,
    sections: secs.map((s, i) => ({
      i: i + 1,
      id: s.id || s.className.toString().split(/\s+/)[0] || s.tagName.toLowerCase(),
      h: Math.round(s.getBoundingClientRect().height),
      cards: stackedCards(s),
    })),
  };
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let fail = 0, blind = 0, dead = 0;

for (const url of pages) {
  const name = decodeURIComponent(url).replace(BASE, "").replace(/^.*\/(work\/[^/]+|[^/]+)\/index\.html$/, "$1");
  try {
    await page.goto(url, { waitUntil: "load", timeout: 20000 });
  } catch (e) {
    console.log(`⚠️  ${name} — เปิดไม่ได้: ${e.message.split("\n")[0]}`);
    dead++;
    continue;
  }
  /* ผ่านด่านยืนยันอายุก่อนวัด — ท่าเดียวกับ audit-scroll.mjs: velvet-leaf มีประตูคลุมทั้งหน้า
     ถ้าไม่กดผ่าน จะได้วัด "หน้าประตู" ที่นิ่งสนิทแล้วรายงานว่าไม่มีอะไรผิด = วัดไม่ถึง
     ของชนิดเดียวกันต้องใช้กลไกเดียวกัน จึงยกท่าจากด่านนั้นมาตรงๆ ไม่คิดท่าใหม่ */
  const gate = page.getByRole("button", { name: /yes,? i am 20|ใช่|20\+|ยอมรับ|accept/i }).first();
  if (await gate.count()) { await gate.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(900); }
  /* หน้า SPA (velvet-leaf คอมไพล์แล้วเหลือ <div id="root">) กว่าจะวาดเสร็จช้ากว่า load
     ถ้าไม่รอ จะวัดได้ 844px / 0 section แล้วขึ้น ✅ ทั้งที่ด่านไม่เคยเห็นหน้านั้นเลย */
  try {
    await page.waitForFunction(() => document.body.innerText.trim().length > 400, { timeout: 8000 });
  } catch { /* ปล่อยให้ไปตกที่ด่าน "วัดไม่ได้" ข้างล่าง */ }
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  const r = await page.evaluate(measure);
  const screens = r.total / r.vh;

  /* วัดไม่ได้ ≠ ผ่าน — หน้าที่ไม่มีเนื้อให้วัดต้องฟ้อง ไม่ใช่ขึ้นเขียวเงียบๆ */
  if (r.sections.length === 0 || screens < 1.5) {
    blind++;
    console.log(`⚠️  ${name} — วัดไม่ได้: สูง ${r.total}px, หา section ไม่เจอ (หน้ายังไม่วาด หรือเนื้อไม่ได้อยู่ใน main/body)`);
    continue;
  }

  if (MEASURE) {
    console.log(`${name.padEnd(26)} ${String(r.total).padStart(6)}px  ${screens.toFixed(1).padStart(5)} จอ  section=${r.sections.length}  ` +
      r.sections.map((s) => `${s.i}:${s.id}=${s.h}px${s.cards >= 3 ? `/${s.cards}ใบ` : ""}`).join(" · "));
    continue;
  }

  const bad = [], warn = [];
  if (screens > WARN_SCREENS) warn.push(`หน้ายาว ${screens.toFixed(1)} จอ (${r.total}px) — เกินของที่ยาวที่สุดที่เคยส่ง`);
  const s2 = r.sections[1];
  if (s2 && s2.h / r.vh > SLOT2_MAX_SCREENS) {
    bad.push(`section ที่ 2 (${s2.id}) สูง ${(s2.h / r.vh).toFixed(1)} จอ = ${s2.h}px${s2.cards >= 3 ? ` การ์ดเรียงตั้ง ${s2.cards} ใบ` : ""} ` +
      `— ที่แรกหลัง hero ต้องเป็นของบาง/ของพิสูจน์ (เพดาน ${SLOT2_MAX_SCREENS} จอ)`);
  }
  for (const s of r.sections) {
    const sc = s.h / r.vh;
    if (sc > MAX_SECTION_SCREENS) bad.push(`section ${s.i} (${s.id}) เป็นกำแพง ${sc.toFixed(1)} จอ = ${s.h}px` +
      `${s.cards >= 3 ? ` (การ์ดเรียงตั้ง ${s.cards} ใบ)` : ""} — ซอยเป็นสองส่วน หรือเปลี่ยนเครื่องมือแสดงผล (ตาราง/accordion/แท็บ) ห้ามตัดเนื้อหาลูกค้าทิ้ง`);
  }

  if (bad.length) { fail++; console.log(`❌ ${name} (${screens.toFixed(1)} จอ)`); bad.forEach((x) => console.log(`   · ${x}`)); }
  else console.log(`✅ ${name} — ${screens.toFixed(1)} จอ, ${r.sections.length} section`);
  warn.forEach((x) => console.log(`   ⚠️  ${x}`));
}

await b.close();
if (!MEASURE) {
  const bits = [];
  if (fail) bits.push(`${fail} หน้าไม่ผ่านด่านความสูง (S1.3)`);
  if (blind) bits.push(`${blind} หน้าวัดไม่ได้ — ต้องตามให้วัดได้ ไม่ใช่ปล่อยผ่าน`);
  /* เหมือน audit-nav.mjs: เปิดไม่ได้สักหน้า = ไม่ได้ตรวจ ห้ามพิมพ์ว่าผ่าน */
  if (dead >= pages.length) {
    console.error(`\n✗ ด่านนี้เปิดหน้าไม่ได้สักหน้า (${pages.length} หน้า) — ไม่ใช่ "ผ่าน" แต่คือ "ไม่ได้ตรวจ"`);
    console.error(`  เซิร์ฟเวอร์ที่ ${BASE} ขึ้นอยู่หรือเปล่า · ตั้งพอร์ตเองด้วย AUDIT_BASE=http://127.0.0.1:<port>`);
    process.exit(2);
  }
  console.log("\n" + (bits.length ? bits.join(" · ") : "ผ่านด่านความสูงทุกหน้า"));
}
process.exit((fail || blind) && !MEASURE ? 1 : 0);
