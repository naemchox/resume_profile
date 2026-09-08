/* กระจาย "ฟอร์มจอง" ตัวเดียวไปทุกเดโมที่มี — ใช้: node playbook/sync-booking-form.mjs [--check]
   แหล่งเดียว = playbook/snippets/booking-form.{css,js} · ปลายทาง = <demo>/css/booking.css, <demo>/js/booking.js

   เหตุผลเดียวกับ sync-nav-shrink.mjs: ของชนิดเดียวกันต้องใช้กลไกเดียวกัน
   ก๊อปด้วยมือแล้วมันเพี้ยนแน่ (LOG-DEMO §15 หัวเว็บหด 4 กลไก 9 ชื่อคลาส)
   markup ไม่ sync เพราะแต่ละร้านมีโซน/ช่วงเวลาไม่เท่ากัน — ต้นแบบอยู่ที่ snippets/booking-form.html */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = readFileSync(join(REPO, "playbook/snippets/booking-form.css"), "utf8");
const JS  = readFileSync(join(REPO, "playbook/snippets/booking-form.js"), "utf8");

/* ใบที่ "มีฟอร์มจอง" เท่านั้น — ใบที่ไม่อยู่ในลิสต์คือยังไม่มีฟอร์ม ไม่ใช่ลืม */
const TARGETS = ["krua-baansuan"];

const check = process.argv.includes("--check");
let bad = 0;
for (const demo of TARGETS) {
  for (const [rel, want] of [["css/booking.css", CSS], ["js/booking.js", JS]]) {
    const file = join(REPO, "work", demo, rel);
    if (!existsSync(file)) { console.log(`ขาด ${demo}/${rel}`); bad++; continue; }
    const got = readFileSync(file, "utf8");
    if (got === want) continue;
    if (check) { console.log(`ต่าง ${demo}/${rel}`); bad++; }
    else { writeFileSync(file, want); console.log(`เขียนใหม่ ${demo}/${rel}`); }
  }
}
console.log(bad ? `ไม่ผ่าน ${bad} จุด` : `booking-form ตรงกันทุกใบ (${TARGETS.length} ใบ)`);
process.exit(bad && check ? 1 : 0);
