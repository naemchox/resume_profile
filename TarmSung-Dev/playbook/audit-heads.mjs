#!/usr/bin/env node
/* =============================================================================
   audit-heads.mjs — กันหัวข้อหายจากหน้าที่ประกอบด้วย build-multi.mjs
   ใช้:  node playbook/audit-heads.mjs           # ตรวจเดโมหลายหน้าทุกใบ
        node playbook/audit-heads.mjs <ใบ>       # ตรวจเฉพาะใบเดียว

   ทำไมมีไฟล์นี้ (22/8/26):
   build-multi.mjs มีขั้นตอน "ตัดหัวข้อของบล็อกแรกทิ้งถ้าซ้ำกับหัวหน้าย่อย" ฉบับแรก
   ของมันตัด ".section-head อันแรกที่เจอในหน้า" ซึ่งผิด — หน้าที่บล็อกแรกไม่มีหัวข้อ
   (แถบที่อยู่ · ตารางคิดราคา) มันไปกินหัวของบล็อก "ถัดไป" แทน ผลคือ /contact ของ
   เทอเรสเหลือปุ่มสองปุ่มลอยกลางที่ว่าง ที่อยู่กับเวลาเปิดหายทั้งก้อน และคลินิกเสีย
   หัวข้ออีกสามจุด รวม 5 หน้าใน 3 เดโม

   สิ่งที่ทำให้พลาด ไม่ใช่โค้ด แต่คือวิธีตรวจ: ผมถ่ายภาพครบทุกหน้าแล้วเปิดดูแค่สองหน้า
   jek เป็นคนเปิด Safari เองแล้วเจอ — "ถ่ายไว้แล้วไม่ได้เปิดดู" = ไม่ได้ตรวจ
   ด่านนี้จึงต้องเป็นของที่รันได้ ไม่ใช่ข้อตกลงว่าจะดูภาพให้ครบ

   เกณฑ์: <section> ที่มีเนื้อหาเกิน 60 ตัวอักษรแต่ไม่มี <h1>/<h2> = น่าสงสัย
   ของที่ตั้งใจไม่มีหัวจริงๆ (แถบตัวเลข · แถบวิ่ง · บล็อกที่หัวถูกตัดเพราะซ้ำกับ
   หัวหน้าย่อย) ใส่ไว้ใน ALLOW ข้างล่างพร้อมเหตุผล — ข้อยกเว้นที่ไม่มีคำอธิบาย = บั๊ก
   ========================================================================== */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/* หาเดโมหลายหน้าเอง แทนลิสต์ฮาร์ดโค้ด (แก้ 31/8/26)
   ของเดิมเขียนชื่อไว้ 3 ใบตายตัว → เดโมหลายหน้าใบที่ 4 (teung-chao) ถูกสร้างขึ้นมา
   แล้วด่านนี้ยังตอบ "ตรวจ 33 หน้า · ตก 0" เท่าเดิม ทั้งที่ไม่ได้แตะใบใหม่เลยสักหน้า
   = ด่านที่ตอบผ่านโดยไม่ได้ตรวจ โรคเดียวกับ audit-nav/audit-height ที่แก้ไปวันเดียวกัน

   เกณฑ์ = "มีโฟลเดอร์ลูกที่มี index.html" ไม่ใช่ "มี _src/site.mjs"
   เพราะ glow-clinic-multi เป็นเดโมหลายหน้าที่เขียนมือ ไม่ได้ประกอบด้วย build-multi
   ถ้าใช้เกณฑ์เครื่องประกอบ ใบนั้นจะหลุดออกจากด่านเงียบๆ (ลองแล้ว coverage ตก 33→21) */
const WORK = join(ROOT, "work");
const isMulti = (name) => {
  const base = join(WORK, name);
  try {
    return readdirSync(base, { withFileTypes: true })
      .some((k) => k.isDirectory() && !k.name.startsWith("_") &&
                   existsSync(join(base, k.name, "index.html")));
  } catch { return false; }
};
const DEMOS = readdirSync(WORK, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_") && isMulti(d.name))
  .map((d) => d.name).sort();

/* คีย์ = <เดโม>|<หน้า>|<id หรือ ลำดับ section> */
const ALLOW = {
  "the-terrace-multi|index.html|ที่3":   "แถบตัวเลขของเวนิว — ฉบับหน้าเดียวก็ไม่มีหัวข้อ เป็นแถบสถิติไม่ใช่เซ็กชันเนื้อหา",
  "the-terrace-multi|venue/index.html|rooms": "หัวถูกตัดเพราะซ้ำกับ h1 ของหัวหน้าย่อยคำต่อคำ (build-multi ตัดให้ตามกติกา)",
  "the-terrace-multi|packages/index.html|packages": "บล็อกแพ็กเกจของต้นฉบับเป็นกริดการ์ดที่ไม่มีหัวข้อของตัวเองอยู่แล้ว (ใช้ aria-label) และวางถัดจาก h1 ของหัวหน้าย่อยทันที",
  "the-bed-multi|index.html|ที่2":       "แถบตัวอักษรวิ่ง (marquee) — ฉบับหน้าเดียวก็ไม่มีหัวข้อ",
  "glow-clinic-multi|programs/index.html|programs": "หัวถูกตัดเพราะซ้ำกับ h1 ของหัวหน้าย่อยคำต่อคำ",
};

const walk = (d, o = []) => {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    if (f.name.startsWith("_") || ["css", "js", "img", "public"].includes(f.name)) continue;
    const p = join(d, f.name);
    f.isDirectory() ? walk(p, o) : (p.endsWith(".html") && o.push(p));
  }
  return o;
};

const list = process.argv[2] ? [process.argv[2]] : DEMOS;
let bad = 0, allowed = 0, pages = 0;

for (const demo of list) {
  const root = join(ROOT, "work", demo);
  if (!existsSync(root)) { console.error(`✗ ไม่มี work/${demo}`); process.exit(2); }
  for (const f of walk(root).sort()) {
    pages++;
    /* 24/8/26 คีย์ใน ALLOW เขียนด้วย "/" แต่บนวินโดวส์ join() คืน "\" มา คีย์จึงไม่มีวันตรง
       ผลคือสามหน้าที่ยกเว้นไว้แล้ว (venue/ packages/ programs/) ตกด่านเฉพาะบนเครื่องนี้
       และ deploy.mjs ไม่มี flag ให้ข้ามด่านนี้ = ปล่อยเว็บจากวินโดวส์ไม่ได้เลย */
    const rel = f.slice(root.length + 1).split(sep).join("/");
    const s = readFileSync(f, "utf8");
    const main = s.slice(s.indexOf("<main"), s.indexOf("</main>"));
    main.split(/<section\b/).slice(1).forEach((sec, i) => {
      if (/class="[^"]*hero--page/.test(sec)) return;   // หัวหน้าย่อยใช้ h1 ของมันเอง
      const id = (sec.match(/id="([^"]+)"/) || [])[1] || `ที่${i + 1}`;
      const txt = sec.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (/<h[12]\b/.test(sec) || txt.length <= 60) return;
      const key = `${demo}|${rel}|${id}`;
      if (ALLOW[key]) { allowed++; return; }
      console.error(`✗ ${demo}/${rel} → section "${id}" มีเนื้อหา ${txt.length} ตัวอักษรแต่ไม่มีหัวข้อ`);
      console.error(`   ขึ้นต้นว่า: ${txt.slice(0, 70)}…`);
      bad++;
    });
  }
}

console.log(`audit-heads: ตรวจ ${pages} หน้า · ยกเว้นตามเหตุผลที่เขียนไว้ ${allowed} · ตก ${bad}`);
process.exit(bad ? 1 : 0);
