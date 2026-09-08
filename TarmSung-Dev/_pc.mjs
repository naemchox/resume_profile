import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
/* ถ่ายเฟรมจอคอมของ SUMMIT ให้ลงกรอบแมคใน design/cover-pc.html
   ถ่ายที่ 1800x1125 ไม่ใช่ 1280x800 ทั้งที่กรอบเป็น 16:10 เท่ากัน เพราะ:
   มือถือสองเครื่องในปกทับจอไปจากซ้าย ~9.3% ของความกว้าง
   ตัวหนังสือ hero อยู่ในคอนเทนเนอร์ max-width 1400 ที่จัดกลาง
     - ที่ 1280 กว้าง ขอบซ้ายของตัวหนังสือ = 24px = 1.9% -> โดนทับ อ่านได้แค่ "UILT FOR / IE WILD."
     - ที่ 1800 กว้าง = (1800-1400)/2+24 = 224px = 12.4% -> พ้นมือถือ
   แล้วค่อยย่อกลับเป็น 1280x800 ตอนแปลงเป็น webp */
const W = 1800, H = 1125;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
await p.goto("file:///Users/jek/TarmSung-Dev/work/summit/index.html",{waitUntil:"load"});
await p.waitForTimeout(3000);
await p.screenshot({ path:"/tmp/summit-pc.png" });
await b.close();
execFileSync("cwebp",["-quiet","-q","84","-resize","1280","800","/tmp/summit-pc.png","-o","design/summit-pc.webp"]);
console.log("hero", W+"x"+H, "-> design/summit-pc.webp (1280x800)");
