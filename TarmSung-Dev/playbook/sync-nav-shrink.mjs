/* กระจาย "กลไกหัวเว็บหด" ตัวเดียวไปทุกเดโม — ใช้: node playbook/sync-nav-shrink.mjs [--check]
   แหล่งเดียว = playbook/snippets/nav-shrink.css · ปลายทางคือช่วงระหว่าง >>> nav-shrink … <<< nav-shrink

   ทำไมต้องมีสคริปต์นี้: LOG-DEMO §15 วัดแล้วเจอว่า "หัวเว็บหด" ถูกเขียนไว้ 4 กลไก 9 ชื่อคลาส
   ใน 10 เดโม ทั้งที่คอมเมนต์ในโค้ดเขียนเองว่า "ทุกเดโมใช้บล็อกนี้ชุดเดียวกัน"
   ผลลัพธ์เหมือนกันแต่คนละกลไก = บั๊กที่รอเวลา (summit เกย 20px อยู่เป็นเดือนโดยไม่มีใครเห็น)
   ก๊อปด้วยมือแล้วมันเพี้ยนอีกแน่ จึงต้องมีตัวเขียนให้ · ด่านตรวจคู่กันคือ playbook/audit-nav.mjs

   ใบที่ไม่อยู่ในลิสต์ = ข้อยกเว้นที่ประกาศไว้ (ดู EXCEPT ข้างล่าง) ไม่ใช่ลืม */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOCK = readFileSync(join(REPO, "playbook/snippets/nav-shrink.css"), "utf8").trim();

/* ไฟล์ที่ถือก้อนนี้ของแต่ละเดโม (บางใบ CSS อยู่ใน <style> ในหน้าเลย) */
const TARGETS = {
  "chang-chat": "css/styles.css",
  "gamedock": "css/styles.css",
  "glow-clinic": "css/styles.css",
  "glow-clinic-multi": "css/glow.css",
  "homecraft": "index.html",
  "krua-baansuan": "css/styles.css",
  "lumen": "tw.css",
  "summit": "index.html",
  "the-bed": "css/after-tailwind.css",
  /* สองใบนี้หน้าเว็บลิงก์ css/tailwind.css (ไฟล์ที่ freeze-tailwind.mjs สร้าง) ไม่ใช่ after-tailwind.css
     ตราบใดที่ freeze ยังไม่ต่อท้ายไฟล์เสริมให้เอง ต้องเขียนทั้งสองที่ ไม่งั้นของที่แก้ไม่ขึ้นจริง (LOG-DEMO §15 หนี้ข้อ 2) */
  "the-bed (tailwind.css)": "css/tailwind.css",
  "the-bed-multi": "css/after-tailwind.css",
  "the-bed-multi (tailwind.css)": "css/tailwind.css",
  "the-terrace": "css/styles.css",
  "the-terrace-multi": "css/styles.css",
};

/* ข้อยกเว้น — เขียนเหตุผลไว้เสมอ ข้อยกเว้นที่ไม่มีคำอธิบาย = บั๊ก */
const EXCEPT = {
  "velvet-leaf": "เป็นบันเดิล React ที่คอมไพล์แล้ว (ไม่มีซอร์สในรีโป) คลาสหัวเว็บถูกเขียนใน JS ที่ minify แล้ว — เปลี่ยนกลไกต้องรื้อบันเดิล ความเสี่ยงสูงกว่าประโยชน์",
  "parcela": "ใบนี้ไม่มีหัวเว็บหดเลยตั้งแต่ต้น (แถบไม่ติดหน้าจอ) — ไม่ใช่คนละกลไก แต่คือไม่มีของ",
};

const START = "/* >>> nav-shrink", END = "/* <<< nav-shrink */";
const check = process.argv.includes("--check");
let bad = 0;

for (const [demo, rel] of Object.entries(TARGETS)) {
  const p = join(REPO, "work", demo.replace(/ \(.*\)$/, ""), rel);
  const src = readFileSync(p, "utf8");
  const i = src.indexOf(START), j = src.indexOf(END);
  if (i < 0 || j < 0) { console.log(`❌ ${demo.padEnd(20)} ไม่มีหมุด >>> nav-shrink ใน ${rel}`); bad++; continue; }
  const cur = src.slice(i, j + END.length);
  if (cur === BLOCK) { console.log(`✅ ${demo.padEnd(20)} ตรงกับต้นฉบับ`); continue; }
  if (check) { console.log(`❌ ${demo.padEnd(20)} ก้อนเพี้ยนจากต้นฉบับ (${rel})`); bad++; continue; }
  writeFileSync(p, src.slice(0, i) + BLOCK + src.slice(j + END.length));
  console.log(`✏️  ${demo.padEnd(20)} เขียนใหม่แล้ว (${rel})`);
}
for (const [d, why] of Object.entries(EXCEPT)) console.log(`⚪ ${d.padEnd(20)} ข้อยกเว้น: ${why}`);
process.exit(bad ? 1 : 0);
