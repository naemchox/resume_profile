#!/usr/bin/env node
/* =============================================================================
   switch-domain.mjs — ย้ายชื่อโดเมนของเว็บทั้งเว็บในคำสั่งเดียว
   ใช้:  node playbook/switch-domain.mjs tarmsung.com          # ดูก่อนว่าจะแก้อะไร
        node playbook/switch-domain.mjs tarmsung.com --apply   # แก้จริง

   ทำไมต้องมีไฟล์นี้: ชื่อโฮสต์ไม่ได้อยู่แค่ในลิงก์ที่มองเห็น มันอยู่ใน canonical,
   og:url, og:image, JSON-LD, sitemap.xml และลิงก์ที่เราก๊อปส่งลูกค้าใน PORTFOLIO.md
   ตอนย้ายจาก netlify มา pages.dev มีจุดที่ตกค้างข้ามวัน (canonical ยังชี้โดเมนที่ตาย
   ไปแล้ว) เพราะแก้ด้วยมือทีละไฟล์ — ครั้งนี้ให้เครื่องไล่แทน แล้วรายงานว่าแตะอะไรบ้าง

   สิ่งที่สคริปต์นี้ทำไม่ได้ (ต้องทำในแดชบอร์ด Cloudflare):
   1. ผูกโดเมนเข้าโปรเจกต์ Pages (Pages > tarmsung > Custom domains > Set up)
   2. ตั้ง Redirect Rule ให้ *.pages.dev 301 ไปโดเมนใหม่ — _redirects จับ hostname
      ไม่ได้ มันจับได้แค่ path ดังนั้นกฎนี้ต้องอยู่ระดับโซน
   ========================================================================== */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OLD = "tarmsung.pages.dev";
const next = process.argv[2];
const apply = process.argv.includes("--apply");

if (!next || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(next)) {
  console.error("ใช้: node playbook/switch-domain.mjs <โดเมนใหม่> [--apply]");
  process.exit(2);
}

/* ไฟล์ที่รู้ว่ามีชื่อโฮสต์อยู่จริง — นับไว้แล้วก่อนเขียนสคริปต์นี้:
   PORTFOLIO.md 10 จุด · index.html 4 · reference.html 3 · sitemap.xml 3 */
/* work/_demo-badge.js มีลิงก์กลับบ้านฝังอยู่ — ป้ายบนเดโม 47 หน้าใช้ไฟล์เดียวกันหมด
   ถ้าไม่ไล่แก้ที่นี่ วันที่ย้ายโดเมน ป้ายทุกใบจะชี้กลับโดเมนที่ตายแล้ว */
const FILES = ["index.html", "reference.html", "privacy.html", "sitemap.xml", "robots.txt", "PORTFOLIO.md",
               "work/_demo-badge.js"];

let touched = 0, total = 0;
for (const f of FILES) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  const before = readFileSync(p, "utf8");
  const hits = (before.match(new RegExp(OLD.replace(/\./g, "\\."), "g")) || []).length;
  if (!hits) continue;
  total += hits;
  touched++;
  console.log(`${apply ? "แก้" : "จะแก้"} ${f.padEnd(16)} ${hits} จุด`);
  if (apply) writeFileSync(p, before.split(OLD).join(next));
}

console.log(`\n${apply ? "เสร็จ" : "ดูอย่างเดียว (ยังไม่แตะไฟล์)"}: ${total} จุด ใน ${touched} ไฟล์  ${OLD} → ${next}`);
if (!apply) console.log("สั่งจริงด้วย: node playbook/switch-domain.mjs " + next + " --apply");
else {
  console.log(`
ที่เหลือต้องทำในแดชบอร์ด Cloudflare (สคริปต์ทำแทนไม่ได้):
  1) Pages > tarmsung > Custom domains > Set up a custom domain > ${next}
     (และ www.${next} ถ้าจะให้ www ใช้ได้ด้วย)
  2) Rules > Redirect Rules: hostname eq "tarmsung.pages.dev" → 301 https://${next}/\${path}
     — _redirects จับได้แค่ path จับ hostname ไม่ได้ กฎนี้จึงต้องอยู่ระดับโซน
  3) แล้วค่อย deploy: ต้อง commit ก่อน เพราะ dist สร้างจาก git archive HEAD`);
}
