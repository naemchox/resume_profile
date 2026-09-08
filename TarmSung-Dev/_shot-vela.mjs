import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:2 });
await p.goto("file:///Users/jek/TarmSung-Dev/design/pc-vela.html",{waitUntil:"load"});
await p.waitForTimeout(2200);           // รอฟอนต์ไทยจาก Google Fonts
console.log("appTop", await p.evaluate(()=>document.querySelector(".app").getBoundingClientRect().top));
await p.screenshot({ path:"/tmp/pc-vela.png" });
await b.close(); console.log("ok");
