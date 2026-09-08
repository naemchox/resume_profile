import { chromium } from "playwright";
const W=1440,H=900;
const jobs=[["summit",0],["summit",760],["homecraft",0],["homecraft",700],["lumen",0]];
const b = await chromium.launch();
for (const [name,y] of jobs) {
  const p = await b.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:2 });
  await p.goto(`file:///Users/jek/TarmSung-Dev/work/${name}/index.html`,{waitUntil:"load"});
  await p.waitForTimeout(2500);
  if (y) await p.evaluate(v=>window.scrollTo({top:v,behavior:"instant"}), y);
  await p.waitForTimeout(1200);
  await p.screenshot({ path:`/tmp/pc-${name}-${y}.png` });
  await p.close();
  console.log(name,y);
}
await b.close();
