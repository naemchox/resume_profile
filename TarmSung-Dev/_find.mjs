import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:1400} });
await p.goto("https://unsplash.com/s/photos/travel-mug", { waitUntil:"networkidle", timeout:45000 });
await p.waitForTimeout(5000);
console.log("title:", await p.title());
console.log("imgs:", await p.$$eval("img", es=>es.length));
console.log("sample srcs:", await p.$$eval("img", es=>es.slice(0,6).map(e=>(e.currentSrc||e.src||"").slice(0,80))));
await b.close();
