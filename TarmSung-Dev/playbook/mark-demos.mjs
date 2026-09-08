#!/usr/bin/env node
/* =============================================================================
   mark-demos.mjs — เดโมทุกหน้าใน work/ ต้องมี 2 อย่างเสมอ
     1. <meta name="robots" content="noindex,nofollow">  กัน Google เก็บหน้าเดโม
        ไปแย่งอันดับกับเว็บเรา และกันคนหลงเข้ามาคิดว่าเป็นเว็บของธุรกิจนั้นจริง
     2. <script src="/work/_demo-badge.js">              ป้าย "งานสาธิต · ตามสั่ง"

   ใช้:  node playbook/mark-demos.mjs            # ตรวจอย่างเดียว (โหมดด่าน, ไม่แตะไฟล์)
        node playbook/mark-demos.mjs --apply    # เติมให้ครบ

   ทำไมต้องมีไฟล์นี้ (23/8/26):
   noindex ถูกใส่ด้วยมือทีละใบตอนสร้างเดโม ผลคือเดโมหน้าเดียวมีครบ 11 ใบ แต่เดโม
   5 หน้าทั้งสามใบ (glow-clinic-multi · the-bed-multi · the-terrace-multi) ไม่มีเลย
   สักหน้าเดียว รวม 27 หน้าที่เปิดให้ Google เก็บอยู่โดยไม่มีใครรู้ — เพราะกฎอยู่ใน
   หัวคน ไม่ได้อยู่ในเครื่อง ไฟล์นี้ย้ายกฎมาไว้ในเครื่อง แล้วต่อเข้า deploy.mjs
   เดโมใบใหม่ที่ลืมใส่จะตกด่านตั้งแต่ก่อนปล่อย ไม่ใช่ไปรู้ทีหลังจาก Search Console

   เดโม 5 หน้าถูกประกอบจาก _src/shell.html ด้วย build-multi.mjs — ต้องเติมทั้ง
   หน้าที่ประกอบเสร็จแล้ว "และ" ตัว shell ไม่งั้นวันที่ build ใหม่ของหายทั้งชุด
   ========================================================================== */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative , sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, "work");
const APPLY = process.argv.includes("--apply");

const META  = '<meta name="robots" content="noindex,nofollow">';
const BADGE = '<script src="/work/_demo-badge.js" defer></script>';

/* หน้าเต็มเท่านั้น — ชิ้นส่วนใน _src/ เป็นเศษ HTML ไม่มี <head>/<body> ยกเว้น
   shell.html ที่เป็นโครงของทั้งหน้า (ดูหัวไฟล์)
   24/8/26 เทียบพาธด้วย "/" ตรงๆ ไม่ได้ — บนวินโดวส์ join() คั่นด้วย \ ตัวกรองจึงไม่ทำงาน
   ชิ้นส่วน _src/ ทุกไฟล์เลยถูกนับเป็นหน้าเว็บ แล้วฟ้องว่า "ไม่มี <head> เติมเองไม่ได้"
   = ด่านนี้ตกตลอดบนเครื่องนี้ ปล่อยเว็บไม่ได้ */
const u = (p) => p.split(sep).join("/");
const isPage = (p) => p.endsWith(".html") &&
  (!u(p).includes("/_src/") || u(p).endsWith("/_src/shell.html"));

const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

const pages = walk(WORK).filter(isPage).sort();
let missing = 0, fixed = 0;

for (const p of pages) {
  const rel = relative(ROOT, p);
  let html = readFileSync(p, "utf8");
  const before = html;

  const hasMeta  = /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html);
  const hasBadge = html.includes("_demo-badge.js");

  if (!hasMeta) {
    if (!/<head[^>]*>/i.test(html)) { console.error(`✗ ${rel} ไม่มี <head> — เติมเองไม่ได้`); missing++; continue; }
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n  ${META}`);
  }
  if (!hasBadge) {
    if (!/<\/body>/i.test(html)) { console.error(`✗ ${rel} ไม่มี </body> — เติมเองไม่ได้`); missing++; continue; }
    html = html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${BADGE}\n</body>`);
  }

  if (html === before) continue;
  const lack = [!hasMeta && "noindex", !hasBadge && "badge"].filter(Boolean).join(" + ");
  if (APPLY) { writeFileSync(p, html); fixed++; console.log(`เติม ${lack.padEnd(18)} ${rel}`); }
  else { missing++; console.error(`✗ ขาด ${lack.padEnd(18)} ${rel}`); }
}

console.log(`\nหน้าเดโม ${pages.length} หน้า · ${APPLY ? `เติมแล้ว ${fixed}` : `ขาด ${missing}`}`);
if (!APPLY && missing) {
  console.error("แก้ด้วย: node playbook/mark-demos.mjs --apply");
  process.exit(1);
}
if (APPLY && missing) process.exit(1);
