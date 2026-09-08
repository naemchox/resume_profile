import { chromium } from 'playwright';
const b=await chromium.launch();
const pg=await b.newPage({viewport:{width:1440,height:900}});
await pg.goto('http://localhost:8481/work/teung-chao/',{waitUntil:'networkidle'});
await pg.waitForTimeout(1500);
// จับตำแหน่งของ brand + h1 ทุกเฟรม ระหว่างเลื่อนช้าๆ ผ่านจุดตัด
const trace=await pg.evaluate(async()=>{
  const brand=document.querySelector('.brand'), h1=document.querySelector('#hero-title'),
        hdr=document.querySelector('header');
  const out=[]; let t0=performance.now(), last=t0;
  return await new Promise(res=>{
    let y=0;
    const step=()=>{
      const now=performance.now();
      const br=brand.getBoundingClientRect(), h=hdr.getBoundingClientRect(), hr=h1.getBoundingClientRect();
      out.push({t:+(now-t0).toFixed(0), dt:+(now-last).toFixed(1), y:Math.round(scrollY),
        hdrH:+h.height.toFixed(1), brandTop:+br.top.toFixed(1), brandFs:getComputedStyle(brand.querySelector('b')).fontSize,
        h1Top:+hr.top.toFixed(1)});
      last=now;
      if (y<340){ y+=10; window.scrollTo(0,y); requestAnimationFrame(step); }
      else res(out);
    };
    requestAnimationFrame(step);
  });
});
const shifts=[];
for(let i=1;i<trace.length;i++){
  const a=trace[i-1],c=trace[i];
  const dScroll=c.y-a.y;
  const h1Move=Math.abs((c.h1Top+c.y)-(a.h1Top+a.y));      // ตำแหน่งสัมบูรณ์ของ h1
  const brandMove=Math.abs(c.brandTop-a.brandTop);
  if (h1Move>0.5||brandMove>0.5||c.dt>25) shifts.push({y:c.y,dt:c.dt,hdrH:c.hdrH,h1Move:+h1Move.toFixed(2),brandMove:+brandMove.toFixed(2)});
}
const longF=trace.filter(f=>f.dt>25).length;
console.log('เฟรมทั้งหมด',trace.length,'· เฟรมยาว >25ms:',longF,'· ยาวสุด',Math.max(...trace.map(f=>f.dt)).toFixed(1)+'ms');
console.log('ความสูงแถบ: '+trace[0].hdrH+' → '+trace[trace.length-1].hdrH);
console.log('\njump ที่เจอ (h1 ขยับ = เนื้อหาเลื่อน · brand ขยับ = ของในแถบเลื่อน):');
shifts.slice(0,14).forEach(s=>console.log(`  y=${String(s.y).padStart(3)} dt=${String(s.dt).padStart(5)}ms แถบ=${String(s.hdrH).padStart(5)} h1ขยับ=${s.h1Move} brandขยับ=${s.brandMove}`));
console.log('รวม jump', shifts.length, 'จุด');
await b.close();
