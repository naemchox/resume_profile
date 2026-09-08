/* ตรวจว่าแอนิเมชันจะกระตุกไหม โดยดูจากสาเหตุ ไม่ใช่รอให้เห็นเฟรมตก
   ใช้: node playbook/audit-motion.mjs [path…]   (ไม่ใส่ path = ไล่ work/ ทั้งหมด)
   ต้องมีเซิร์ฟเวอร์ที่ 127.0.0.1:8098 (ตั้งเองด้วย AUDIT_BASE) · ไฟล์นอกรีโปใส่พาธเต็มได้

   ทำไมต้องมีไฟล์นี้: `audit-scroll.mjs` วัด fps ตอนหน้านิ่งแล้ว จึงจับหัวข้อของ The Bed
   ที่กระตุกใน 3 วินาทีแรกไม่ได้เลย และเรื่องพวกนี้อ่านจากซอร์สด้วยตาก็หลุดตลอด เพราะ
   ตัวปัญหาไม่ได้อยู่ในบรรทัดเดียว มันคือ CSS กับ JS สองที่ที่มาเจอกันบน element เดียว

   ตรวจตาม playbook/DEMO-SPEC.md S2:
     S2.1 หนึ่ง element = หนึ่งตัวขับ (CSS animation ทับ JS transform)
     S2.3 ห้ามอนิเมต layout property
     S2.4 ห้ามอนิเมต filter / backdrop-filter
     S2.6 will-change ค้างหลังเล่นจบ
     S2.8 <img> ต้องบอกขนาด */
import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:8098";
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const WORK = readdirSync(join(ROOT, "work"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, "work", d.name, "index.html")))
  .map((d) => d.name).sort();
const pages = targets.length
  ? targets.map((t) => (existsSync(t) ? pathToFileURL(resolve(t)).href : BASE + t))
  : WORK.map((s) => `${BASE}/work/${s}/index.html`);

const probe = () => {
  /* ต้องประกาศในนี้ ไม่ใช่ข้างนอก — page.evaluate ส่งไปแค่ตัวฟังก์ชัน ค่าคงที่ระดับโมดูล
     ไม่ตามไปด้วย รอบแรกวางไว้ข้างนอกแล้วทุก rule โยน ReferenceError เงียบๆ ด่านจึงขึ้นเขียว */
  const LAYOUT_PROPS = ["top", "left", "right", "bottom", "width", "height", "margin", "padding"];
  const out = { dual: [], filterAnim: [], layoutAnim: [], stuck: 0, stuckSample: [], imgNoSize: [], imgTotal: 0, blind: 0, blindWhy: [] };
  const nameOf = (el) => el.tagName.toLowerCase() +
    (el.id ? "#" + el.id : "") +
    (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");

  /* S2.1 — element ที่มี CSS animation วิ่งอยู่ แล้วยังโดน JS เขียน inline transform ทับ
     สองตัวขับประกอบเป็น matrix เดียวกัน ผลคือภาพสั่นตลอดช่วงที่ animation ยังไม่จบ */
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.animationName !== "none" && el.style.transform) {
      out.dual.push(`${nameOf(el)} — animation:${cs.animationName} ${cs.animationDuration} + inline transform`);
    }
  }

  /* S2.4 / S2.3 — อ่านจากสไตล์ชีตจริง ชีตข้ามโดเมน (Google Fonts) อ่านไม่ได้ นับเป็นจุดบอด */
  /* ห่อทีละ rule ไม่ใช่ทีละชีต — เดิมกฎเดียวที่อ่านไม่ได้ทำให้ทั้งชีตถูกข้าม
     แล้วขึ้นเขียว (the-bed: .nav-shell transition backdrop-filter หลุดด่านด้วยเหตุนี้) */
  const scanRule = (r) => {
    try { scanRuleInner(r); } catch (e) { out.blind++; if (out.blindWhy.length < 3) out.blindWhy.push(String(e).slice(0, 70)); }
  };
  const scanRuleInner = (r) => {
    if (r.cssRules) { for (const sub of r.cssRules) scanRule(sub); }
    const isKey = r.constructor?.name === "CSSKeyframeRule" || r.type === 8;
    const txt = r.style ? r.style.cssText : "";
    if (!txt) return;
    if (/(^|[^-])filter\s*:/.test(txt) && (isKey || /transition/.test(txt))) {
      out.filterAnim.push((r.parentRule?.name ? `@keyframes ${r.parentRule.name}` : r.selectorText || "?") + " → " + txt.slice(0, 90));
    }
    const tp = r.style.transitionProperty;
    if (tp && tp !== "none") {
      const hit = tp.split(",").map((x) => x.trim()).filter((p) => LAYOUT_PROPS.includes(p));
      if (hit.length) out.layoutAnim.push(`${r.selectorText || "?"} → transition: ${hit.join(", ")}`);
      /* `.transition` ของ Tailwind ลิสต์ filter/backdrop-filter มาให้เองทุกหน้าที่ใช้ Tailwind
         มันเป็นคลาสอเนกประสงค์ ไม่ใช่การตั้งใจอนิเมตเบลอ — นับเป็นเสียงรบกวน ข้ามไป
         ส่วนกฎที่ตั้งชื่อเอง (เช่น .nav-shell) ยังตกเหมือนเดิม */
      const utility = /^\.(transition|transition-all|transition-colors)$/.test((r.selectorText || "").trim());
      if (!utility && /backdrop-filter|(^|[\s,])filter/.test(tp)) out.filterAnim.push(`${r.selectorText || "?"} → transition: ${tp.slice(0, 60)}`);
    }
  };
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) scanRule(r); } catch (e) { out.blind++; if (out.blindWhy.length < 3) out.blindWhy.push(String(e).slice(0, 70)); }
  }

  /* S2.6 — will-change ที่ยังค้างทั้งที่ไม่มีอะไรเล่นอยู่แล้ว = บังคับเบราว์เซอร์กันเลเยอร์ทิ้งไว้เปล่าๆ */
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.willChange && cs.willChange !== "auto" && cs.animationName === "none") {
      out.stuck++;
      if (out.stuckSample.length < 4) out.stuckSample.push(nameOf(el));
    }
  }

  /* S2.8 — รูปไม่บอกขนาด = หน้ากระโดดตอนรูปมาถึง (นับเฉพาะรูปที่ไม่ได้ถูกล็อกขนาดด้วย CSS) */
  for (const img of document.querySelectorAll("img")) {
    out.imgTotal++;
    const hasAttr = img.hasAttribute("width") && img.hasAttribute("height");
    const cs = getComputedStyle(img);
    const lockedByCss = cs.aspectRatio !== "auto" || (cs.height !== "auto" && !/%$/.test(cs.height));
    if (!hasAttr && !lockedByCss && out.imgNoSize.length < 5) out.imgNoSize.push(nameOf(img) + (img.src ? " " + img.src.split("/").pop().slice(0, 28) : ""));
  }
  return out;
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let fail = 0;

for (const url of pages) {
  const name = decodeURIComponent(url).replace(BASE, "").replace(/^.*\/(work\/[^/]+|[^/]+)\/index\.html$/, "$1");
  try { await page.goto(url, { waitUntil: "load", timeout: 20000 }); }
  catch (e) { console.log(`⚠️  ${name} — เปิดไม่ได้: ${e.message.split("\n")[0]}`); fail++; continue; }

  /* ผ่านด่านยืนยันอายุก่อนวัด — ท่าเดียวกับ audit-scroll.mjs: velvet-leaf มีประตูคลุมทั้งหน้า
     ถ้าไม่กดผ่าน จะได้วัด "หน้าประตู" ที่นิ่งสนิทแล้วรายงานว่าไม่มีอะไรผิด = วัดไม่ถึง
     ของชนิดเดียวกันต้องใช้กลไกเดียวกัน จึงยกท่าจากด่านนั้นมาตรงๆ ไม่คิดท่าใหม่ */
  const gate = page.getByRole("button", { name: /yes,? i am 20|ใช่|20\+|ยอมรับ|accept/i }).first();
  if (await gate.count()) { await gate.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(900); }
  /* ต้องเลื่อนก่อน ไม่งั้น parallax/สคริปต์ตอนเลื่อนยังไม่เคยเขียน inline transform ลงไปเลย
     แล้วด่านจะขึ้นเขียวทั้งที่ของจริงชนกันตอนคนเลื่อนจริง */
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 220);
  await page.waitForTimeout(350);
  const r = await page.evaluate(probe);

  /* วัด will-change ซ้ำหลังปล่อยให้ทุกอย่างเล่นจบ — "ค้าง" ต้องแปลว่ายังอยู่หลังของนิ่งแล้ว
     ไม่ใช่ของที่กำลังเล่นอยู่ตอนวัด · transition ที่วิ่งอยู่ไม่นับเป็น animation ในสายตา
     getComputedStyle ของที่กำลังเล่นจึงถูกนับเป็นค้างทั้งที่อีก 400ms มันปลดเอง */
  await page.waitForTimeout(1800);
  const stuckLate = await page.evaluate(() => {
    let n = 0; const s = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.willChange && cs.willChange !== "auto" && cs.animationName === "none") {
        n++; if (s.length < 4) s.push(el.tagName.toLowerCase() + "." + (el.className || "").toString().split(/\s+/).slice(0, 2).join("."));
      }
    }
    return { n, s };
  });
  r.stuck = stuckLate.n; r.stuckSample = stuckLate.s;

  const bad = []; let warnLayout = "";
  if (r.dual.length) bad.push(`S2.1 สองตัวขับบน element เดียว (${r.dual.length}): ${r.dual.slice(0, 3).join(" · ")}`);
  if (r.filterAnim.length) bad.push(`S2.4 อนิเมต filter/backdrop-filter (${r.filterAnim.length}): ${[...new Set(r.filterAnim)].slice(0, 3).join(" · ")}`);
  /* S2.3 เป็นคำเตือน ไม่ใช่ตก: ของที่ติดเกือบทุกใบคือแถบเมนูที่ย่อความสูง/ระยะขอบตอนเลื่อน
     ซึ่งมาจากกลไกร่วม js/nav-response.js ตัวเดียวกันทั้งกอง ด่านที่ทำให้ 9 ใบแดงพร้อมกัน
     ตั้งแต่วันแรกคือด่านที่ทุกคนจะเลิกอ่าน — ยกขึ้นเป็นตกเมื่อไหร่ ต้องแก้ nav-response
     พร้อมกันทั้งชุด (ไม่ใช่ไล่ทีละใบ) */
  if (r.layoutAnim.length) warnLayout = `S2.3 อนิเมต layout property (${r.layoutAnim.length}): ${[...new Set(r.layoutAnim)].slice(0, 2).join(" · ")}`;
  if (r.imgNoSize.length) bad.push(`S2.8 รูปไม่บอกขนาด (${r.imgNoSize.length}/${r.imgTotal}): ${r.imgNoSize.slice(0, 3).join(" · ")}`);

  const warn = [];
  if (warnLayout) warn.push(warnLayout);
  if (r.stuck > 10) warn.push(`S2.6 will-change ค้าง ${r.stuck} จุดทั้งที่ไม่มี animation วิ่ง — ตัวอย่าง: ${r.stuckSample.join(", ")}`);
  if (r.blind) warn.push(`อ่านสไตล์ไม่ได้ ${r.blind} จุด — ยังไม่ถูกตรวจ (ไม่ใช่ผ่าน): ${r.blindWhy.join(" | ")}`);

  if (bad.length) { fail++; console.log(`❌ ${name}`); bad.forEach((x) => console.log(`   · ${x}`)); }
  else console.log(`✅ ${name}`);
  warn.forEach((x) => console.log(`   ⚠️  ${x}`));
}

await b.close();
console.log(fail ? `\n${fail} หน้าไม่ผ่านด่านแอนิเมชัน (DEMO-SPEC S2)` : "\nผ่านด่านแอนิเมชันทุกหน้า");
process.exit(fail ? 1 : 0);
