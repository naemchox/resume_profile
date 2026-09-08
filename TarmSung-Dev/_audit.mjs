/* วัดตำแหน่งจริงของทุกชิ้นบน design/cover-pc.html — ใช้: node _audit.mjs
   ตรวจ composition ด้วยตาแล้วเชื่อไม่ได้: ความเยื้อง 6-8px มองไม่เห็นบนภาพย่อ
   แต่ทำให้ปกดู "ไม่เนี้ยบ" โดยบอกไม่ถูกว่าเพราะอะไร ตัวนี้พิมพ์ L/R/T/B +
   ระยะขอบขวา-ล่าง ของทุกชิ้น เอาไว้เทียบคู่สมมาตร (p1 กับ p5, โลโก้กับป้ายราคา) */
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1920,height:1080} });
await p.goto("file:///Users/jek/TarmSung-Dev/design/cover-pc.html",{waitUntil:"networkidle"});
await p.waitForTimeout(1800);
const sel = [".sub",".bar",".bar .f:first-child",".bar .f:last-child","h1"];
const out = await p.evaluate(list => list.map(s=>{
  const e=document.querySelector(s); if(!e) return [s,null];
  const r=e.getBoundingClientRect();
  return [s, {l:+r.left.toFixed(1),r:+r.right.toFixed(1),t:+r.top.toFixed(1),b:+r.bottom.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}];
}), sel);
for(const [s,r] of out) console.log(s.padEnd(22), r? `L${r.l}  R${r.r}  T${r.t}  B${r.b}  ${r.w}x${r.h}  rightGap=${(1920-r.r).toFixed(1)}  botGap=${(1080-r.b).toFixed(1)}`:"—");
await b.close();
