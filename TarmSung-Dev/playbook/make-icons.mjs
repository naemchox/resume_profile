#!/usr/bin/env node
/* =============================================================================
   make-icons.mjs — ยุบไอคอน SVG ที่วางซ้ำในไฟล์ ให้เหลือชุดเดียวแล้วเรียกด้วย <use>

   ใช้:  node playbook/make-icons.mjs index.html            # ตรวจอย่างเดียว
         node playbook/make-icons.mjs index.html --write    # แก้ไฟล์จริง
         node playbook/make-icons.mjs work/homecraft/index.html --write

   ทำไมต้องมี:
   วัดเมื่อ 22 ส.ค. 2026 — index.html วางไอคอนเครื่องหมายถูกตัวเดียวกัน **ซ้ำ 26 ครั้ง**
   เป็น <svg> เต็มๆ ทุกครั้ง แปลว่าวันไหนอยากเปลี่ยนหน้าตาไอคอนต้องไล่แก้ 26 จุด
   และถ้าแก้ไม่ครบก็ได้ไอคอนสองแบบในหน้าเดียวโดยไม่มีใครรู้ = บั๊กที่รอเวลา
   เครื่องมือนี้ทำให้ "ไอคอนหนึ่งตัว = ที่มาที่เดียว" โดยไม่เปลี่ยนหน้าตาที่เรนเดอร์ออกมา

   หลักการที่ยึด:
   - เก็บแอตทริบิวต์ของ <svg> เดิมไว้ครบ (class/width/height/stroke/fill) แล้วเปลี่ยน
     แค่ "ไส้ใน" เป็น <use> — เพราะ <use> รับค่าพวกนี้ทางมรดกอยู่แล้ว ภาพจึงเหมือนเดิมเป๊ะ
   - ยุบเฉพาะไอคอนที่ซ้ำตั้งแต่ 2 ครั้งขึ้นไป · ตัวที่ใช้ครั้งเดียวปล่อยไว้ที่เดิม
     (ยุบทุกตัวจะได้ sprite ที่ยาวกว่าของที่ประหยัดได้)
   - รันซ้ำได้ไม่พัง: ถ้าไฟล์มี sprite อยู่แล้วจะข้าม
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error("ใส่ชื่อไฟล์ด้วย เช่น: node playbook/make-icons.mjs index.html --write"); process.exit(1); }
const WRITE = flags.includes("--write");
const MARK = "<!-- ไอคอนชุดเดียวของหน้านี้ (สร้างด้วย playbook/make-icons.mjs) -->";

let html = readFileSync(file, "utf8");
if (html.includes(MARK)) { console.log("ไฟล์นี้มี sprite อยู่แล้ว — ไม่ทำอะไร"); process.exit(0); }

/* เก็บ <svg>…</svg> ทุกตัว พร้อมแอตทริบิวต์และไส้ใน */
const svgs = [];
const re = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/g;
let m;
while ((m = re.exec(html))) {
  const [whole, attrs, inner] = m;
  if (/<use\b/.test(inner) || /<symbol\b/.test(inner)) continue;   // ของที่ยุบแล้ว
  svgs.push({ whole, attrs, inner, key: inner.replace(/\s+/g, " ").trim() });
}

/* จัดกลุ่มตามไส้ใน — ไส้เหมือนกัน = ไอคอนตัวเดียวกัน ต่อให้ขนาด/คลาสต่างกัน */
const groups = new Map();
svgs.forEach((s) => {
  if (!groups.has(s.key)) groups.set(s.key, []);
  groups.get(s.key).push(s);
});
const dupes = [...groups.entries()].filter(([, v]) => v.length >= 2)
  .sort((a, b) => b[1].length - a[1].length);

if (!dupes.length) { console.log(`${file}: ไม่มีไอคอนที่วางซ้ำ — ไม่ต้องยุบ`); process.exit(0); }

/* ตั้งชื่อจากรูปทรงที่พบบ่อย ให้คนอ่าน markup แล้วเดาออกว่าคืออะไร */
const NAME = [
  [/M20 6L9 17l-5-5|m?5 13 4 4L19 7/i, "check"],
  [/M6 9l6 6 6-6|m6 9 6 6 6-6/i, "chev-down"],
  [/M9 5l7 7-7 7|m9 5 7 7-7 7/i, "chev-right"],
  [/M7 17 17 7M9 7h8v8/i, "external"],
  [/circle[^>]*r="7"[\s\S]*3\.5/i, "search"],
];
const nameFor = (key, i) => {
  const hit = NAME.find(([p]) => p.test(key));
  return "i-" + (hit ? hit[1] : "icon" + (i + 1));
};

const symbols = [];
let saved = 0;
dupes.forEach(([key, list], i) => {
  const id = nameFor(key, i);
  const vb = (list[0].attrs.match(/viewBox="([^"]+)"/) || [, "0 0 24 24"])[1];
  symbols.push(`  <symbol id="${id}" viewBox="${vb}">${list[0].inner.trim()}</symbol>`);
  list.forEach((s) => {
    // เก็บแอตทริบิวต์เดิม "ทั้งหมด" รวม viewBox — เคยลองตัด viewBox ออกแล้วหน้าสูงขึ้น
    // 114px เพราะ <svg> ที่ไม่ได้ถูก CSS กำหนดขนาดจะกางเป็นขนาดปริยาย 300x150
    const out = `<svg${s.attrs}><use href="#${id}"/></svg>`;
    html = html.replace(s.whole, out);
    saved += s.whole.length - out.length;
  });
  console.log(`  ${id.padEnd(12)} × ${String(list.length).padStart(2)} ครั้ง`);
});

const sprite = `${MARK}\n<svg class="sr-only" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0"><defs>\n${symbols.join("\n")}\n</defs></svg>\n`;
html = html.replace(/(<body[^>]*>\s*)/, `$1${sprite}`);

console.log(`\n${file}: ยุบ ${dupes.length} ไอคอน (${dupes.reduce((n, [, v]) => n + v.length, 0)} จุด) · เล็กลง ${(saved / 1024).toFixed(1)} KB`);
if (WRITE) { writeFileSync(file, html); console.log("เขียนไฟล์แล้ว — ถ่ายภาพเทียบก่อน/หลังด้วย ห้ามเชื่อว่าเหมือนเดิมโดยไม่ดู"); }
else console.log("(ยังไม่เขียนไฟล์ — ใส่ --write ถ้าจะแก้จริง)");
