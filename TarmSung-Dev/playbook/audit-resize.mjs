/* ด่าน "ย่อจอแล้วหน้าเว็บกระตุกไหม" — 24/8/26
 *
 * ทำไมต้องมี: ด่านที่มีอยู่ทุกตัวถ่ายภาพหน้าเว็บที่ "ความกว้างคงที่" ทีละขนาด
 * (audit-mobile 390px · visual 1440px · audit-height) ของที่พังเฉพาะ "ระหว่างทาง"
 * ตอนคนลากขอบหน้าต่างจึงไม่มีใครเห็น 24/8/26 เจ้าของทักสองรอบเรื่องเดียวกัน:
 *   รอบแรก แผ่นภาพฮีโร่ผูกความสูงกับเนื้อหา → ย่อจอแล้วภาพถูกครอปใหม่ทั้งใบ (วัดได้
 *   กระโดด 149px) รอบสอง แถวตัวเลขในหน้า The Bed ใช้ flex-wrap พอคอลัมน์แคบลงนิดเดียว
 *   ของชิ้นสุดท้ายตกบรรทัด ทั้งหน้าเลื่อนลง 145px กลางการลาก
 *
 * ตัวนี้ไล่ความกว้างทีละขั้นแล้วเทียบ "ทุกกล่องในหน้า" ระหว่างสองขั้นที่ติดกัน
 * ของที่ขยับเป็นเส้นต่อเนื่อง = ปกติ · ของที่กระโดดทีเดียวเป็นร้อยพิกเซล = คนเห็น
 *
 * สิ่งที่ "ไม่" นับว่าผิด: การกระโดดตรงเบรกพอยต์ (sm/md/lg/xl) เพราะนั่นคือการ
 * เปลี่ยนเลย์เอาต์ที่ตั้งใจออกแบบไว้ — ด่านที่ฟ้องของที่ตั้งใจ คือด่านที่สอนให้คนเลิกอ่านผล
 */
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* เบรกพอยต์ = จุดที่ตั้งใจเปลี่ยนเลย์เอาต์ กระโดดตรงนี้ไม่ใช่บั๊ก
   อ่านจาก @media ของหน้านั้นเองแทนการฮาร์ดโค้ดค่าของ Tailwind — เดโมครึ่งหนึ่งเขียน
   CSS เอง (homecraft ใช้ 840px · summit ใช้ 640px) ถ้าใช้ลิสต์เดียวกันหมด ด่านจะฟ้อง
   การเปลี่ยนเลย์เอาต์ที่ตั้งใจของหน้าพวกนั้นทุกหน้า = รายงานที่ไม่มีใครเชื่อ
   อ่านจากไฟล์ฝั่ง Node ไม่ใช่จาก document.styleSheets เพราะหน้าถูกเปิดแบบ file://
   ซึ่งเบราว์เซอร์ถือว่าไฟล์ CSS ที่ลิงก์มาเป็นคนละต้นทาง แตะ cssRules แล้วโยน error
   ผลคือได้ลิสต์ว่าง แล้วด่านจะฟ้องทุกเบรกพอยต์ว่าเป็นบั๊ก (เจอจริงตอนรันรอบแรก) */
const readBP = (pageFile) => {
  const out = new Set();
  const html = readFileSync(pageFile, "utf8");
  const texts = [html];                                  // <style> ในหน้าเอง
  for (const m of html.matchAll(/<link[^>]+href="([^"]+\.css)[^"]*"/g)) {
    const css = join(dirname(pageFile), m[1].split("?")[0]);
    if (existsSync(css)) texts.push(readFileSync(css, "utf8"));
  }
  for (const t of texts)
    for (const m of t.matchAll(/@media[^{]*?(?:min|max)-width:\s*([\d.]+)px/g))
      out.add(Math.round(+m[1]));
  return [...out];
};
const crossesBP = (BP, a, b) => BP.some((x) => (a >= x && b < x) || (b >= x && a < x))
  /* เผื่อขอบ 1px: max-width:839px กับ min-width:840px คือเบรกพอยต์เดียวกัน */
  || BP.some((x) => Math.abs(a - x) <= 1 || Math.abs(b - x) <= 1);

/* ไล่ถี่ช่วงเดสก์ท็อป-แท็บเล็ต (ที่คนลากขอบหน้าต่างจริง) และคลุมถึงมือถือเล็กสุด */
const WIDTHS = [1440, 1400, 1360, 1320, 1280, 1240, 1200, 1160, 1120, 1080, 1040,
                1000, 960, 920, 880, 840, 800, 760, 720, 680, 640, 600, 560, 520,
                480, 440, 400, 360];

/* กระโดดเท่าไหร่ถึงเรียกว่า "เห็น": 120px = ประมาณหนึ่งย่อหน้าหรือหนึ่งแถวการ์ด
   ของที่คนทักมาทั้งสองรอบอยู่ที่ 145 และ 149 — ตั้งต่ำกว่านั้นเพื่อให้จับได้ก่อนถูกทัก */
const FAIL_JUMP = 120;
const WARN_JUMP = 60;
const WARN_ZIGZAG = 3;      // สูงขึ้น-ลดลงสลับกันกี่ครั้งถึงเรียกว่า "สั่น" ตอนลาก

/* ต่ำกว่านี้ให้เป็นแค่ข้อเตือน ไม่บล็อกการปล่อย: ไม่มีใครลากขอบหน้าต่างโทรศัพท์
   จอแคบเปลี่ยนขนาดได้ทางเดียวคือหมุนเครื่อง ซึ่งเป็นการเปลี่ยนเลย์เอาต์ทั้งใบอยู่แล้ว
   ส่วนตัวอักษรที่ตัดบรรทัดใหม่ตอนกว้าง 400 → 360 เป็นเรื่องปกติของข้อความ ไม่ใช่บั๊ก
   (ของล้นจอยังตกทุกความกว้าง เพราะนั่นคนเห็นแน่ๆ ไม่ว่าจอไหน) */
const DRAG_MIN = 640;

const DEMOS = ["the-bed", "the-terrace", "glow-clinic", "krua-baansuan", "chang-chat",
               "homecraft", "velvet-leaf", "lumen", "summit",
               "the-terrace-multi", "the-bed-multi", "glow-clinic-multi"];
const ROOT_PAGES = ["index.html", "reference.html"];

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const all = process.argv.includes("--all") || !args.length;
const targets = all
  ? [...ROOT_PAGES, ...DEMOS.map((d) => `work/${d}/index.html`)]
  : args.map((a) => (a.includes("/") || a.endsWith(".html") ? a : `work/${a}/index.html`));

/* ติดป้ายประจำตัวให้ทุกกล่องก่อนเริ่มวัด — 24/8/26 เดิมใช้ "ลำดับใน DOM" เป็นคีย์
   แล้วหน้าแรกฟ้องว่ามีของกระโดด 9,107px ทั้งที่วัดตรงๆ แล้วขยับแค่ 250→223px เรียบๆ
   สาเหตุคือหน้านั้นมีสคริปต์สลับ <img> เป็น <video> ตอนการ์ดเข้าจอ จำนวน element เลย
   เปลี่ยนกลางทาง ลำดับขยับ ด่านจึงเอา element คนละตัวมาเทียบกัน = ตัวเลขมั่ว
   ป้ายนี้ติดครั้งเดียวตอนเริ่ม ของที่เกิดใหม่ทีหลังจะไม่มีป้าย = ไม่ถูกนำมาเทียบ */
const STAMP = () => {
  document.querySelectorAll("body *").forEach((el, i) => { el.dataset.rzId = String(i); });
};
const SNAP = () => {
  const out = {};
  document.querySelectorAll("body *[data-rz-id]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const cs = getComputedStyle(el);
    const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).slice(0, 3).join(".");
    out[el.dataset.rzId] = {
      h: Math.round(r.height),
      name: el.tagName.toLowerCase() + (cls ? "." + cls : "") + (el.id ? "#" + el.id : ""),
      /* แผ่นภาพพื้นหลังที่วางทับแบบ absolute: ความสูงของมันควรอิงจอ ไม่ใช่อิงเนื้อหา
         ถ้าขยับตามความสูงเนื้อหา ภาพ cover จะถูกครอปใหม่ทุกครั้ง = ภาพเต้น
         เอาเฉพาะ cover/contain — ลายพื้นผิวที่ tile ซ้ำ (repeat) ยืดหดได้โดยไม่มีใครเห็น */
      bg: (cs.position === "absolute" || cs.position === "fixed")
        && cs.backgroundImage !== "none"
        && /cover|contain/.test(cs.backgroundSize),
    };
  });
  /* วัด "เลื่อนซ้ายขวาได้จริงไหม" ด้วยการลองเลื่อน ไม่ใช่เทียบ scrollWidth เฉยๆ —
     หน้าเหล่านี้ตั้ง overflow-x:hidden ที่ body ของที่ล้นจึงถูกตัดทิ้งและคนไม่เห็นอะไรเลย
     แต่ scrollWidth ยังรายงานค่าล้นอยู่ ด่านที่เชื่อค่านั้นจะฟ้องทุกหน้าโดยไม่มีอาการจริง */
  const y = window.scrollY;
  window.scrollTo(9999, y);
  const over = Math.round(window.scrollX);
  window.scrollTo(0, y);
  return { boxes: out, over };
};

/* ---- ฟอนต์กระพริบ (ตรวจจากไฟล์ ไม่ต้องเปิดเบราว์เซอร์) ----------------------
   display=swap แปลตรงตัวว่า "วาดด้วยฟอนต์สำรองไปก่อน แล้วค่อยสลับเป็นฟอนต์จริง"
   คนที่เน็ตไม่เร็วจึงเห็นตัวหนังสือเปลี่ยนหน้าตากลางคัน — วัดที่ 400kbps หน้า
   the-terrace สลับที่วินาทีที่ 3.9 กล่องหัวข้อขยับจาก 780 เป็น 724px
   optional = ถ้าฟอนต์มาไม่ทันช่วงต้นก็ใช้ฟอนต์สำรองไปทั้งรอบนั้น ไม่สลับให้เห็น
   แก้ทั้งเว็บด้วย playbook/fix-font-flash.mjs (เปลี่ยน display + เติม preload ให้เอง) */
const fontFlash = (file) => {
  const html = readFileSync(file, "utf8");
  const link = /<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(html);
  if (!link) return null;
  const display = /display=([a-z]+)/.exec(link[1])?.[1] || "auto";
  return {
    display,
    flashes: display !== "optional",
    /* preload คู่กับ optional เสมอ: optional เฉยๆ แปลว่าคนที่เข้าครั้งแรกได้ฟอนต์สำรอง
       ไปทั้งหน้า ซึ่งไม่กระพริบก็จริงแต่ไม่ใช่หน้าตาที่ออกแบบไว้ */
    preload: (html.match(/rel="preload" as="font"/g) || []).length,
  };
};

const b = await chromium.launch();
let bad = 0, warned = 0;

for (const path of targets) {
  const file = join(ROOT, path);
  if (!existsSync(file)) { console.log(`! ข้าม ${path} (ไม่มีไฟล์)`); continue; }
  const p = await b.newPage({ viewport: { width: WIDTHS[0], height: 900 } });
  await p.goto("file:///" + file.replace(/\\/g, "/"), { waitUntil: "load" });
  /* รอให้อนิเมชันตอนโหลดจบก่อน ไม่งั้นความสูงที่วัดได้เป็นของที่กำลังวิ่งอยู่
     24/8/26 เดิมรอตายตัว 3500ms แล้วด่านตกแบบไม่ซ้ำเดิม (รันใหม่ผ่าน) = ด่านที่เชื่อไม่ได้
     บล็อกการปล่อยเว็บมั่ว เปลี่ยนเป็นรอจน "ความสูงหน้าหยุดเปลี่ยน" จริง แล้วค่อยเริ่มวัด */
  /* รูปที่ตั้ง loading="lazy" จะทยอยโหลดตอนมันเข้าจอ — ระหว่างที่ด่านไล่ย่อจอ รูปพวกนี้
     โผล่มาเรื่อยๆ แล้วดันความสูงเป็นพันพิกเซล ด่านอ่านว่า "กระโดด 9107px" ทั้งที่เป็น
     รูปโหลดเสร็จเฉยๆ (เจอจริง 24/8/26 ในหน้าแรกกับ reference ที่มีภาพพรีวิวเดโมสิบกว่าใบ)
     บังคับโหลดให้ครบก่อน แล้วค่อยเริ่มวัด */
  await p.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = "eager"; });
    await Promise.all([...document.images].map((i) =>
      i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })));
  });
  await p.waitForTimeout(1200);
  let lastH = -1, stable = 0;
  for (let i = 0; i < 60 && stable < 4; i++) {
    const h = await p.evaluate(() => Math.round(document.documentElement.scrollHeight));
    if (h === lastH) stable++; else { stable = 0; lastH = h; }
    await p.waitForTimeout(100);
  }

  await p.evaluate(STAMP);
  const pageBP = readBP(file);
  const frames = [];
  for (const w of WIDTHS) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(40);
    frames.push({ w, ...(await p.evaluate(SNAP)) });
  }
  await p.close();

  const ids = new Set(frames.flatMap((f) => Object.keys(f.boxes)));
  const found = [];
  for (const i of ids) {
    let jump = 0, at = 0, zig = 0, prevDir = 0, bgMove = 0, bgAt = 0, name = "", inDrag = false;
    for (let k = 1; k < frames.length; k++) {
      const a = frames[k - 1].boxes[i], c = frames[k].boxes[i];
      if (!a || !c) { prevDir = 0; continue; }
      name = c.name;
      if (crossesBP(pageBP, frames[k - 1].w, frames[k].w)) { prevDir = 0; continue; }
      const d = c.h - a.h;
      const drag = frames[k].w >= DRAG_MIN;
      if (Math.abs(d) > jump) { jump = Math.abs(d); at = frames[k].w; inDrag = drag; }
      if (c.bg && drag && Math.abs(d) > bgMove) { bgMove = Math.abs(d); bgAt = frames[k].w; }
      const dir = Math.sign(d);
      if (dir && prevDir && dir !== prevDir) zig++;
      if (dir) prevDir = dir;
    }
    if (name) found.push({ name, jump, at, zig, bgMove, bgAt, inDrag });
  }

  const fails = found.filter((f) => (f.jump >= FAIL_JUMP && f.inDrag) || f.bgMove > 2);
  const warns = found.filter((f) => !fails.includes(f) && (f.jump >= WARN_JUMP || f.zig >= WARN_ZIGZAG));
  const overflow = frames.filter((f) => f.over > 1);

  /* กล่องแม่กระโดดเพราะลูกกระโดด — รายงานเฉพาะตัวที่กระโดดเยอะสุดในแต่ละกลุ่มก็พอ
     ไม่งั้นบั๊กหนึ่งจุดจะกลายเป็นรายงานสิบบรรทัดที่ไม่มีใครอ่าน */
  const top = (list) => {
    const seen = new Map();
    for (const f of list.sort((a, b) => b.jump - a.jump)) {
      const k = `${f.jump}@${f.at}`;
      if (!seen.has(k)) seen.set(k, f);
    }
    return [...seen.values()];
  };

  const font = fontFlash(file);
  if (!fails.length && !warns.length && !overflow.length && !font?.flashes && font?.preload !== 0) {
    console.log(`✅ ${path}`); continue;
  }
  console.log(`\n── ${path}`);
  if (font?.flashes) console.log(`   ✗ ฟอนต์ display=${font.display} — หน้าจะโชว์ฟอนต์สำรองก่อนแล้วสลับให้คนเห็น (แก้: node playbook/fix-font-flash.mjs)`);
  else if (font && font.preload === 0) console.log(`   ! ฟอนต์ display=optional แต่ไม่มี preload — คนที่เข้าครั้งแรกจะได้ฟอนต์สำรองทั้งหน้า`);
  for (const f of overflow.slice(0, 3)) console.log(`   ✗ ที่ ${f.w}px หน้าเลื่อนซ้ายขวาได้ ${f.over}px — มีของล้นจอ`);
  for (const f of top(fails).slice(0, 6)) {
    if (f.bgMove > 2) console.log(`   ✗ ${f.name} — แผ่นภาพพื้นหลังสูงตามเนื้อหา ขยับ ${f.bgMove}px ที่ ${f.bgAt}px (ภาพจะถูกครอปใหม่ทุกครั้งที่ย่อจอ ให้ผูกความสูงกับจอ เช่น svh)`);
    else console.log(`   ✗ ${f.name} — กระโดด ${f.jump}px ที่ ${f.at}px (ไม่ใช่เบรกพอยต์ = คนที่กำลังลากขอบจอเห็นทั้งหน้าเลื่อน)`);
  }
  for (const f of top(warns).slice(0, 4))
    console.log(`   ! ${f.name} — ${f.jump >= WARN_JUMP ? `กระโดด ${f.jump}px ที่ ${f.at}px` : `สั่นขึ้นลงสลับ ${f.zig} ครั้ง`}`);
  if (fails.length || overflow.length || font?.flashes) bad++;
  warned += warns.length ? 1 : 0;
}

await b.close();
if (bad) {
  console.log(`\n❌ มีหน้าที่กระตุกตอนย่อจอ ${bad} หน้า — ของที่กระโดดเกิน ${FAIL_JUMP}px กลางการลากคือสิ่งที่คนทักมาแล้วสองรอบ`);
  process.exit(1);
}
console.log(`\n✅ ไม่มีหน้าไหนกระตุกตอนย่อจอ (ตรวจ ${targets.length} หน้า × ${WIDTHS.length} ความกว้าง)${warned ? ` · มีข้อเตือน ${warned} หน้า` : ""}`);
