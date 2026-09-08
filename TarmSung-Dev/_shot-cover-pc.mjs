/* เรนเดอร์ design/cover-pc.html เป็น assets/cover-pc.png (1x) + assets/cover-pc-2x.png (2x)
   ใช้: node _shot-cover-pc.mjs
   เดิมชี้ไป scratchpad ของ session เก่า (d517a20f-...) ที่หายไปแล้ว — แก้ให้อ่าน/เขียน
   ในรีโปตรงๆ แบบเดียวกับ _shot-cover.mjs (ของชนิดเดียวกันต้องใช้กลไกเดียวกัน) */
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
for (const [scale, out] of [[1, "cover-pc.png"], [2, "cover-pc-2x.png"]]) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  await p.goto("file://" + join(ROOT, "design/cover-pc.html"), { waitUntil: "networkidle" });
  await p.waitForTimeout(1800);   // รอฟอนต์ไทยจาก Google Fonts ไม่งั้นได้ฟอนต์สำรอง
  await p.screenshot({ path: join(ROOT, "assets", out) });
  await p.close();
  console.log("assets/" + out);
}
await b.close();
