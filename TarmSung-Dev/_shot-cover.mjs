/* เรนเดอร์ design/cover.html เป็น assets/cover.png (1x) + assets/cover-2x.png (2x)
   ใช้: node _shot-cover.mjs
   เดิมสคริปต์นี้ชี้ไปที่ scratchpad ของ session เก่า (d517a20f-...) ซึ่งหายไปแล้ว
   ตอนนี้อ่าน/เขียนในรีโปตรงๆ จะได้รันซ้ำได้ทุกเครื่องทุกครั้ง */
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
for (const [scale, out] of [[1, "cover.png"], [2, "cover-2x.png"]]) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  await p.goto("file://" + join(ROOT, "design/cover.html"), { waitUntil: "networkidle" });
  await p.waitForTimeout(1800);   // รอฟอนต์ไทยจาก Google Fonts ไม่งั้นได้ฟอนต์สำรอง
  await p.screenshot({ path: join(ROOT, "assets", out) });
  await p.close();
  console.log("assets/" + out);
}
await b.close();
