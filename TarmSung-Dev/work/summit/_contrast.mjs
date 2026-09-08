/* วัด contrast จริงจากพิกเซลที่เรนเดอร์ออกมา ไม่ใช่เดาจากค่าสีใน CSS
   ตัวหนังสือทับรูปถ่าย: พื้นหลังไม่ใช่สีเดียว และตัวอักษรหลายจุดเป็นสีโปร่ง (rgba)
   => ถ่ายสองรูปที่กรอบเดียวกัน: (A) ปกติ  (B) ซ่อนตัวอักษรด้วย visibility:hidden
      แล้วเทียบ "ทีละพิกเซล" ระหว่างตัวอักษรที่ composite แล้วกับพื้นหลังใต้มันจริงๆ
   รัน: node work/summit/_contrast.mjs [outdir]   (จากรากโปรเจกต์ playwright ถึงจะ resolve เจอ)
   คำนวณต่อที่ _contrast.py */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/tmp/summit-contrast";
mkdirSync(OUT, { recursive: true });

const TARGETS = [
  [".hero .eyebrow",           "hero eyebrow"],
  [".hero p",                  "hero paragraph"],
  [".banner-content .eyebrow", "banner eyebrow"],
  [".banner p",                "banner paragraph"],
  [".stat-label",              "stat label"],
  [".stat-sub",                "stat sub"],
  [".cat-meta span",           "category 'shop now'"],
  [".col-meta p",              "collection blurb"],
  [".feature-icon svg",        "feature icon on its fill", "graphic"],
];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await p.goto("file://" + process.cwd() + "/work/summit/index.html", { waitUntil: "load" });
await p.waitForTimeout(1200);

const rows = [];
for (let i = 0; i < TARGETS.length; i++) {
  const [sel, label, kind] = TARGETS[i];
  const el = await p.$(sel);
  if (!el) { console.log("?? ไม่เจอ", sel); continue; }
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(1800);               // ให้ reveal/fill จบก่อนวัด
  const box = await el.boundingBox();
  if (!box || box.width < 2 || box.height < 2) { console.log("?? วัดไม่ได้", sel); continue; }
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
  const info = await el.evaluate((e) => {
    const cs = getComputedStyle(e);
    return { size: parseFloat(cs.fontSize), weight: cs.fontWeight };
  });
  await p.screenshot({ path: `${OUT}/${i}-a.png`, clip });
  await el.evaluate((e) => { e.dataset.vis = e.style.visibility; e.style.visibility = "hidden"; });
  await p.screenshot({ path: `${OUT}/${i}-b.png`, clip });
  await el.evaluate((e) => { e.style.visibility = e.dataset.vis || ""; });
  rows.push({ a: `${OUT}/${i}-a.png`, b: `${OUT}/${i}-b.png`, label, kind, ...info });
}
writeFileSync(`${OUT}/targets.json`, JSON.stringify(rows, null, 2));
console.log("วัด", rows.length, "จุด ->", OUT);
await b.close();
