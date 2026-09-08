/* ด่านตรวจ: ชี้การ์ดแล้ว "ตอบสนองจริงไหม" — ทั้งตอนการ์ดนิ่งแล้ว และตอนการ์ดกำลังไหลเข้ามา
   เหตุที่ต้องมี: hover ของทุกการ์ดเคยถูกล็อกไว้จนกว่าอนิเมชันขาเข้าจะจบ (.settled)
   ระหว่างนั้นชี้แล้วไม่มีอะไรเกิดขึ้นเลย ตอนนี้ย้ายไปเขียนบน translate/scale ซึ่งซ้อนกับ
   transform ของขาเข้าได้ ด่านนี้ตรวจ "คุณสมบัติ" คือ ชี้แล้วต้องตอบสนองภายใน 200ms เสมอ
   ใช้: node playbook/audit-hover.mjs [url]   (ค่าเริ่มต้น http://localhost:8124/) */
import { webkit, chromium } from "playwright";

const URL_ = process.argv[2] || "http://localhost:8124/";
/* .svc.card--hover ไม่อยู่ในหน้านี้แล้ว (บริการเป็นบอร์ดเมนู ไม่ใช่การ์ด) — กฎยังอยู่ในสไตล์ชีต
   เผื่อหน้าอื่น ถ้าวันไหนกลับมาใช้ ให้เติมกลับเข้าลิสต์นี้ */
const CARDS = [
  ["การ์ดทีม",       ".team-grid .member.card--hover"],
  ["การ์ดผลงาน",     ".card.work"],
  ["การ์ดราคา",      ".card.price"],
  ["คำถามที่พบบ่อย", ".faq details:not([open])"],
];

/* อ่านเฉพาะสิ่งที่ hover เขียน — ไม่อ่าน transform เพราะนั่นเป็นของอนิเมชันขาเข้า */
const READ = (el) => { const c = getComputedStyle(el);
  return { translate: c.translate, scale: c.scale, shadow: c.boxShadow, border: c.borderColor }; };
const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
const shifted = (s) => (s.translate && s.translate !== "none") || (s.scale && s.scale !== "none" && s.scale !== "1");

/* การ์ดบางใบถูกซ่อน (display:none) เช่นผลงานฉบับกริดตอนหน้าใช้คลิปแทน — เอาใบที่เห็นจริง */
const pickVisible = async (page, sel) => page.evaluateHandle(([s]) => {
  for (const el of document.querySelectorAll(s)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none") return el;
  }
  return null;
}, [sel]);

let fails = 0, checks = 0;
for (const [name, engine] of [["WebKit", webkit], ["Chromium", chromium]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL_, { waitUntil: "load" });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  for (const [label, sel] of CARDS) {
    const h = await pickVisible(page, sel);
    if (!(await h.evaluate((el) => !!el))) { console.log(`⚠️  ${name} · ${label}: ไม่เจอใบที่มองเห็น (${sel})`); continue; }
    await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1600);                       // ปล่อยให้ขาเข้าจบก่อน
    const before = await h.evaluate(READ);
    const box = await h.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40 }; });
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(500);
    const after = await h.evaluate(READ);
    checks++;
    if (!changed(before, after)) { fails++; console.log(`❌ ${name} · ${label} (นิ่งแล้ว): ชี้แล้วไม่มีอะไรเปลี่ยน ${JSON.stringify(after)}`); }
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
  }

  /* ข้อที่เป็นบั๊กจริง: ชี้ "ระหว่าง" การ์ดทีมไหลเข้า (ขาเข้ายาว 1100ms) ต้องขยับทันที */
  await page.goto(URL_, { waitUntil: "load" });
  const team = await pickVisible(page, ".team-grid .member.card--hover");
  await team.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForFunction((s) => document.querySelector(s)?.classList.contains("in"), ".team-grid .member.card--hover", { timeout: 5000 });
  const b2 = await team.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40 }; });
  await page.mouse.move(b2.x, b2.y);
  await page.waitForTimeout(200);                          // ขาเข้ายังวิ่งอยู่แน่นอน
  const mid = await team.evaluate(READ);
  const still = await team.evaluate((el) => el.getAnimations().some((a) => a.playState === "running"));
  checks++;
  if (!shifted(mid)) { fails++; console.log(`❌ ${name} · การ์ดทีม (กำลังไหลเข้า, ขาเข้ายังวิ่ง=${still}): ชี้ 200ms แล้วยังไม่ขยับ ${JSON.stringify(mid)}`); }
  await browser.close();
}
console.log(fails ? `🔴 hover ${fails}/${checks} ตก` : `🟢 hover ผ่าน ${checks}/${checks} (ชี้แล้วตอบสนอง ทั้งตอนนิ่งและตอนไหลเข้า)`);
process.exit(fails ? 1 : 0);
