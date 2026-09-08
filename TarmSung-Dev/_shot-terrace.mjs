/* เรนเดอร์ design/pc-terrace-hero.html เป็น design/terrace-cover.webp (จอในปก)
   ใช้: node _shot-terrace.mjs

   สำคัญ: viewport ต้อง 1440x900 ให้ตรงกับ body{width:1440px;height:900px} ของหน้า
   ใบเก่าถูกยิงด้วยกลไกของ _shot-pc.mjs (1280x800) ทั้งที่หน้ากว้าง 1440 ผลคือ
   ขอบขวาโดนตัดหายไป 160px (ปุ่ม "ขอใบเสนอราคา" ขาดครึ่ง) แล้วภาพที่ได้ก็ดูเยื้อง
   บนจอคอมกลางปก — ของชนิดเดียวกันต้องยิงด้วย viewport ของตัวเอง ไม่ใช่ของหน้าอื่น */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import ffmpeg from "ffmpeg-static";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:2 });
await p.goto("file:///Users/jek/TarmSung-Dev/design/pc-terrace-hero.html",{waitUntil:"load"});
await p.waitForTimeout(2500);           // รอฟอนต์ไทยจาก Google Fonts
// กันหน้าล้น 900px เงียบๆ: ถ้าแถบล่างตกขอบ ภาพจะขาดโดยไม่มีใครรู้
console.log("heroH", await p.evaluate(()=>document.querySelector(".hero").getBoundingClientRect().height));
console.log("scrollW", await p.evaluate(()=>document.documentElement.scrollWidth));
await p.screenshot({ path:"/tmp/pc-terrace.png" });
execFileSync(ffmpeg,["-y","-i","/tmp/pc-terrace.png","-c:v","libwebp","-quality","90","design/terrace-cover.webp"],{stdio:"ignore"});
rmSync("/tmp/pc-terrace.png");
await b.close(); console.log("ok design/terrace-cover.webp");
