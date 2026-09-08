#!/usr/bin/env node
/* =============================================================================
   freeze-tailwind.mjs — แช่ CSS ที่ Tailwind CDN สร้างสดๆ ให้กลายเป็นไฟล์นิ่ง
   ใช้: node playbook/freeze-tailwind.mjs work/the-bed

   ทำไม: cdn.tailwindcss.com คือ "ตัวคอมไพล์" ที่วิ่งในเบราว์เซอร์ของลูกค้า
   หน้าเรนเดอร์ออกมาก่อนแล้วค่อยถูกจัดใหม่ทั้งหน้า — วัดแล้วหน้า the-bed มีค่า
   กระโดด (CLS) 0.077 แต่พอบล็อกสคริปต์ตัวนี้เหลือ 0.012 ส่วนเดโมใบอื่นที่เขียน
   CSS เองอยู่ที่ ~0 ทั้งหมด สคริปต์นี้ดึง CSS ที่มันสร้างออกมาเก็บเป็นไฟล์
   แล้วหน้าเว็บก็ลิงก์ไฟล์นั้นตรงๆ ไม่ต้องแบกตัวคอมไพล์ไปด้วย
   ========================================================================== */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2];
if (!dir) { console.error("ใช้: node playbook/freeze-tailwind.mjs <โฟลเดอร์เดโม>"); process.exit(2); }
const page_path = join(ROOT, dir, "index.html");
if (!existsSync(page_path)) { console.error("ไม่เจอ " + page_path); process.exit(2); }

const { chromium } = await import("playwright");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:8099/" + dir + "/index.html", { waitUntil: "load" });
await p.waitForTimeout(3000);

/* Play CDN ยัด <style> ที่มันสร้างไว้ใน head — ดึงเฉพาะแผ่นที่ไม่มี href (inline)
   และมีคลาสยูทิลิตี้จริง ไม่ใช่ <style> ที่คนเขียนเองในไฟล์ */
const css = await p.evaluate(() => {
  const out = [];
  for (const sheet of document.styleSheets) {
    if (sheet.href) continue;
    const owner = sheet.ownerNode;
    if (!owner || owner.dataset?.handmade === "1") continue;
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    const text = [...rules].map(r => r.cssText).join("\n");
    if (/\.(flex|grid|absolute|text-|bg-|px-|py-|mx-|w-full)/.test(text)) out.push(text);
  }
  return out.join("\n");
});
await b.close();

if (!css || css.length < 2000) { console.error("ดึง CSS ไม่ได้ (ได้ " + css.length + " ตัวอักษร) — เซิร์ฟเวอร์ 8099 เปิดอยู่ไหม"); process.exit(1); }
mkdirSync(join(ROOT, dir, "css"), { recursive: true });
const out = join(ROOT, dir, "css", "tailwind.css");

/* ต่อท้ายด้วย css/after-tailwind.css ถ้ามี (เพิ่ม 24/8/26)
   ทำไม: บล็อก "หัวเว็บหดตอนเลื่อน" ถูกแปะมือลงท้าย tailwind.css ทั้งที่หัวไฟล์เขียนว่า
   ห้ามแก้มือ วันไหนมีคนรันสคริปต์นี้ใหม่ ของทั้งก้อนหายเงียบๆ และไม่มีใครรู้จนแถบเพี้ยน
   ทางแก้ที่ถูกคือไม่ต้องพึ่งความจำ: ของที่เขียนมือให้อยู่ในไฟล์ของตัวเอง แล้วสคริปต์นี้
   ต่อท้ายให้เองทุกครั้งที่สร้างใหม่ (index.html จึงไม่ต้องเพิ่ม <link> อีกเส้น) */
const extra_path = join(ROOT, dir, "css", "after-tailwind.css");
const extra = existsSync(extra_path)
  ? "\n\n/* ---- ต่อท้ายอัตโนมัติจาก css/after-tailwind.css (แก้ที่ไฟล์นั้น ไม่ใช่ที่นี่) ---- */\n"
    + readFileSync(extra_path, "utf8")
  : "";
writeFileSync(out, "/* สร้างด้วย playbook/freeze-tailwind.mjs — ห้ามแก้มือ แก้ที่ index.html หรือ css/after-tailwind.css แล้วรันใหม่ */\n" + css + extra);
console.log(`เขียน ${dir}/css/tailwind.css แล้ว (${Math.round((css.length + extra.length)/1024)} KB)` +
  (extra ? " · ต่อท้าย after-tailwind.css แล้ว" : " · ไม่มี after-tailwind.css"));
console.log("ขั้นต่อไป: เอา <script src=\"https://cdn.tailwindcss.com\"> ออก แล้วลิงก์ไฟล์นี้แทน");
