/* หน้าครบไหม + reference ถูกรับเข้าระบบไหม (DEMO-SPEC S1.0 + S1.1)
   ใช้: node playbook/audit-pages.mjs --inv <INVENTORY.md> --demo <โฟลเดอร์เดโม>

   ทำไมต้องมีไฟล์นี้: ลูกค้าที่มีเว็บเก่า 8 หน้าแล้วได้เว็บใหม่ 1 หน้า คือลูกค้าที่เสียของ
   ต่อให้หน้าเดียวนั้นสวยกว่าก็ตาม — งานเราคืออัปเกรดดีไซน์ ไม่ใช่ย่อเว็บเขา
   และ reference ที่เจ้าของส่งมาจาก Pinterest/เว็บอื่น เคยค้างอยู่ในแชทแล้วหายไปกับรอบนั้น
   ทั้งสองอย่างไม่มีด่านไหนในกองมองเห็นเลย เพราะทุกด่านตรวจ "หน้าที่ทำออกมา" ไม่ได้ตรวจ
   ว่ามันครบเทียบกับของที่ลูกค้ามีอยู่ไหม

   ตาราง inventory ที่อ่าน (รูปแบบง่ายๆ ไม่ผูกคอลัมน์ตายตัว):
     ## หน้าเว็บ
     | หน้าเดิม | ที่อยู่เดิม | หน้าใหม่ |
     |---|---|---|
     | หน้าแรก | /index.html | index.html |
     | บริการ  | /service.html | service.html |
     | โปรโมชั่น | /promotion.html | ยุบเข้า index.html ส่วน #price |
   ช่อง "หน้าใหม่" เขียนได้สองแบบ: ชื่อไฟล์จริง หรือประโยคที่ขึ้นต้นด้วย "ยุบเข้า" พร้อมบอกปลายทาง
   หน้าที่ไม่มีทั้งสองอย่าง = หน้าที่หายไปเฉยๆ = ตก */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const INV = arg("--inv"), DEMO = arg("--demo");
if (!INV || !DEMO) { console.log("ใช้: node playbook/audit-pages.mjs --inv <INVENTORY.md> --demo <โฟลเดอร์เดโม>"); process.exit(2); }
if (!existsSync(INV)) { console.log(`❌ ไม่มีไฟล์ inventory: ${INV} — S1.1 เริ่มที่ไฟล์นี้ ไม่มีไฟล์ = ยังไม่ได้เริ่ม`); process.exit(1); }
if (!existsSync(DEMO)) { console.log(`❌ ไม่มีโฟลเดอร์เดโม: ${DEMO}`); process.exit(2); }

const inv = readFileSync(INV, "utf8");
const lines = inv.split("\n");
let fail = 0;

/* ---- 1. ตารางหน้าเว็บ ---- */
const secStart = lines.findIndex((l) => /^##\s*หน้าเว็บ/.test(l));
if (secStart < 0) {
  fail++;
  console.log('❌ S1.1 inventory ไม่มีหัวข้อ "## หน้าเว็บ" — ยังไม่ได้ตอบว่าเว็บเก่าเป็นหน้าเดียวหรือหลายหน้า');
} else {
  const rows = [];
  for (let i = secStart + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const l = lines[i].trim();
    if (!l.startsWith("|") || /^\|\s*-+/.test(l)) continue;
    const cells = l.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3 || /^หน้าเดิม/.test(cells[0])) continue;
    rows.push({ old: cells[0], from: cells[1], to: cells[cells.length - 1] });
  }
  const missing = rows.filter((r) => {
    if (/^ยุบเข้า/.test(r.to)) return false;                 /* ยุบได้ ถ้าบอกปลายทาง */
    const file = r.to.replace(/`/g, "").split(/\s+/)[0];
    return !file || !existsSync(join(DEMO, file));
  });
  console.log(`หน้าของลูกค้าในตาราง: ${rows.length} หน้า · มีไฟล์จริง/ยุบพร้อมเหตุผล ${rows.length - missing.length} หน้า`);
  if (!rows.length) { fail++; console.log('❌ ตาราง "## หน้าเว็บ" ว่าง — ต้องไล่จาก sitemap/เมนูของเว็บเก่าให้ครบ'); }
  if (missing.length) {
    fail++;
    console.log(`❌ S1.1 หน้าของลูกค้าหายไป ${missing.length} หน้า — อัปเกรดดีไซน์ได้ แต่ห้ามย่อเว็บเขา`);
    missing.forEach((m) => console.log(`   · ${m.old} (${m.from}) → "${m.to}"`));
  }

  /* หน้าใหม่ต้องเดินไปถึงได้จากเมนู ไม่ใช่มีไฟล์ลอยอยู่เฉยๆ */
  const home = join(DEMO, "index.html");
  if (existsSync(home)) {
    const html = readFileSync(home, "utf8");
    const orphan = rows.filter((r) => !/^ยุบเข้า/.test(r.to))
      .map((r) => r.to.replace(/`/g, "").split(/\s+/)[0])
      .filter((f) => f && f !== "index.html" && existsSync(join(DEMO, f)) && !html.includes(f));
    if (orphan.length) {
      fail++;
      console.log(`❌ S1.1 มีไฟล์แต่ไม่มีลิงก์จากหน้าแรกไปถึง ${orphan.length} หน้า: ${orphan.join(" · ")}`);
    }
  }
}

/* ---- 2. reference ที่เจ้าของส่งมา ---- */
const inspo = join(DEMO, "..", "_ref", "inspo");
const hasRefHead = /^##\s*reference/im.test(inv);
if (existsSync(inspo)) {
  const files = readdirSync(inspo).filter((f) => !f.startsWith("."));
  const low = inv.toLowerCase();
  const unlogged = files.filter((f) => !low.includes(basename(f).toLowerCase()));
  console.log(`reference ที่เจ้าของส่งมา: ${files.length} ใบ · เขียนไว้ใน inventory แล้ว ${files.length - unlogged.length} ใบ`);
  if (!hasRefHead && files.length) { fail++; console.log('❌ S1.0 มีไฟล์ใน _ref/inspo/ แต่ inventory ไม่มีหัวข้อ "## reference"'); }
  if (unlogged.length) {
    fail++;
    console.log(`❌ S1.0 reference ${unlogged.length} ใบยังไม่ได้เขียนว่าจะเอาอะไรจากมัน — ใบที่ตอบไม่ได้ว่าเอาอะไร คือรูปที่ชอบเฉยๆ ไม่ใช่ reference`);
    unlogged.slice(0, 8).forEach((f) => console.log(`   · ${f}`));
  }
} else {
  console.log("reference: ไม่มีโฟลเดอร์ _ref/inspo/ — ข้อนี้ข้ามได้ถ้าเจ้าของยังไม่ส่งอะไรมา");
}

console.log(fail ? "\nไม่ผ่านด่านหน้าและ reference (DEMO-SPEC S1.0 + S1.1)" : "\nผ่าน — หน้าครบและ reference ถูกรับเข้าระบบแล้ว");
process.exit(fail ? 1 : 0);
