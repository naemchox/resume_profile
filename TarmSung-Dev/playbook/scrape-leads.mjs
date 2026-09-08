/* scrape-leads.mjs — ดึงรายชื่อธุรกิจจาก Google Maps มาคัดเป็นลูกค้าเป้าหมาย
   ใช้: node playbook/scrape-leads.mjs <ชื่อไฟล์ผลลัพธ์> "<คำค้น1>" "<คำค้น2>" ...
   เช่น node playbook/scrape-leads.mjs food-ekkamai "ร้านอาหาร เอกมัย"
   แล้วต่อด้วย node playbook/build-leads.mjs เพื่อรวม+คัด+เขียนเป็น LEADS-*.md

   คัดด้วยเกณฑ์เดียว: ช่อง "เว็บไซต์" ในหน้ารายละเอียดของ Google Maps
   ว่าง หรือชี้ไปเพจ/ไลน์/แอปสั่งอาหาร = ยังไม่มีเว็บของตัวเอง = เป้าหมาย
   ดึงเฉพาะข้อมูลธุรกิจที่เปิดเผยสาธารณะ (ชื่อร้าน ประเภท เบอร์ร้าน ที่อยู่) ไม่แตะข้อมูลส่วนบุคคล */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2];
const QUERIES = process.argv.slice(3);
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ locale:"th-TH", viewport:{width:1400,height:1000},
  userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" });
const p = await ctx.newPage();
const all = [];

for (const q of QUERIES){
  await p.goto(`https://www.google.com/maps/search/${encodeURIComponent(q)}?hl=th&gl=TH`, {waitUntil:"domcontentloaded"});
  await p.waitForTimeout(4000);
  // consent
  try{ const c = p.getByRole("button",{name:/ยอมรับ|Accept all|ยอมรับทั้งหมด/}); if(await c.count()) { await c.first().click(); await p.waitForTimeout(2500);} }catch{}
  const feed = await p.$('[role="feed"]');
  if(!feed){ console.log("NO FEED for", q); continue; }
  for (let i=0;i<14;i++){
    await feed.evaluate(f=>f.scrollTop=f.scrollHeight);
    await p.mouse.move(300,600); await p.mouse.wheel(0,1200);
    await p.waitForTimeout(900);
  }
  const links = await p.$$eval('[role="feed"] a[href*="/maps/place/"]', as=>[...new Set(as.map(a=>a.href))]);
  console.log(q, "→", links.length, "places");
  for (const href of links.slice(0,18)){
    try{
      await p.goto(href+"&hl=th", {waitUntil:"domcontentloaded"}); await p.waitForTimeout(2200);
      const row = await p.evaluate(()=>{
        const g=(sel)=>document.querySelector(sel);
        const name = g('h1')?.textContent.trim()||"";
        const cat = g('button[jsaction*="category"]')?.textContent.trim()||"";
        const web = g('a[data-item-id="authority"]')?.href||"";
        const webLabel = g('a[data-item-id="authority"]')?.textContent.trim()||"";
        const phone = [...document.querySelectorAll('button[data-item-id^="phone"]')].map(e=>e.textContent.trim())[0]||"";
        const addr = g('button[data-item-id="address"]')?.textContent.trim()||"";
        const rt = g('div.F7nice')?.textContent.trim()||"";
        return {name,cat,web,webLabel,phone,addr,rt};
      });
      if(row.name){ all.push({...row, q, maps:href.split("?")[0]}); }
    }catch(e){ }
  }
}
writeFileSync(`/Users/jek/TarmSung-Dev/playbook/leads-raw/${OUT}.json`, JSON.stringify(all,null,1));
console.log("TOTAL", all.length);
await b.close();
