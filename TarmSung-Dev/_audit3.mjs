/* ตรวจว่าเงาสะท้อนมีครบทุกเครื่องจริงไหม — เทียบทีละตัวว่ามี .rf, มี --shot,
   กล่องมีขนาดจริง และ "สว่างเฉลี่ย" ของภาพที่มันสะท้อนเป็นเท่าไหร่
   ตาเรามองแล้วเดาว่า "อันนี้ไม่มี" แต่จริงๆ อาจมีแต่เนื้อที่สะท้อนมันดำ */
import { chromium } from "playwright";
const file = process.argv[2] || "cover-pc";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1920,height:1080} });
await p.goto(`file:///Users/jek/TarmSung-Dev/design/${file}.html`,{waitUntil:"networkidle"});
await p.waitForTimeout(1500);
const rows = await p.evaluate(()=>[...document.querySelectorAll(".ph,.mac")].map(d=>{
  const rf=d.querySelector(":scope > .rf"); const cs=getComputedStyle(d);
  const r=rf?rf.getBoundingClientRect():null;
  return {el:d.className, shot:cs.getPropertyValue("--shot").trim()||"(none)",
    rot:cs.getPropertyValue("--rot").trim()||"(none)",
    rf: rf? `${r.width.toFixed(0)}x${r.height.toFixed(0)} @y${r.top.toFixed(0)}` : "MISSING",
    rfT: rf? getComputedStyle(rf).transform : "-"};
}));
for(const r of rows) console.log(r.el.padEnd(9), "rf="+r.rf.padEnd(20), "shot="+r.shot.padEnd(26), "rot="+r.rot.padEnd(8), r.rfT);
await b.close();
