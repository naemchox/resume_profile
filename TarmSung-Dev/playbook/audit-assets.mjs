/* ของลูกค้าครบไหม — ใช้: node playbook/audit-assets.mjs --ref <โฟลเดอร์ของลูกค้า> --demo <index.html>
   ตรวจ DEMO-SPEC S1.1: รูปที่ลูกค้าให้มาต้องถูกใช้ทุกใบ · ห้ามเหลือกรอบ placeholder ว่างในหน้า

   ทำไมต้องมีไฟล์นี้: dr-delight ส่งรูปจริงของคลินิกมา 4 ใบ แล้วมันนอนอยู่ใน `_ref/promo-full/`
   ไม่ถูกใช้เลยสักใบ หน้าไปใช้รูปเครื่องมือ/นางแบบทั่วไปแทน แถมเหลือกรอบ `.slot` ว่างโชว์อยู่
   ไม่มีด่านไหนในกองมองเห็น เพราะทุกด่านตรวจ "หน้าที่ทำออกมา" ไม่มีใครเทียบกับ "ของที่ลูกค้าให้"

   เทียบสองชั้น: ชื่อไฟล์ **และขนาดพิกเซลจริง** — ชั้นแรกอย่างเดียวไม่พอ รอบแรกที่เขียนด่านนี้
   ใช้ชื่อไฟล์อย่างเดียวแล้วรายงานว่า dr-delight ใช้รูปลูกค้า "0 ใบ" ทั้งที่ของจริงใช้อยู่ 8 ใบ
   (ถูกเปลี่ยนชื่อตอนย้ายเข้าโปรเจกต์ เช่น af1ab455.png → t-cutera.png ขนาด 428×231 เท่ากันเป๊ะ)
   = ด่านที่ฟ้องผิดด้านนี้อันตรายกว่าไม่มีด่าน เพราะมันสั่งให้ไปยัดรูปที่ใช้อยู่แล้วเข้าไปซ้ำ
   ที่ยังหลุดได้คือรูปที่ถูก**ครอป**จนขนาดเปลี่ยน — รายงานแยกเป็น "ไม่แน่ใจ" ไม่ใช่ "ไม่ได้ใช้" */
import { chromium } from "playwright";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, extname, basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const REF = arg("--ref"), DEMO = arg("--demo"), INV = arg("--inv");
/* S1.1 เปิดช่องให้ "ไม่ใช้ได้ ถ้าเขียนเหตุผลกำกับ" — ช่องนั้นต้องมีที่อยู่จริง ไม่งั้นมันคือช่องลม
   ไฟล์ inventory คือที่นั้น: เขียนชื่อไฟล์ + เหตุผลไว้ แล้วด่านจะนับว่าใบนั้นถูกตัดสินใจแล้ว */
const invText = INV && existsSync(INV) ? readFileSync(INV, "utf8").toLowerCase() : "";
if (!REF || !DEMO) { console.log("ใช้: node playbook/audit-assets.mjs --ref <โฟลเดอร์ลูกค้า> --demo <index.html>"); process.exit(2); }
if (!existsSync(REF) || !existsSync(DEMO)) { console.log("❌ หาไฟล์/โฟลเดอร์ไม่เจอ"); process.exit(2); }

const IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg"]);
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (IMG.has(extname(e).toLowerCase())) out.push(p);
  }
  return out;
};

/* ตัดส่วนท้ายที่เป็นขนาด/เวอร์ชัน (-760, @2x, -sm) ออกก่อนเทียบ ไม่งั้นรูปเดียวกันที่ย่อแล้วจะนับว่าไม่ได้ใช้ */
const key = (f) => basename(f, extname(f)).toLowerCase().replace(/[@-](\d+x|\d{2,4}|sm|md|lg|thumb|small|big)$/g, "");

const refImgs = walk(REF);
const html = readFileSync(DEMO, "utf8").toLowerCase();
const byName = (f) => html.includes(key(f)) || html.includes(basename(f).toLowerCase());
const explained = (f) => invText.includes(basename(f).toLowerCase()) || invText.includes(key(f));

/* กรอบว่างที่คนเปิดหน้าจะเห็นจริง — วัดจากหน้าที่เรนเดอร์แล้ว ไม่ใช่เดาจากชื่อคลาส */
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(resolve(DEMO)).href, { waitUntil: "load" });
await page.waitForTimeout(600);
/* ต้องเลื่อนให้สุดหน้าก่อน ไม่งั้นรูป lazy ยังไม่ถูกโหลด naturalWidth เป็น 0 แล้วด่านจะนึกว่า
   หน้าไม่ได้ใช้รูปพวกนั้น (รอบแรกอ่านได้แค่ 4 ใบจาก 8 ใบที่ใช้อยู่จริงเพราะเหตุนี้) */
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(900);
/* ขนาดพิกเซลของรูปที่หน้าใช้จริง (รวมที่มาจาก CSS ไม่ได้ ยอมรับขอบเขตนี้ไว้) */
const demoDims = new Set(await page.evaluate(() =>
  [...document.querySelectorAll("img")].filter((i) => i.naturalWidth)
    .map((i) => `${i.naturalWidth}x${i.naturalHeight}`)));

const dimOf = async (f) => page.evaluate((src) => new Promise((res) => {
  const im = new Image();
  im.onload = () => res(`${im.naturalWidth}x${im.naturalHeight}`);
  im.onerror = () => res(null);
  im.src = src;
}), pathToFileURL(resolve(f)).href);

const unused = [], maybe = []; let accounted = 0;
for (const f of refImgs) {
  if (byName(f)) continue;
  const d = await dimOf(f);
  if (d && demoDims.has(d)) continue;              /* ขนาดตรงเป๊ะ = ใบเดียวกันที่ถูกเปลี่ยนชื่อ */
  if (explained(f)) { accounted++; continue; }     /* เหลือจากสองชั้นบน = ไม่ได้ใช้ ต้องมีเหตุผลเขียนกำกับ */
  (d ? maybe : unused).push(f);
}

const holes = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("div, figure, span, li, section")) {
    const r = el.getBoundingClientRect();
    if (r.width < 60 || r.height < 60 || el.offsetParent === null) continue;
    const cs = getComputedStyle(el);
    const dashed = cs.borderStyle.includes("dashed");
    const empty = el.querySelectorAll("img, picture, video, svg, canvas").length === 0 && el.innerText.trim().length < 12;
    if (dashed && empty) out.push((el.className || el.tagName).toString().split(/\s+/).slice(0, 2).join(".") + ` ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  return [...new Set(out)].slice(0, 6);
});
await b.close();

const used = refImgs.length - unused.length - maybe.length - accounted;
console.log(`รูปที่ลูกค้าให้: ${refImgs.length} ใบ · ถูกใช้ ${used} ใบ (เทียบชื่อไฟล์ + ขนาดพิกเซล)` +
  (accounted ? ` · เขียนเหตุผลกำกับไว้แล้ว ${accounted} ใบ` : "") + (INV ? "" : "  [ไม่ได้ส่ง --inv]"));
let fail = 0;
if (unused.length) {
  fail++;
  console.log(`❌ S1.1 รูปของลูกค้าไม่ถูกใช้ ${unused.length} ใบ — ใช้ให้ครบ หรือเขียนเหตุผลกำกับว่าทำไมไม่ใช้`);
  unused.slice(0, 12).forEach((f) => console.log(`   · ${f.replace(REF, "").replace(/^\//, "")}`));
}
if (maybe.length) {
  /* ไม่ปล่อยเขียว — "ยังไม่รู้" ไม่เท่ากับ "ผ่าน" ต้องเปิดดูแล้วเขียนกำกับว่าใช้อยู่หรือจงใจไม่ใช้ */
  fail++;
  console.log(`⚠️  อีก ${maybe.length} ใบขนาดไม่ตรงใบไหนในหน้าเลย — อาจถูกครอปแล้วใช้อยู่ หรือไม่ได้ใช้จริง ต้องเปิดดูแล้วเขียนกำกับ`);
  maybe.slice(0, 6).forEach((f) => console.log(`      · ${f.replace(REF, "").replace(/^\//, "")}`));
}
if (holes.length) {
  fail++;
  console.log(`❌ S1.1 มีกรอบว่างโชว์อยู่ในหน้า ${holes.length} จุด — ไม่มีของให้ใส่ = ตัด section นั้นทิ้ง ไม่ใช่ปล่อยกรอบเปล่า`);
  holes.forEach((h) => console.log(`   · ${h}`));
}
console.log(fail ? "\nไม่ผ่านด่านของลูกค้า (DEMO-SPEC S1.1)" : "\nผ่าน — ของลูกค้าครบและไม่มีกรอบว่าง");
process.exit(fail ? 1 : 0);
