import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const DIR="/Users/jek/TarmSung-Dev/playbook/leads-raw";
const AGG=/facebook\.com|instagram|lin\.ee|line\.me|hungryhub|wongnai|grab\.|foodpanda|tablecheck|chope|linktr|shopee|lazada|beautyhunter|gowabi/i;
const rows=[];
for (const f of readdirSync(DIR).filter(f=>f.endsWith(".json"))) rows.push(...JSON.parse(readFileSync(`${DIR}/${f}`,"utf8")));

const seen=new Set();
const clean=rows.filter(r=>{
  if(!r.name || /Google Maps|เชื่อมต่ออินเทอร์เน็ต/.test(r.name)) return false;
  if(seen.has(r.maps)) return false; seen.add(r.maps);
  return true;
});
const qualify=(r)=>{
  const w=(r.webLabel||"").trim();
  if(!w) return {ok:true, why:"ไม่มีเว็บเลย"};
  if(AGG.test(w) || AGG.test(r.web||"")) return {ok:true, why:`มีแต่ ${w}`};
  return {ok:false, why:`มีเว็บแล้ว (${w})`};
};
const DEMO=(cat)=>{
  if(/คลินิก|ความงาม|ผิวพรรณ|ศัลยกรรม|ปลูกผม|แพทย์|ทันตก/.test(cat)) return ["โกลว์ คลินิก","B","คลินิก"];
  if(/ซ่อมรถ|อู่|ยาง|คาร์แคร์|ยานยนต์|รถยนต์|ตัวถัง|ทำสี/.test(cat)) return ["อู่ช่างชัด","B","อู่"];
  if(/กาแฟ|คาเฟ่|ชา|ขนม|เบเกอรี|บรันช์|เอสเพรสโซ|เช้าและกลางวัน/.test(cat)) return ["ครัวบ้านสวน (ปรับเป็นคาเฟ่)","A","คาเฟ่"];
  if(/อาหาร|ก๋วยเตี๋ยว|เนื้อย่าง|ซีฟู้ด|บุฟเฟ่ต์|ส้มตำ|ภัตตาคาร/.test(cat)) return ["ครัวบ้านสวน","A","ร้านอาหาร"];
  return ["เมนูผลงานทั้งหมด","C","อื่นๆ"];
};
const short=(u)=>{ const m=u.match(/19s(ChIJ[\w-]+)/); return m?`https://www.google.com/maps/place/?q=place_id:${m[1]}`:u; };
const num=(rt)=>{ const m=(rt||"").match(/\(([\d,]+)\)/); return m?parseInt(m[1].replace(/,/g,"")):0; };

const good=[], skip=[];
for(const r of clean){ const q=qualify(r); (q.ok?good:skip).push({...r, why:q.why, reviews:num(r.rt)}); }
good.sort((a,b)=> (b.phone?1:0)-(a.phone?1:0) || b.reviews-a.reviews);

let md=`# ลิสต์ลูกค้าเป้าหมาย — รอบแรก (สร้าง 22 ส.ค. 2026)

วิธีได้มา: ดึงจาก Google Maps ด้วย \`_scrape-leads.mjs\` แล้วคัดด้วยเกณฑ์เดียว —
**ช่อง "เว็บไซต์" ใน Google Maps ว่าง หรือชี้ไปเพจ/ไลน์** = ยังไม่มีเว็บของตัวเอง = เป้าหมาย
ร้านที่มีโดเมนของตัวเองแล้ว ตัดออก (อยู่ท้ายไฟล์ ไว้ดูว่าคู่แข่งทำอะไรไว้)

> ทุกแถวคือข้อมูลธุรกิจที่เปิดเผยสาธารณะบน Google Maps · เบอร์ที่เห็นคือเบอร์ร้าน ไม่ใช่เบอร์ส่วนตัว
> วิธีทัก ข้อความ และการตามต่อ อยู่ใน \`playbook/OUTREACH.md\` — ไฟล์นี้คือ "ทักใคร" อย่างเดียว

## เป้าหมาย ${good.length} ราย (เรียงตามโอกาสปิด)

| # | ร้าน | ประเภท | เบอร์ | สถานะเว็บ | รีวิว | เดโมที่โชว์ | ข้อความ | Maps |
|---|---|---|---|---|---|---|---|---|
`;
good.forEach((r,i)=>{ const [d,t]=DEMO(r.cat+" "+r.q);
  md+=`| ${i+1} | ${r.name} | ${r.cat||"—"} | ${r.phone||"—"} | ${r.why} | ${r.reviews||"—"} | ${d} | แบบ ${t} | [เปิด](${short(r.maps)}) |\n`; });

md += `\n## 10 รายแรก — ข้อความพร้อมส่ง (ก๊อปวางได้เลย)\n\nโทรได้ก็โทร ถ้าทักเพจให้ใช้ข้อความข้างล่าง เปลี่ยนแค่ชื่อร้านให้ตรง\n`;
good.slice(0,10).forEach((r,i)=>{
  const [d,t,kind]=DEMO(r.cat+" "+r.q);
  const A = `สวัสดีครับ ผมเห็นเพจร้าน ${r.name} แล้วสงสัยนิดนึง — ตอนนี้ลูกค้าที่อยากรู้ราคา/เวลาเปิด ต้องทักมาถามในแชทหมดเลยใช่ไหมครับ\n\nผมทำเว็บให้${kind}มาแบบนี้ครับ กดดูของจริงได้เลย https://tarmsung.pages.dev\nถ้าอยากลอง ผมทำหน้าจริงของร้านพี่ให้ดูก่อนฟรี ไม่ถูกใจไม่ต้องจ่าย ไม่ต้องมัดจำ\n\nรบกวนถามข้อเดียวครับ ตอนนี้ลูกค้าถามอะไรซ้ำๆ บ่อยที่สุด?`;
  const B = `สวัสดีครับ พอดีเห็น ${r.name} ใน Google Maps เลยลองกดดู — ตอนนี้คนที่หาเจอแล้วอยากรู้ราคา ต้องโทรถามหรือทักแชทอย่างเดียวใช่ไหมครับ ไม่มีหน้าเว็บรับ\n\nผมทำหน้าเว็บสำหรับ${kind}โดยเฉพาะครับ ตัวอย่างกดใช้ได้จริง https://tarmsung.pages.dev\nทำหน้าแรกให้ดูก่อนฟรี ไม่ถูกใจไม่ต้องจ่าย\n\nถามข้อเดียวครับ ลูกค้าโทรมาถามเรื่องอะไรบ่อยที่สุด?`;
  md += `\n### ${i+1}. ${r.name} — ${r.phone||"ไม่มีเบอร์"} · ${r.why}\n\n\`\`\`\n${t==="B"?B:A}\n\`\`\`\n`;
});

md+=`\n## ตัดออก — มีเว็บของตัวเองแล้ว (${skip.length} ราย)\n\n`;
skip.forEach(r=>{ md+=`- ${r.name} — ${r.why}\n`; });

md+=`
---

## ทำต่อยังไง (อย่าอ่านจบแล้วปิด)

1. เอา 10 แถวแรกมาทัก **วันนี้** — ข้อความอยู่ใน \`playbook/OUTREACH.md\` ข้อ 2
2. ร้านอาหาร/คาเฟ่ ใช้ **แบบ A** · คลินิก/อู่ ใช้ **แบบ B**
3. จดผลทุกรายลงตารางนับใน \`OUTREACH.md\` ข้อ 5 — ไม่จด = รอบหน้าก็ไม่รู้อีกว่าพังตรงไหน
4. เกณฑ์อ่านผล: ทัก 20 ราย ไม่มีใครส่งรูปมาเลย = ปัญหาที่ข้อความ/กลุ่มเป้าหมาย ไม่ใช่ที่เดโม

## ข้อจำกัดของลิสต์นี้ (รู้ไว้ก่อนใช้)

- เกณฑ์คัดใช้ช่อง "เว็บไซต์" ใน Google Maps เท่านั้น — ร้านที่มีเว็บแต่ไม่ได้ผูกกับ Maps จะหลุดมาอยู่ในลิสต์ **เช็คอีกครั้งก่อนทัก** ด้วยการเสิร์ชชื่อร้าน
- ยังไม่ได้ดูว่าเพจเขายัง active ไหม — ร้านที่โพสต์ล่าสุดปี 2023 ทักไปก็เงียบ
- ไม่ได้เก็บชื่อเจ้าของ ทักไปที่ช่องทางร้านเท่านั้น
`;
writeFileSync("/Users/jek/TarmSung-Dev/playbook/LEADS-2026-08-22.md", md);
console.log("good:",good.length,"skip:",skip.length);
