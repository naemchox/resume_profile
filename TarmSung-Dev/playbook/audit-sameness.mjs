#!/usr/bin/env node
/* =============================================================================
   audit-sameness.mjs — จับ "เดโมสองหน้าเป็นหน้าเดียวกันที่เปลี่ยนรูปกับสี"
   ใช้:  node playbook/audit-sameness.mjs            # ตรวจ work/ ทั้งหมด
        node playbook/audit-sameness.mjs krua-baansuan glow-clinic

   ทำไมต้องมี
   ENGINE.md §1b ข้อ 1 เขียนกฎนี้ไว้ตั้งแต่ต้นแล้ว ("ข้าม reference pass เมื่อไหร่
   สมองจะหยิบโครงของงานที่แล้วมาใช้อัตโนมัติ") พร้อมบันทึกว่าเคยเกิดแล้วหนึ่งครั้ง
   — แล้วมันก็เกิดอีกสามหน้า (21/8/26 jek เห็นเองจากหน้าผลงานว่า 01/03/04 เหมือนกัน
   วัดได้ว่าครัวบ้านสวนกับโกลว์ คลินิกใช้ชื่อคลาสร่วมกัน 54 จาก 62 ตัว = 87%)

   บทเรียนคือ **กฎที่ไม่มีเครื่องจับ = กฎที่ถูกข้ามเงียบๆ ทุกครั้ง** ไฟล์นี้คือเครื่องจับ
   ไม่ใช่กฎเพิ่ม อีกข้อหนึ่ง

   วัดอะไร — และ "ไม่" วัดอะไร (สำคัญกว่า)
   **ฮีโร่ซ้ำกันได้ ไม่ใช่ข้อผิด** (jek ตัดสิน 21/8/26) รูปเต็มจอ + หัวเรื่อง + ปุ่มคู่
   เป็นสูตรที่ทำงานได้จริงและใช้ซ้ำทุกงานได้ ไฟล์นี้จึง **ตัดฮีโร่ออกก่อนวัด** เสมอ
   สิ่งที่ต้องไม่ซ้ำคือ "ข้างใน" — แต่ละ section เลือกใช้เครื่องมือนำเสนออะไร ตารางเทียบ
   ปฏิทิน ไทม์ไลน์ แผนผัง ลิสต์ราคามีเส้นประ การ์ด ฯลฯ และรายละเอียด/สไตล์ของของพวกนั้น
   สองงานที่ข้างในเหมือนกันทั้งชุด = เทมเพลตเดียวเปลี่ยนรูปกับสี ต่อให้ฮีโร่ต่างกันก็ตาม

   วิธีวัด: เทียบคลังชื่อคลาสของเนื้อหา "ใต้ฮีโร่" แบบคู่ต่อคู่ด้วย Jaccard (ร่วมกัน ÷ รวมกัน)
   หักโครงร่วมของ engine (SHELL) และคำของสูตรฮีโร่ (HERO) ออกก่อน

   วัดไม่ได้ / ไม่ได้วัด — เขียนไว้ให้ชัดว่าอย่าไว้ใจตัวเลขนี้เกินจริง
   - คลาส utility (Tailwind ฯลฯ) ถูกตัดทิ้งก่อนเทียบ ไม่งั้นสองหน้าที่ใช้ Tailwind
     จะเหมือนกัน 90% ทั้งที่หน้าตาคนละเรื่อง — หน้าที่เหลือคลาสน้อยกว่า MIN_VOCAB ตัว
     จึงข้ามไป ไม่ใช่ผ่าน (SKIP ≠ PASS ตรงนี้แปลว่า "เครื่องนี้ตรวจหน้านั้นไม่ได้")
   - เปลี่ยนชื่อคลาสทั้งไฟล์แต่ใช้โครงเดิม = จับไม่ได้ ต้องใช้ตาดู
     ตัวเลขนี้เป็นตาข่ายชั้นล่างสุด ไม่ใช่ตัวตัดสินแทนคน
   ========================================================================== */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, "work");

const FAIL = 0.50;      // เกินนี้ = หน้าเดียวกันเปลี่ยนรูป ต้องแก้
const WARN = 0.35;      // เกินนี้ = เริ่มใช้คำศัพท์ชุดเดียวกัน ควรดูด้วยตา
const MIN_VOCAB = 12;   // น้อยกว่านี้แปลว่าหน้านั้นเขียนด้วย utility เป็นหลัก วัดไม่ได้

/* ชื่อคลาสที่เป็น "ค่าการจัดวาง" ไม่ใช่ "ชื่อของชิ้นส่วน" — พวกนี้ซ้ำกันได้โดยไม่ผิด
   จึงต้องตัดทิ้งก่อนเทียบ ไม่งั้นตัวเลขจะบวมจนไม่มีความหมาย */
const UTILITY = new RegExp(
  "^(?:" +
  "(?:sm|md|lg|xl|2xl|hover|focus|focus-visible|active|group|peer|dark|light|print|motion-safe|motion-reduce|first|last|odd|even):" +
  "|(?:text|bg|border|divide|ring|outline|fill|stroke|from|via|to|p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|w|h|size|min|max|gap|grid|col|row|flex|basis|grow|shrink|order|items|justify|content|place|self|space|inset|top|left|right|bottom|z|rounded|shadow|opacity|blur|backdrop|transition|duration|delay|ease|scale|rotate|translate|skew|origin|overflow|object|aspect|leading|tracking|font|whitespace|break|list|indent|align|table|cursor|select|pointer|resize|snap|touch|will|contain|isolate|mix|filter|antialiased|sr)(?:-|$)" +
  "|(?:block|inline|inline-block|flow-root|hidden|visible|invisible|absolute|relative|fixed|sticky|static|uppercase|lowercase|capitalize|normal-case|italic|not-italic|underline|overline|line-through|no-underline|truncate|container)$" +
  ")"
);

/* โครงร่วมของ engine — ของที่ "ตั้งใจ" ใช้ซ้ำทุกงานตาม ENGINE.md (แถบบน ฟุตเตอร์ ปุ่ม
   ชั้น reveal ตัวนับ) ถ้านับพวกนี้ด้วย ทุกคู่จะเหมือนกัน 50%+ ตั้งแต่ยังไม่เขียนอะไรเลย
   แล้วตัวเลขก็ไม่บอกอะไร สิ่งที่เราอยากจับคือ "คำศัพท์ของการจัดวางเนื้อหา" ต่างหาก —
   .hero-photo/.chips/.cards/.facts/.steps พวกนี้ยังนับ เพราะมันคือสูตรของหน้า ไม่ใช่เครื่องยนต์
   เพิ่มชื่อเข้าลิสต์นี้ได้เฉพาะของที่ ENGINE.md บอกว่าใช้ร่วมกันจริง ห้ามเติมเพื่อให้ตัวเลขสวยขึ้น */
const SHELL = new Set([
  "no-js", "js", "still", "in", "skip", "wrap",
  "site-header", "site-footer", "brand", "mark", "nav", "nav-links", "nav-cta",
  "btn", "btn--primary", "btn--ghost", "btn--sm", "btn--lg",
  "reveal", "d1", "d2", "d3", "d4", "w", "nb", "num", "star", "rule",
  "section", "section--tint", "band", "deep", "brandmark",
]);

/* คำของ "สูตรฮีโร่" — ตัดออกก่อนวัด เพราะฮีโร่ซ้ำกันได้โดยตั้งใจ (ดูหัวไฟล์)
   ถ้าวันหนึ่งเปลี่ยนใจว่าฮีโร่ต้องต่างกันด้วย ให้ลบชุดนี้ทิ้ง ไม่ต้องแก้ที่อื่น */
const HERO = new Set([
  "on-photo", "hero-media", "hero-grain", "hero-copy", "hero-photo", "hero-cta",
  "lead", "lede", "chips", "act", "slots", "eyebrow", "ornament", "rule-label",
]);

const vocabOf = (html) => {
  const out = new Set();
  for (const m of html.matchAll(/\sclass="([^"]*)"/g)) {
    for (const raw of m[1].split(/\s+/)) {
      const t = raw.trim();
      if (!t) continue;
      if (t.includes(":") || t.includes("/") || t.includes("[") || t.includes(".")) continue; // utility ที่มี variant/เศษส่วน/ค่าดิบ
      if (/\d/.test(t) && t.length <= 4) continue;      // p4, w12 ฯลฯ
      if (UTILITY.test(t)) continue;
      if (SHELL.has(t) || HERO.has(t) || t.startsWith("hero")) continue;
      if (t.length < 3) continue;
      out.add(t);
    }
  }
  return out;
};

const want = process.argv.slice(2);
const names = (want.length ? want : readdirSync(WORK).filter((d) => existsSync(join(WORK, d, "index.html"))))
  .filter((d) => existsSync(join(WORK, d, "index.html")));

const pages = names.map((name) => ({ name, vocab: vocabOf(readFileSync(join(WORK, name, "index.html"), "utf8")) }));

const measurable = pages.filter((p) => p.vocab.size >= MIN_VOCAB);
const skipped = pages.filter((p) => p.vocab.size < MIN_VOCAB);

/* ---- คู่พี่น้อง: <ชื่อ> กับ <ชื่อ>-multi ไม่ใช่ "สองโปรเจกต์" ------------------
   กฎที่ไฟล์นี้บังคับคือ ENGINE.md ข้อ 4b "ข้างในห้ามซ้ำ **ข้ามโปรเจกต์**" — ของที่
   ห้ามซ้ำคือเดโมของสองแบรนด์ที่คนละลูกค้าจ้าง ไม่ใช่เดโมใบเดียวกันสองแพ็ก
   the-bed-multi คือ the-bed แบรนด์เดิม เนื้อหาเดิม กระจายเป็น 5 หน้า ประกอบด้วย
   playbook/build-multi.mjs เครื่องเดียวกัน — มันต้องใช้โครงร่วมกัน นั่นคือสิ่งที่
   แพ็ก ฿7,500 ขาย ไม่ใช่ข้อผิดที่ต้องไปรื้อ (วัดได้ 66% แล้วขึ้น ✗ มาตลอด)
   ไฟล์นี้เตือนตัวเองไว้ข้างบนแล้วว่า "เครื่องตรวจที่รายงานของที่ไม่ใช่ข้อผิด สอนให้คน
   เลิกอ่านผลของมัน" — คู่พี่น้องคือกรณีนั้นพอดี
   ข้ามแบบ **พูดออกมา** ไม่ใช่เงียบ: ยังพิมพ์คะแนนให้เห็นในบรรทัดแยก เพราะ SKIP ≠ PASS
   ถ้าวันหนึ่งอยากให้ multi ต่างจากตัวตั้งจริงๆ ตัวเลขยังอยู่ตรงนั้นให้ดู */
const sibling = (a, b) => a.replace(/-multi$/, "") === b.replace(/-multi$/, "");

const rows = [], siblings = [];
for (let i = 0; i < measurable.length; i++) {
  for (let j = i + 1; j < measurable.length; j++) {
    const a = measurable[i], b = measurable[j];
    const shared = [...a.vocab].filter((t) => b.vocab.has(t));
    const union = new Set([...a.vocab, ...b.vocab]).size;
    const row = { a: a.name, b: b.name, j: shared.length / union, shared };
    (sibling(a.name, b.name) ? siblings : rows).push(row);
  }
}
rows.sort((x, y) => y.j - x.j);

let bad = 0, warn = 0;
console.log("ความเหมือนของโครงกระดูก (ชื่อคลาสที่เขียนเอง) — คู่ต่อคู่\n");
for (const r of rows) {
  const pct = (r.j * 100).toFixed(0);
  const mark = r.j >= FAIL ? "✗" : r.j >= WARN ? "!" : "✓";
  if (r.j >= FAIL) bad++; else if (r.j >= WARN) warn++;
  if (r.j < WARN) continue;   // คู่ที่ต่างกันชัดแล้วไม่ต้องรก
  console.log(`${mark} ${r.a} ↔ ${r.b} = ${pct}%  (ร่วมกัน ${r.shared.length} ตัว)`);
  if (r.j >= FAIL) console.log(`   ใช้ร่วมกัน: ${r.shared.slice(0, 18).join(" ")}${r.shared.length > 18 ? " …" : ""}`);
}
if (!rows.some((r) => r.j >= WARN)) console.log("✓ ไม่มีคู่ไหนใช้คำศัพท์ชุดเดียวกันเกิน 35% — แต่ละหน้ามีโครงของตัวเอง");
if (siblings.length) {
  console.log("\nคู่พี่น้อง (<ชื่อ> กับ <ชื่อ>-multi) — ไม่นับเป็นข้ามโปรเจกต์ ไม่ตัดสิน แต่โชว์ไว้ให้เห็น:");
  for (const r of siblings.sort((x, y) => y.j - x.j)) {
    console.log(`  – ${r.a} ↔ ${r.b} = ${(r.j * 100).toFixed(0)}%  (ร่วมกัน ${r.shared.length} ตัว)`);
  }
}

if (skipped.length) {
  console.log(`\nวัดไม่ได้ (เขียนด้วย utility class เป็นหลัก คลังชื่อเหลือ < ${MIN_VOCAB} ตัว) — ต้องดูด้วยตา ไม่ใช่ผ่าน:`);
  for (const s of skipped) console.log(`  – ${s.name} (${s.vocab.size} ตัว)`);
}

/* เคยมีการวัดที่สอง "ลายนิ้วมือของฮีโร่" ตรงนี้ ถอดออก 21/8/26 หลัง jek ตัดสินว่า
   ฮีโร่ซ้ำกันได้ — เครื่องตรวจที่รายงานของที่ไม่ใช่ข้อผิด จะสอนให้คนเลิกอ่านผลของมัน
   ซึ่งเป็นโรคเดียวกับกฎร้อยแก้วที่ไฟล์นี้เกิดมาเพื่อแก้ */

console.log(`\nเทียบ ${rows.length} คู่ · ตก ${bad} · เตือน ${warn}`);
if (bad) {
  console.log(
    "\nตก = ข้างในสองหน้านี้เป็นชุดเดียวกัน (ฮีโร่ไม่นับ ซ้ำได้) ลูกค้าเลื่อนลงไปแล้วจะเจอ\n" +
    "หน้าเดิมที่เปลี่ยนรูปกับสี แก้ที่ 'เครื่องมือนำเสนอของแต่ละ section' ไม่ใช่พาเลตต์:\n" +
    "ข้อมูลคนละชนิดต้องใช้เครื่องมือคนละอย่าง — ลิสต์ราคา/ตารางเทียบ/ปฏิทิน/ไทม์ไลน์/แผนผัง/\n" +
    "ก่อน-หลัง/สเปกชีต ถ้าทุก section ของทั้งสองหน้าเป็น 'การ์ด 3 ใบต่อแถว' เหมือนกัน แปลว่ายังไม่ได้เลือก"
  );
  process.exit(1);
}
