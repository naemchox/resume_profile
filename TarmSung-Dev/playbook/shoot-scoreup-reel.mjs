/* คลิปการ์ด ScoreUp — ถ่ายจาก scoreup-portfolio.html (ตัวที่ jek ใช้จริง ไม่ใช่ scoreup.html)
   ใช้:  cd /Users/jek/scoreup_new && python3 -m http.server 8077   แล้ว
         node playbook/shoot-scoreup-reel.mjs

   สามอย่างที่ต้องจัดการก่อนถึงจะถ่ายได้ (21/8/26):
   1. ม่านล็อกอิน #authGate ที่แอปวางทับตัวเอง — แอปบูตเสร็จอยู่ข้างล่างแล้ว ถอดม่านตอนอัด
      (ไม่ได้แก้ไฟล์แอปจริง แค่ถอดในหน่วยความจำของเบราว์เซอร์ที่ใช้อัด)
   2. ทัวร์ต้อนรับที่เด้งทับหน้าบทเรียน — คนที่เคยใช้แล้วไม่เห็นมัน คลิปเดโมก็ไม่ควรเห็น
   3. หน้า Practice Hub / Where you stand / Latest Mock จะโผล่ก็ต่อเมื่อ "มีข้อมูล" —
      ต้อง seed ก่อน ไม่งั้นได้คลิปบัญชีเปล่า (0 XP · คะแนน "—") ซึ่งใช้ขายงานไม่ได้
   เข้ารหัสด้วยค่าเดียวกับคลิปแอปใบอื่น: 1440x900 · crf 26 · เฟดหัวท้าย 0.3 วิ
*/
import { chromium } from "playwright";
const OUT="/private/tmp/claude-501/-Users-jek/1674a8b0-03ab-4e8f-b780-55f418e23da9/scratchpad/suvid/";
const SHOT="/private/tmp/claude-501/-Users-jek/1674a8b0-03ab-4e8f-b780-55f418e23da9/scratchpad/";
const SEED = () => {
  const ds=b=>{const d=new Date();d.setDate(d.getDate()-b);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  const R=(back,cats,x)=>({d:ds(back),m:'drill',x,dur:520,
    s:Object.values(cats).reduce((a,b)=>a+b.c,0),n:Object.values(cats).reduce((a,b)=>a+b.t,0),cats});
  const hist=[R(7,{listening:{c:11,t:20}},42),R(6,{part5:{c:14,t:20}},46),R(6,{vocab:{c:9,t:12}},24),
    R(5,{listening:{c:14,t:20}},52),R(4,{part7:{c:12,t:18}},48),R(3,{part5:{c:17,t:20},part6:{c:9,t:12}},60),
    R(2,{listening:{c:17,t:20}},64),R(1,{part7:{c:15,t:20},vocab:{c:11,t:12}},70),
    R(0,{listening:{c:18,t:20},part5:{c:18,t:20}},78),
    /* เรดาร์โหมด Mock อ่านจาก x.skills (คีย์ listen/read/grammar/comp/readSpeed)
       ส่วนแถบ "คะแนนรายพาร์ท" อ่านจาก x.parts — คนละช่องกัน ตอนแรกผม seed แต่ parts
       เรดาร์เลยขึ้น 0% ทั้งวงทั้งที่แถบข้างล่างมีตัวเลขครบ (jek ทัก 21/8/26)
       ตัวเลขข้างล่างคำนวณจาก parts ชุดเดียวกัน จะได้ไม่ขัดกันเอง:
       listen (P1-4) 80/100 · read (P5-7) 72/100 · grammar = P5 87% · comp = P7 63%
       readSpeed = วินาทีต่อข้อของ Reading (42 วิ ≈ เร็วกว่าเกณฑ์จริง 45 วิ นิดหน่อย) */
    {d:ds(2),m:'exam',s:152,n:200,x:320,dur:4200,score990:745,
     skills:{listen:80,read:72,grammar:87,comp:63,readSpeed:42},
     parts:{1:{c:5,t:6},2:{c:22,t:25},3:{c:29,t:39},4:{c:24,t:30},5:{c:26,t:30},6:{c:12,t:16},7:{c:34,t:54}}}];
  localStorage.setItem('toeicSprint.v2', JSON.stringify({xp:1240,streak:5,best:6,lastDay:ds(0),lang:'en',goal:800,
    cards:{},mistakes:{},served:{},history:hist,catStats:{},
    lessonRead:Object.fromEntries(Array.from({length:12},(_,i)=>['l'+(i+1),{p:100,y:0,done:true}]))}));
  localStorage.setItem('scoreup.theme','dark');
};
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900},recordVideo:{dir:OUT,size:{width:1440,height:900}}});
await ctx.addInitScript(SEED);
const p=await ctx.newPage();
await p.goto("http://127.0.0.1:8077/scoreup-portfolio.html?theme=dark",{waitUntil:"load",timeout:60000});
await p.waitForTimeout(5500);
await p.evaluate(()=>{const g=document.getElementById("authGate"); if(g) g.remove();});
await p.waitForTimeout(1200);
for (const t of ["ข้าม","Skip","ปิด","Close"]) { const hit=await p.evaluate((x)=>{const el=[...document.querySelectorAll("button,a")]
  .find(n=>(n.textContent||"").trim()===x && n.offsetParent); if(el){el.click();return true;} return false;},t);
  if (hit) { await p.waitForTimeout(900); break; } }
const click = async (re, wait=1600) => { await p.evaluate((re)=>{const el=[...document.querySelectorAll("button,a")]
  .find(n=>new RegExp(re,'i').test((n.textContent||"").trim())); if(el) el.click();},re); await p.waitForTimeout(wait); };
const glide=(to,ms)=>p.evaluate(([to,ms])=>new Promise(res=>{const el=document.scrollingElement;
  const from=el.scrollTop,t0=performance.now();
  const step=t=>{const k=Math.min(1,(t-t0)/ms); el.scrollTop=from+(to-from)*(k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2);
    k<1?requestAnimationFrame(step):res();}; requestAnimationFrame(step);}),[to,ms]);
await p.waitForTimeout(1400);
/* สลับชนิดสถิติใน Practice Hub ให้เห็นครบสามแบบ (jek สั่ง 21/8/26) — เรดาร์เปลี่ยนรูป
   ตามชนิดที่เลือก เป็นฟีเจอร์ที่ดูออกได้เฉพาะตอนมันขยับ ภาพนิ่งใบเดียวเล่าไม่ได้ */
await click("^Accuracy$", 2400);
await click("^Covered$", 2400);
await click("^Mock$", 2400);
await glide(620,3200); await p.waitForTimeout(700); await glide(0,1500);
await click("Lessons|บทเรียน"); await glide(650,3200); await glide(0,1400);
await click("Practice|ฝึกฝน");  await p.waitForTimeout(900); await glide(480,2600); await glide(0,1300);
await click("^Stats|สถิติ");    await p.waitForTimeout(1200); await glide(430,2400); await p.waitForTimeout(1200);
await ctx.close(); await b.close();
console.log("อัดเสร็จ");
