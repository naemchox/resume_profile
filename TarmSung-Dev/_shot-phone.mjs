/* ยิงหน้ามือถือของงานลูกค้าให้ลงกรอบมือถือใน design/cover-pc.html
   ใช้: node _shot-phone.mjs

   viewport 320x671 ไม่ใช่ 390x844 ด้วยเหตุผลเดียว: กรอบมือถือบนปกกว้าง ~208px
   ในภาพ 1920 ตัวหนังสือของหน้าจริงที่ยิงมา 390 กว้างจึงเล็กจนเป็นรอยเปื้อนตอนย่อ
   เป็นธัมบ์เนลบนเว็บหางาน. 320 คือความกว้างมือถือจริงที่แคบที่สุด (iPhone SE)
   เลย์เอาต์ยัง reflow ถูก ไม่ใช่การซูมภาพ และ 671 = 320 / 0.477 คือสัดส่วนพื้นที่
   จอในกรอบเป๊ะ ภาพจึงไม่โดน object-fit:cover กินขอบด้านไหนเลย */
import { chromium } from "playwright";
const ROOT = "file:///Users/jek/TarmSung-Dev/work";
const SHOTS = [
  [`${ROOT}/the-bed/index.html`,      "design/the-bed.png"],
  [`${ROOT}/krua-baansuan/index.html`,"design/krua.png"],
  [`${ROOT}/glow-clinic/index.html`,  "design/glow.png"],
  [`${ROOT}/parcela/index.html`,      "design/shop.png"],
  [`${ROOT}/summit/index.html`,       "design/summit.png"],
];
const b = await chromium.launch();
for (const [url, out] of SHOTS) {
  const p = await b.newPage({ viewport:{width:320,height:671}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  try {
    await p.goto(url, { waitUntil:"load", timeout:30000 });
    await p.waitForTimeout(3500);
    await p.screenshot({ path: out });
    console.log("ok", out);
  } catch (e) { console.log("FAIL", url, e.message); }
  await p.close();
}
await b.close();
