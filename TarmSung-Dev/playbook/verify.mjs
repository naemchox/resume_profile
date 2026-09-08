#!/usr/bin/env node
/* =============================================================================
   verify.mjs — ด่านตรวจอัตโนมัติของ playbook
   ใช้: node playbook/verify.mjs <โฟลเดอร์โปรเจกต์>

   เหตุผลที่มีไฟล์นี้: ENGINE.md เขียนกฎไว้ 40 กว่าข้อ แล้วรอบที่แล้วงานที่ build
   จาก ENGINE เอง "ละเมิดกฎของตัวเอง 4 ข้อ" โดยไม่มีใครรู้จนส่ง agent ไปตรวจ
   กฎที่เป็นร้อยแก้ว = กฎที่ถูกลืม กฎที่รันได้ = กฎที่ถูกบังคับ
   ทุกข้อที่เคยพลาดมาแล้วจริงๆ ต้องกลายเป็นเช็คในไฟล์นี้
   ========================================================================== */

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("ใช้: node verify.mjs <โฟลเดอร์โปรเจกต์>"); process.exit(2); }

const fails = [], warns = [], passes = [], skipped = [];

/* ข้อยกเว้นต่อโปรเจกต์: _verify-exempt.json = { "rule-id": "เหตุผล" }
   มีไว้เพราะกฎชุดนี้เขียนสำหรับ "ซอร์สที่คนเขียนเอง" พองานบางชิ้นเป็น bundle ที่
   คอมไพล์แล้ว (เช่น velvet-leaf ที่ body มีแค่ <div id="root">) กฎบางข้อจะฟ้องทุกครั้ง
   ทั้งที่ไม่มีอะไรให้แก้ — แล้ว "ตก" ที่ไม่มีวันแก้ได้ทำให้คนเลิกอ่านผลตรวจทั้งใบ
   กติกา: ยกเว้นได้ แต่ต้องเขียนเหตุผลกำกับ และ SKIP ไม่ใช่ PASS — นับแยกคนละช่อง
   ห้ามใช้ปิดปากกฎที่แก้ได้จริง */
let EXEMPT = {};
try { EXEMPT = JSON.parse(readFileSync(join(dir, "_verify-exempt.json"), "utf8")); } catch { /* ไม่มีก็ไม่เป็นไร */ }
const usedExempt = new Set();

const fail = (id, msg) => {
  if (Object.prototype.hasOwnProperty.call(EXEMPT, id)) {
    usedExempt.add(id);
    skipped.push(`⊘ [${id}] ยกเว้นไว้: ${EXEMPT[id]}`);
    return;
  }
  fails.push(`✗ [${id}] ${msg}`);
};
const warn = (id, msg) => warns.push(`! [${id}] ${msg}`);
const pass = (id, msg) => passes.push(`✓ [${id}] ${msg}`);

const read = (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), "utf8") : "");
// "assets/x.webp?v=3" → "assets/x.webp". ใช้ทั้งตอนเช็คว่าไฟล์มีจริง และตอนนับ orphan
// จุดเดียวกัน ไม่งั้นสองด่านนี้จะเห็นชื่อไฟล์คนละแบบแล้วขัดกันเอง
const assetPath = (u) => u.split(/[?#]/)[0];
const walk = (d, out = []) => {
  if (!existsSync(d)) return out;
  for (const f of readdirSync(d, { withFileTypes: true })) {
    if (f.name.startsWith(".") || f.name === "node_modules") continue;
    const p = join(d, f.name);
    f.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

const htmlRaw = read("index.html");
if (!htmlRaw) { console.error(`หา ${join(dir, "index.html")} ไม่เจอ`); process.exit(2); }
/* ตัดคอมเมนต์ HTML ทิ้งก่อนวิเคราะห์ ด้วยเหตุผลเดียวกับที่ตัดคอมเมนต์ CSS ข้างล่าง:
   homecraft เขียนวิธีใส่รูปไว้ในคอมเมนต์ว่า "<div class="media"><img src="…" alt="…">"
   แล้วกฎ a11y-alt อ่านบรรทัดนั้นเป็นมาร์กอัปจริง ฟ้องว่ามี <img> ไม่มี alt ทั้งที่ทั้งหน้า
   ไม่มี <img> แบบนั้นสักตัว (ตรวจเมื่อ 2026-08-20) — คำอธิบายในคอมเมนต์ไม่ใช่ของที่เบราว์เซอร์เรนเดอร์ */
const html = htmlRaw
  .replace(/<!--[\s\S]*?-->/g, "")
  /* ข้างในบล็อก <style> ก็ไม่ใช่มาร์กอัปเหมือนกัน — homecraft เขียนตัวอย่างการใช้งาน
     ไว้ในคอมเมนต์ CSS ("Drop an <img> in as the first child") แล้วกฎ a11y-alt อ่าน
     บรรทัดนั้นเป็น <img> จริงที่ไม่มี alt ทั้งที่ไม่มีอยู่ในหน้าเลย (วัดแล้ว 2026-08-20)
     หมายเหตุที่ยังค้าง: ตัวตรวจอ่าน CSS จากโฟลเดอร์ css/ เท่านั้น งานไฟล์เดียวที่ใส่ CSS
     ไว้ใน <style> จึงไม่เคยถูกตรวจกฎฝั่ง CSS เลย — นั่นคือที่มาของ ux-header/motion-jsgate
     ที่ฟ้องผิดในงานพวกนั้น ยังไม่แก้ในรอบนี้ */
  .replace(/<style[\s\S]*?<\/style>/gi, "");
// งานสาธิตครึ่งหนึ่งของ work/ เป็น index.html ไฟล์เดียว (สไตล์อยู่ใน <style> ไม่มีโฟลเดอร์ css/)
// ก่อนหน้านี้ตัวตรวจอ่านแต่ไฟล์ .css => css เป็นสตริงว่าง => ทุกกฎที่ดูจาก css "ตก" หมด
// ทั้งที่โค้ดมีของครบ. ตกแบบนั้นคือ false negative ซึ่งอันตรายกว่าไม่ตรวจเลย เพราะมันสอนให้คนมองข้าม ✗
const cssFiles = walk(join(dir, "css")).filter((f) => extname(f) === ".css");
/* ต้องอ่านจาก htmlRaw ไม่ใช่ html — html ถูกตัดบล็อก <style> ทิ้งไปแล้วเพื่อไม่ให้
   ข้อความในคอมเมนต์ CSS ถูกอ่านเป็นมาร์กอัป ถ้าดึงจาก html จะได้ CSS เปล่าแล้วกฎฝั่ง CSS
   ทุกข้อ (grain / focus-visible / header) จะฟ้องผิดทั้งแถบ (เกิดจริงมาแล้ว 2026-08-20) */
const inlineCss = [...htmlRaw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
const cssRaw = cssFiles.map((f) => readFileSync(f, "utf8")).concat(inlineCss).join("\n");
// ตัดคอมเมนต์ทิ้งก่อนวิเคราะห์: คอมเมนต์ที่เขียนว่า "main.js strips that class"
// เคยถูกอ่านเป็นซีเล็กเตอร์ `.js strips` แล้วฟ้องผิดตัวมาแล้ว
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, "");
const inlineJs = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
const js = walk(join(dir, "js")).filter((f) => extname(f) === ".js").map((f) => readFileSync(f, "utf8")).concat(inlineJs).join("\n");

/* ---- 1. MOTION (ENGINE §2) ------------------------------------------------ */
// ดูเฉพาะ observer ของ scroll-reveal เท่านั้น — scroll-spy กับ order-bar ใช้
// rootMargin ติดลบอย่างถูกต้องตามหน้าที่ของมัน เช็ครวมทั้งไฟล์จะฟ้องผิดตัว
let revealOpts = null;
for (const m of js.matchAll(/new IntersectionObserver\(/g)) {
  const chunk = js.slice(m.index, m.index + 1200);
  if (/classList\.add\(["']in["']\)/.test(chunk) && /rootMargin/.test(chunk)) { revealOpts = chunk; break; }
}
const rm = revealOpts && /rootMargin:\s*["']([^"']+)["']/.exec(revealOpts);
if (rm && /-\d/.test(rm[1])) fail("motion-rootmargin", `observer ของ reveal ใช้ rootMargin "${rm[1]}" ที่ติดลบ — block จะเริ่มเผยตอนอยู่ในจอแล้ว = อาการ 'ไม่ smooth' ต้องเป็นบวก (เช่น 0px 0px 25% 0px)`);
else if (rm) pass("motion-rootmargin", `reveal ใช้ rootMargin "${rm[1]}" (เป็นบวก)`);
else if (/rootMargin/.test(js)) warn("motion-rootmargin", "หา observer ของ reveal ไม่เจอ ตรวจ rootMargin ให้ไม่ได้");

if (js && !/unobserve/.test(js)) fail("motion-unobserve", "IntersectionObserver ไม่ unobserve หลังเผย — ของอาจย้อนกลับไปซ่อนได้");
if (js && !/getBoundingClientRect/.test(js)) fail("motion-firstpaint", "ไม่มี fallback วัด rect ให้ของที่อยู่ในจอตั้งแต่โหลด — observer ไม่ยิงใน tab ที่ซ่อน/prerender แล้วหน้าจะว่าง");
if (css && !/\.js\s+\.reveal\s*\{[^}]*opacity:\s*0/.test(css)) fail("motion-jsgate", "start state ของ reveal ไม่ได้ gate ใต้ html.js — JS พังเมื่อไหร่หน้าจะว่างเปล่า");

const durs = [...css.matchAll(/transition:[^;]*?(\d{3,4})ms/g)].map((m) => +m[1]);
const revealDur = /\.reveal\s*\{[\s\S]*?(\d{3,4})ms/.exec(css);
if (revealDur && +revealDur[1] < 900) warn("motion-duration", `reveal ใช้ ${revealDur[1]}ms — ENGINE กำหนด 1100ms (สั้นกว่านี้อ่านเป็นวูบ)`);

/* ---- 2. REDUCED MOTION: ต้องเคลียร์ "ทุก" start state --------------------- */
// ต้องรวม "ทุก" บล็อก reduce ไม่ใช่บล็อกแรกที่เจอ — ไฟล์จริงมักมี one-liner
// (`html { scroll-behavior: auto }`) อยู่บนสุดก่อนบล็อกจริงเสมอ
// เดิมจบบล็อกด้วย /\n\}/ ซึ่งแปลว่า "ปีกกาปิดที่คอลัมน์ 0" — จริงเฉพาะไฟล์ .css แยก
// พอเริ่มอ่าน <style> ที่ฝังในหน้า (ย่อหน้าเข้ามา 2 ช่องทุกบรรทัด) มันหาไม่เจอ
// แล้วรายงานว่า "ไม่มีบล็อก prefers-reduced-motion เลย" ทั้งที่มี => นับปีกกาเอาแทน
const takeBlock = (src, re) => {
  const out = [];
  for (const m of src.matchAll(re)) {
    let i = src.indexOf("{", m.index + m[0].length - 1), depth = 0, start = i + 1;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) { out.push(src.slice(start, i)); break; }
    }
  }
  return out;
};
const rmBody = takeBlock(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g).join("\n");
const rmBlock = rmBody ? [null, rmBody] : null;
// `transform:\s*(?!none)` เดิมกันไม่อยู่: \s* ถอยกลับไปกินศูนย์ช่องได้ แล้ว lookahead
// ก็ไปเจอ " none" (ขึ้นต้นด้วยช่องว่าง ไม่ใช่ n) เลยผ่านฉลุย => end state ที่เขียนว่า
// `transform: none` ถูกนับเป็น start state แล้วฟ้องว่า reduced-motion ไม่ได้เคลียร์
// ย้าย \s* เข้าไปในตัว lookahead แทน จะถอยยังไงก็ไม่หลุด
const startStates = [...css.matchAll(/\.js\s+([.\w-]+(?:\.[\w-]+)*)\s*(?:[^{]*)\{[^}]*transform:(?!\s*none)/g)]
  .map((m) => m[1].trim()).filter((s) => !/:hover/.test(s));
if (startStates.length && !rmBlock) fail("a11y-reduced-motion", "มี start state ที่ใช้ transform แต่ไม่มีบล็อก prefers-reduced-motion เลย");
else if (rmBlock) {
  const body = rmBlock[1];
  const missed = [...new Set(startStates)].filter((sel) => {
    const base = sel.split(".").filter(Boolean).pop();
    return !body.includes(base);
  });
  if (missed.length) fail("a11y-reduced-motion", `reduced-motion ไม่ได้เคลียร์ start state ของ: ${missed.join(", ")} — ของพวกนี้จะค้างมองไม่เห็นตลอดกาล`);
  else pass("a11y-reduced-motion", "reduced-motion เคลียร์ start state ครบ");
}
if (!/reduce=1/.test(js)) warn("hook-reduce", "ไม่มี test hook ?reduce=1 — ตรวจ reduced-motion และถ่ายรูปส่วนล่างของหน้าด้วย headless ไม่ได้");

/* ---- 3. วัสดุ (ENGINE §1) -------------------------------------------------- */
if (!/--grain|feTurbulence|noise/i.test(css)) fail("material-grain", "ไม่มี grain/texture บน surface เลย — พื้นจะแบนเป็นจอ ไม่ใช่วัสดุ (ENGINE §1)");
else pass("material-grain", "มี grain texture");

/* ---- 4. คอนเทนเนอร์ซ้อนคลาสแคบ (พลาดมาแล้ว 2 งานติด) --------------------- */
// นับเฉพาะคลาสที่ "แคบกว่า + ชิดซ้าย" เท่านั้น — บล็อกที่ตั้งใจจัดกลางทั้งก้อน
// (text-align:center) หรือสั่ง margin-inline:0 เอง ไม่ใช่บั๊ก
const narrow = new Set();
for (const m of css.matchAll(/\.([\w-]+)\s*\{([^}]*max-width:\s*\d+(?:\.\d+)?(?:ch|rem|px)[^}]*)\}/g)) {
  if (/text-align:\s*center/.test(m[2]) || /margin-inline:\s*0/.test(m[2])) continue;
  narrow.add(m[1]);
}
const containerNames = ["wrap", "container"];
for (const m of html.matchAll(/class="([^"]*)"/g)) {
  const list = m[1].split(/\s+/);
  if (!list.some((c) => containerNames.includes(c))) continue;
  const clash = list.find((c) => narrow.has(c) && !containerNames.includes(c));
  if (clash) fail("layout-container-clash", `class="${m[1]}" — เอาคลาสคอนเทนเนอร์รวมกับ .${clash} ที่กำหนด max-width แคบกว่า margin-inline:auto จะดันบล็อกไปกลางจอแทนที่จะชิดขอบซ้าย ให้ซ้อน div แทน`);
}

/* ---- 5. affordance: ของที่หน้าตาเป็นปุ่มต้องกดได้ ------------------------ */
const pillish = [...css.matchAll(/\.([\w-]+)(?:\s+\w+)?\s*\{[^}]*border-radius:\s*var\(--radius-pill\)[^}]*\}/g)].map((m) => m[1]);
for (const cls of new Set(pillish)) {
  const re = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]{0,400}?)</\\1>`, "g");
  for (const m of html.matchAll(re)) {
    const tag = m[1], inner = m[2];
    if (["a", "button"].includes(tag)) continue;
    if (/<a\s|<button\s/.test(inner)) continue;
    if (/^\s*<(li|span)/.test(inner) === false && !/li|ul/.test(tag)) continue;
    if (tag === "ul" && !/<a\s|<button\s/.test(inner)) fail("ux-affordance", `.${cls} ถูกแต่งเป็นทรงปุ่ม (radius-pill) แต่ข้างในไม่มี <a>/<button> เลย = หลอกให้คนกดแล้วไม่เกิดอะไร`);
  }
}
const actionLinks = (html.match(/<a[^>]+href="(?!#top")[^"]*"/g) || []).length;
if (actionLinks === 0) fail("ux-cta", "ทั้งหน้าไม่มีลิงก์/ปุ่มที่พาไปไหนได้เลย — หน้าไม่มีจุดเปลี่ยน");

/* ---- 6. รูป --------------------------------------------------------------- */
for (const m of html.matchAll(/<img\b([^>]*)>/g)) {
  const a = m[1];
  const src = (/src="([^"]+)"/.exec(a) || [])[1] || "(ไม่มี src)";
  if (!/alt=/.test(a)) fail("a11y-alt", `<img src="${src}"> ไม่มี alt`);
  if (!/width=/.test(a) || !/height=/.test(a)) warn("perf-img-dim", `<img src="${src}"> ไม่มี width/height — หน้าจะกระโดดตอนโหลด`);
  if (src.startsWith("assets/")) {
    // ตัด ?v=… / #… ออกก่อนหาไฟล์ — cache-buster เป็นส่วนของ URL ไม่ใช่ชื่อไฟล์
    // ก่อนแก้: ทุกรูปที่ใส่ ?v= ถูกฟ้อง "ไม่มีไฟล์" ทั้งที่มีอยู่ (ตก 5 ข้อรวด) แล้ว
    // ไฟล์เดียวกันยังโดนนับเป็น orphan ซ้ำอีก — ตัวตรวจที่ฟ้องผิดสอนให้คนมองข้าม ✗
    const p = join(dir, assetPath(src));
    if (!existsSync(p)) fail("asset-missing", `ไม่มีไฟล์ ${src}`);
    else {
      const kb = statSync(p).size / 1024;
      if (kb > 400) warn("perf-img-size", `${src} หนัก ${Math.round(kb)}KB (เกิน 400KB)`);
    }
  }
}
// นับทั้ง src/href และ srcset (รูป responsive ตาม step 13 อ้างไฟล์ผ่าน srcset เท่านั้น
// ก่อนหน้านี้ไฟล์พวกนั้นถูกแจ้งว่า "ไม่ถูกอ้างถึง" ทั้งที่ใช้อยู่จริง)
// รวม og:image ที่อ้างผ่าน content="..." ด้วย
// อ่าน "ทุกหน้า" ไม่ใช่แค่ index.html และรับทุกแอตทริบิวต์ ไม่ใช่แค่ src/href/content
//
// เดิมด่านนี้ฟ้อง orphan 73 ไฟล์ — คลิปรีลทั้งชุดโดนด้วย ทั้งที่หน้าแรกเรียกใช้อยู่
// ผ่าน data-reel="..." และ reference.html ก็อ้างอีกครึ่งหนึ่ง. คำเตือน 73 บรรทัด
// ที่ผิดเกือบทั้งหมด = ไม่มีใครอ่าน = เท่ากับไม่มีด่านนี้ ไฟล์ที่ไม่ได้ใช้จริงเลย
// เลยหลบอยู่ในกองนั้นได้สบาย
// เทียบด้วย path ที่ relative กับ dir เสมอ — เดิมเช็ค "/_archive/" ตรงๆ ซึ่งเป็นจริง
// เฉพาะตอนสั่งด้วย path เต็ม พอสั่ง `verify.mjs .` มันกลายเป็น "_archive/..." (ไม่มี /
// นำหน้า) แล้วหลุดตัวกรอง => ผลตรวจไม่เหมือนกันแล้วแต่ว่าพิมพ์คำสั่งยังไง
const shipped = (f) => {
  const seg = relative(dir, f).split(sep).join("/").split("/")[0];   /* 24/8/26 วินโดวส์คั่นด้วย "\" — ไม่แปลงก่อน seg จะเป็นพาธทั้งเส้น ตัวกรอง work/_archive จึงไม่ทำงาน */
  return seg !== "_archive" && seg !== "work" && seg !== "node_modules";
};
const pageHtml = walk(dir)
  .filter((f) => extname(f) === ".html" && shipped(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
const usedAssets = new Set([
  ...[...pageHtml.matchAll(/[\w-]+="([^"]*assets\/[^"]+)"/g)].map((m) => assetPath(m[1].replace(/^.*?(assets\/)/, "$1"))),
  ...[...pageHtml.matchAll(/srcset="([^"]+)"/g)].flatMap((m) =>
    m[1].split(",").map((s) => s.trim().split(/\s+/)[0]).filter((s) => s.includes("assets/"))
      .map((s) => assetPath(s.replace(/^.*?(assets\/)/, "$1")))),
]);
for (const f of walk(join(dir, "assets"))) {
  // relative() ไม่ใช่ slice(dir.length + 1) — สั่ง `verify.mjs .` แล้ว dir ยาว 1 ตัว
  // ชื่อไฟล์เลยโดนเฉือนหัวไป 2 ตัวกลายเป็น "sets/work/x.webp" ซึ่งไม่ตรงกับอะไรเลย
  // => ทุกไฟล์ในโฟลเดอร์ assets ถูกฟ้องว่า orphan ทั้งที่หน้าเรียกใช้อยู่
  const rel = relative(dir, f).split(sep).join("/");   /* เทียบกับพาธที่เขียนในหน้าเว็บ ซึ่งใช้ "/" เสมอ */
  if (!usedAssets.has(rel) && !css.includes(rel)) warn("asset-orphan", `${rel} ไม่ถูกอ้างถึงที่ไหนเลย`);
}

/* ---- 7. ฟอนต์: display ที่ไม่มีตัวไทย ------------------------------------- */
const NO_THAI = ["Anton", "Bebas Neue", "Oswald", "Impact", "Playfair Display", "Archivo Black", "Syne"];
const disp = /--font-display:\s*([^;]+);/.exec(css);
if (disp && /[฀-๿]/.test(html)) {
  const first = (disp[1].match(/"([^"]+)"/) || [])[1];
  if (NO_THAI.includes(first)) fail("type-thai", `--font-display เริ่มด้วย "${first}" ซึ่งไม่มีตัวไทย พาดหัวไทยจะตกไปใช้ฟอนต์เนื้อความแล้วอ่านเป็นข้อความธรรมดา`);
  else pass("type-thai", `--font-display = ${first} รองรับไทย`);
}

/* ---- 8. header ต้องเห็นได้ตลอดหน้า ---------------------------------------- */
const headerCls = (/<header[^>]*class="([^"]+)"/.exec(html) || [])[1];
if (headerCls) {
  const key = headerCls.split(/\s+/)[0];
  const rule = new RegExp(`\\.${key}\\s*\\{[^}]*position:\\s*(sticky|fixed)`).test(css);
  if (!rule) fail("ux-header", `<header class="${key}"> ไม่ sticky/fixed — โลโก้กับ nav จะหายทันทีที่เลื่อนพ้นจอแรก`);
  else pass("ux-header", "header ติดขอบบนตลอดหน้า");
}

/* ---- 9. a11y พื้นฐาน ------------------------------------------------------ */
if (!/:focus-visible/.test(css)) fail("a11y-focus", "ไม่มีสไตล์ :focus-visible — คนที่ใช้คีย์บอร์ดจะไม่รู้ว่าอยู่ตรงไหน");
for (const m of html.matchAll(/<section\b([^>]*)>/g)) {
  if (!/aria-label/.test(m[1])) warn("a11y-section", `<section${m[1].slice(0, 60)}> ไม่มี aria-labelledby/aria-label`);
}
if (!/class="skip"|skip-link|ข้ามไปเนื้อหา/.test(html)) warn("a11y-skip", "ไม่มี skip link");

/* ---- 10. contrast ต้องถูก "วัด" ไม่ใช่เดา -------------------------------- */
const measuredAll = (cssRaw.match(/\d\.\d{1,2}:1/g) || []).length;
// สคริปต์ ESM ในรีโปนี้ตั้งชื่อ .mjs กันหมด (playbook/*.mjs, _shot-*.mjs) เช็คแค่ .js
// จะฟ้องทั้งที่มีเครื่องมือวัดอยู่จริง — รับทั้งสองนามสกุล
if (!["_contrast.js", "_contrast.mjs"].some((f) => existsSync(join(dir, f)))) {
  if (measuredAll >= 2) warn("contrast-script", `ไม่มี _contrast.js/.mjs แต่มีตัวเลข contrast ที่วัดแล้วอ้างอยู่ ${measuredAll} จุด — เก็บสคริปต์ไว้ด้วยจะได้รันซ้ำตอนแก้สี`);
  else fail("contrast-script", "ไม่มี _contrast.js/.mjs และไม่มีตัวเลข contrast ที่วัดแล้วในโค้ดเลย — ENGINE §4 บังคับให้วัดจริง ไม่ใช่เดาจากค่า L");
} else {
  const measured = measuredAll;
  if (measured < 2) warn("contrast-comment", "วัดแล้วแต่ไม่ได้เขียนตัวเลขที่วัดได้ไว้ใน comment — คนมาทีหลังจะปรับกลับ");
  else pass("contrast-script", `วัด contrast จริง และอ้างตัวเลขไว้ในโค้ด ${measured} จุด`);
}

/* ---- 11. BRIEF: build ต้องครบตามที่ตัวเองสั่ง ---------------------------- */
const briefFile = readdirSync(dir).find((f) => /^BRIEF-.*\.md$/.test(f));
if (!briefFile) warn("brief-missing", "ไม่มีไฟล์ BRIEF-*.md ในโปรเจกต์ — ตรวจไม่ได้ว่า build ครบตามสเปกไหม");
else {
  const brief = readFileSync(join(dir, briefFile), "utf8");
  const rows = [...brief.matchAll(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|/gm)].map((m) => m[1].replace(/\*\*/g, "").trim());
  const text = html.replace(/<[^>]+>/g, " ");
  // ไทยไม่มีช่องว่างระหว่างคำ เทียบทั้งก้อนจะไม่มีวันเจอ ใช้ n-gram ทับซ้อนแทน
  const grams = (s2, n = 3) => new Set([...s2.replace(/\s+/g, "")].map((_, i, a) => a.slice(i, i + n).join("")).filter((g) => g.length === n));
  const overlap = (a, b) => { const A = grams(a), B = grams(b); if (!A.size) return 0;
    let hit = 0; for (const g of A) if (B.has(g)) hit++; return hit / A.size; };
  const missing = [], drifted = [];
  for (const r of rows) {
    const score = overlap(r, text + " " + html);
    if (score >= 0.75) continue;
    (score >= 0.35 ? drifted : missing).push(`${r} (ตรง ${Math.round(score * 100)}%)`);
  }
  if (drifted.length) warn("brief-drift", `ชื่อ block ในหน้าไม่ตรงกับที่ BRIEF เขียนไว้: ${drifted.join(" / ")} — อัปเดต BRIEF ให้ตรงกับของจริง ไม่งั้นเอกสารกับงานจะเดินคนละทาง`);
  if (rows.length === 0) warn("brief-table", `${briefFile} ไม่มีตาราง audit โครงหน้า (B3.5) ให้ตรวจ`);
  else if (missing.length) fail("brief-coverage", `${briefFile} สั่งให้มี block เหล่านี้แต่หาไม่เจอในหน้า: ${missing.join(" / ")}`);
  else pass("brief-coverage", `build ครบทั้ง ${rows.length} block ตามที่ BRIEF สั่ง`);
}

/* ---- สรุป ----------------------------------------------------------------- */
const line = "─".repeat(72);
console.log(`\n${line}\nverify: ${dir}\n${line}`);
for (const id of Object.keys(EXEMPT)) {
  if (!usedExempt.has(id)) warns.push(`! [ยกเว้นค้าง] "${id}" ไม่ได้ตกแล้ว — เอาออกจาก _verify-exempt.json ได้`);
  else if (!String(EXEMPT[id]).trim()) warns.push(`! [ยกเว้นไม่มีเหตุผล] "${id}" ยกเว้นโดยไม่เขียนเหตุผล = บั๊กที่รอเวลา`);
}
passes.forEach((p) => console.log(p));
skipped.forEach((k) => console.log(k));
warns.forEach((w) => console.log(w));
fails.forEach((f) => console.log(f));
console.log(line);
console.log(`ผ่าน ${passes.length} · ยกเว้น ${skipped.length} · เตือน ${warns.length} · ตก ${fails.length}`);
if (fails.length) console.log("\nยังปล่อยไม่ได้ — แก้ข้อที่ตก (✗) ให้หมดก่อน");
process.exit(fails.length ? 1 : 0);
