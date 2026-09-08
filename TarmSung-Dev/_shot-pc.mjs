/* เรนเดอร์หน้าเว็บขนาดจอคอม เป็น design/<ชื่อ>-pc.webp (1280x800)
   ใช้: node _shot-pc.mjs '[["http://localhost:8099/","tarmsung"]]'
   คู่กับ _shot-phone.mjs — ของชนิดเดียวกันใช้กลไกเดียวกัน: ยิงด้วย playwright
   ที่ viewport เดียวกับไฟล์เดิมทุกใบ (1280x800) แล้วแปลงเป็น webp ด้วย ffmpeg
   ที่ติดมากับรีโปอยู่แล้ว จะได้ไม่ต้องพึ่งเครื่องมือนอกเครื่อง */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import ffmpeg from "ffmpeg-static";
const shots = JSON.parse(process.argv[2]);
const b = await chromium.launch();
for (const [url, name, outName] of shots) {
  // ขนาด CSS เท่าเดิม (1280x800) เปลี่ยนแค่ความละเอียดของพิกเซล เลย์เอาต์ของหน้า
  // จึงเหมือนเดิมเป๊ะ ไม่ใช่การถ่ายจอที่กว้างขึ้นแล้วได้คนละองค์ประกอบ
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const tmp = `design/${name}-pc.png`, out = "design/" + (outName || `${name}-pc.webp`);
  try {
    // domcontentloaded ไม่ใช่ load: หน้าตามสั่งเองมีคลิป .mp4 ของ reel อยู่หลายไฟล์
    // ถ้ารอ load มันจะรอจนคลิปโหลดครบแล้วหมดเวลา — ภาพที่เราต้องการคือ hero ซึ่งพร้อม
    // ก่อนหน้านั้นนานแล้ว
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForTimeout(4500);          // ฟอนต์ไทย + งานที่วิ่งอยู่ในหน้า
    await p.screenshot({ path: tmp });
    execFileSync(ffmpeg, ["-y", "-i", tmp, "-c:v", "libwebp", "-quality", "88", out], { stdio: "ignore" });
    rmSync(tmp);
    console.log("ok", out);
  } catch (e) { console.log("FAIL", url, e.message); }
  await p.close();
}
await b.close();
