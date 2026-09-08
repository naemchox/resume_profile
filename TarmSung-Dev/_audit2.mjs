/* วัดตำแหน่งของ design/cover.html (ปกห้ามือถือ) — คู่กับ _audit.mjs ที่วัดปกจอคอม
   ของชนิดเดียวกันต้องตรวจด้วยไม้บรรทัดอันเดียวกัน ไม่ใช่ตรวจใบเดียวแล้วเดาอีกใบ */
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1920,height:1080} });
await p.goto("file:///Users/jek/TarmSung-Dev/design/cover.html",{waitUntil:"networkidle"});
await p.waitForTimeout(1800);
const sel=[".brand",".tag",".p1",".p2",".p3",".p4",".p5","h1",".slip"];
const out=await p.evaluate(l=>l.map(s=>{const e=document.querySelector(s);const r=e.getBoundingClientRect();
 return [s,{l:+r.left.toFixed(1),r:+r.right.toFixed(1),t:+r.top.toFixed(1),b:+r.bottom.toFixed(1)}]}),sel);
for(const [s,r] of out) console.log(s.padEnd(8),`L${r.l}  R${r.r}  T${r.t}  B${r.b}  rightGap=${(1920-r.r).toFixed(1)}  botGap=${(1080-r.b).toFixed(1)}`);
await b.close();
