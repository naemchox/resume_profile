/* คลิปการ์ด "แอป" — สองจอมือถือเรียงกันในเฟรมเดียว (ต่างจาก playbook/shoot-reel.mjs
   ที่ถ่ายเว็บทั้งหน้าเลื่อนลง เพราะแอปไม่มี fold ให้เลื่อน มันมี "จอ" ให้ย้ายไปมา)

   ใช้:  node playbook/shoot-app-reel.mjs        (ต้องเสิร์ฟตัวแอปไว้ที่ 127.0.0.1:8000 ก่อน:
                                                  cd /Users/jek/train-app && node _serve.js)
   ผลลัพธ์: ไฟล์ .webm ดิบ → ตัดและเข้ารหัสเองด้วย ffmpeg แล้วก๊อปไป assets/work/reel/

   ⚠️ หลังก๊อป .mp4 เข้า assets/work/reel/ ต้องสร้างคู่แฝด WebM ทุกครั้ง:
        node playbook/webm-twin.mjs assets/work/reel/<ชื่อ>.mp4
   หน้าเว็บเสิร์ฟ .webm ก่อน .mp4 และทั้งคู่ใช้เลข ?v เดียวกัน ถ้าลืม คนดูจะได้ภาพเก่า
   ทั้งที่เลขรุ่นขยับแล้ว โดยไม่มีอะไรฟ้อง (21/8/26 เกิดกับ ijek จริง — deploy.mjs
   มีด่านจับแล้ว แต่ด่านจับได้ตอนจะปล่อย ไม่ใช่ตอนถ่าย จึงต้องจำข้อนี้ตรงนี้ด้วย)

   ค่าเข้ารหัสของคลิป "แอป" ต่างจากคลิปเว็บ (21/8/26 — jek ทักว่าตัวหนังสือแตก):
     1440x900 native (เท่าคลิปเว็บใบอื่นในไซต์) · crf 26 (ไม่ใช่ 32) · เฟดหัวท้าย 0.3 วิ
   เหตุผล: คลิปเว็บคือหน้าเว็บเลื่อนช้าๆ ตัวหนังสือใหญ่ crf 32 เอาอยู่ ส่วนแอปมี
   ตัวเลข แถบ และตัวหนังสือไทยเล็กเต็มจอ ย่อ+บีบแรงแล้วอ่านไม่ออก · เฟดหัวท้าย
   ทำให้ตอนคลิปวนกลับไปเริ่มใหม่ไม่กระตุก (คลิปนี้จบคนละหน้ากับที่เริ่ม)
     ffmpeg -ss <t> -t 25 -i raw.webm -vf "fps=24,fade=t=in:st=0:d=0.3,fade=t=out:st=24.7:d=0.3" \
       -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -profile:v high -g 48 -an -movflags +faststart out.mp4

   สามอย่างที่เสียเวลาหามาก่อนจะได้คลิปที่ใช้ได้ (21/8/26) เก็บไว้ที่นี่ ไม่ใช่ในหัวใคร:
   1. แอปอยู่หลัง Google login — แต่ประตูดูจาก localStorage คีย์เดียว (tm_auth) ตั้งค่าเอง
      บนเครื่องได้ ได้โปรไฟล์เดโมสะอาด ไม่ต้องใช้บัญชีจริงของ jek และไม่มีข้อมูลส่วนตัว
      หลุดขึ้นเว็บพอร์ต (ข้อมูลจริงของเขาคือ 0/7 วัน ซึ่งใช้ขายงานไม่ได้อยู่แล้ว)
   2. บูตในกรอบ iframe ใช้เวลาถึง ~20 วินาที ต้องรอจน UI ขึ้นจริงก่อนค่อยเริ่มเลื่อน
      ไม่งั้นได้คลิปหน้าสแปลชล้วน
   3. แอปเป็น app shell สูงเต็มจอ — window ไม่มีอะไรให้เลื่อน ต้องหา "กล่องที่เลื่อนได้จริง"
      ข้างในแล้วเลื่อนกล่องนั้น
*/
import { writeFileSync, unlinkSync } from "node:fs";
const APP_DIR = "/Users/jek/train-app";
const STAGE = APP_DIR + "/_reel-stage.html";
writeFileSync(STAGE, `<!doctype html><html><head><meta charset="utf-8"><title>Ijek reel stage</title>
<style>
  /* เวทีสำหรับอัดคลิปการ์ดผลงาน — สองจอมือถือเรียงกันบนพื้นเดียวกับภาพนิ่งชุดเดิม
     (assets/work/ijek.webp) เพื่อให้คลิปกับภาพนิ่งของงานเดียวกันเป็นภาษาเดียวกัน */
  html,body{margin:0;height:100%;background:#0b1220;overflow:hidden}
  .stage{width:1440px;height:900px;display:flex;gap:38px;align-items:center;justify-content:center}
  .phone{width:369px;height:797px;border-radius:36px;overflow:hidden;position:relative;
         box-shadow:0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)}
  .phone iframe{width:390px;height:844px;border:0;transform:scale(.9438);transform-origin:0 0;
                position:absolute;inset:0}
</style></head><body>
<div class="stage">
  <div class="phone"><iframe id="a" src="train.html"></iframe></div>
  <div class="phone"><iframe id="b" src="train.html"></iframe></div>
</div>
</body></html>
`);
process.on("exit", () => { try { unlinkSync(STAGE); } catch (_) {} });

import { chromium } from "playwright";
const OUT="/private/tmp/claude-501/-Users-jek/1674a8b0-03ab-4e8f-b780-55f418e23da9/scratchpad/ijvid/";
/* หน้าอวตาร/สติกเกอร์ สลับได้จากบรรทัดคำสั่ง — คลิปกับภาพนิ่งบางรอบ jek อยากได้คนละหน้า
   (21/8/26: คลิปเอาจิ้งจอกตัวเดิม ส่วนภาพนิ่งเป็นหมึก+นก) จึงส่งค่าเข้าไปแทนการแก้โค้ดทุกครั้ง
   ใช้:  AV_FACE=🦊 AV_STICKER= node playbook/shoot-app-reel.mjs      (สติกเกอร์ว่าง = ไม่ติดอะไร) */
const AV = { face: process.env.AV_FACE || '🐙',
             sticker: process.env.AV_STICKER === undefined ? '🐦' : process.env.AV_STICKER };
const SEED = (av) => {
  const uid = () => Math.random().toString(36).slice(2, 10);
  const day = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  /* emoji ของกิจกรรมเก็บเป็น "โค้ด" ไม่ใช่ตัวอักษร (DEFAULT_TASK_EMOJI = '1f4aa')
     ใส่ตัวอักษรลงไปแอปจะไม่รู้จักแล้วตกกลับไปใช้ 💪 เหมือนกันหมดทั้งสี่กิจกรรม
     ซึ่งทำให้รายการกิจกรรมในคลิปดูเหมือนก๊อปวางกันมา (jek ทัก 21/8/26) */
  const acts = [
    /* เลือกเฉพาะโค้ดที่ Noto มี "512.webp แบบเคลื่อนไหว" จริง — ตรวจทีละตัวกับ
       fonts.gstatic.com/s/e/notoemoji/latest/<code>/512.webp (jek 21/8/26)
       ตัวที่ไม่มีไฟล์เคลื่อนไหว (📧 1f4e7 · 🏋️ 1f3cb · 📖 1f4d6 · 🏃 1f3c3 · 📅 1f4c5)
       แอปจะตกไปใช้ png นิ่ง + สั่นเอง ซึ่งดูคนละชั้นกับตัวที่ขยับจริง */
    { name: 'Deep work',     color: '#a3e635', start: 540,  end: 660,  emoji: '1f9e0' },  // 🧠 มีอนิเมชัน
    { name: 'Email & admin', color: '#38bdf8', start: 780,  end: 840,  emoji: '1f4bb' },  // 💻 มีอนิเมชัน
    { name: 'Gym',           color: '#fbbf24', start: 1050, end: 1140, emoji: '1f4aa' },  // 💪 มีอนิเมชัน
    { name: 'Reading',       color: '#f472b6', start: 1200, end: 1260, emoji: '1f4da' },  // 📚 มีอนิเมชัน
  ];
  const A = [], B = [];
  acts.forEach(a => { const id = uid();
    A.push({ id, name: a.name, color: a.color, emoji: a.emoji, createdAt: Date.now() });
    B.push({ id: uid(), activityId: id, days: [0,1,2,3,4,5,6], start: a.start, end: a.end }); });
  const done = {}; const now = new Date();
  for (let i = 1; i <= 3; i++) { const d = new Date(now); d.setDate(d.getDate() - i);
    done[day(d)] = Object.fromEntries(B.map(b => [b.id, true])); }
  done[day(now)] = { [B[0].id]: true, [B[1].id]: true };
  const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  set('tm_auth', { name: 'You', email: 'demo@tarmsung.local', provider: 'local', ts: Date.now() });
  set('tm_activities', A); set('tm_schedule', B); set('tm_done', done);
  /* หน้าอวตารในภาพนิ่ง/คลิปต้องโชว์ว่าปรับแต่งได้จริง ไม่ใช่หน้าเริ่มต้นเปล่าๆ
     เลือกเฉพาะโค้ดที่ Noto มีไฟล์เคลื่อนไหว (512.webp) จริง — ตรวจทีละตัวก่อนใช้
     (jek 21/8/26: ขอหน้าที่ไม่ใช่แพนด้า และให้หมวกเป็น "นก" แบบเคลื่อนไหวได้)
       หน้า  = 🐙 1f419 ✓ (อยู่ในลิสต์ AVATAR_EMOJIS ของแอปด้วย)
       หมวก = 🐦 1f426 ✓  ส่วน 🦜 1f99c กับ 🦢 1f9a2 ไม่มีไฟล์เคลื่อนไหว ใช้ไม่ได้
     สติกเกอร์เก็บเป็น [{emoji,x,y,scale}] · x,y เป็นสัดส่วนของกรอบหน้า */
  set('tm_avatar', { emoji: av.face, name: 'JEK',
    stickers: av.sticker ? [ { emoji: av.sticker, x: 0.50,
      y: (av.stickerY === undefined ? -0.06 : av.stickerY), scale: 0.95 } ] : [] });
  set('tm_user_name', 'You'); set('tm_lang', 'en');
  ['tm_onboarded','tm_intro','tm_tutorial','tm_dev'].forEach(k => set(k, '1'));
  set('tm_plan', 'pro');
};
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:2,
  recordVideo:{ dir: OUT, size:{width:1440,height:900} } });
await ctx.addInitScript(SEED, AV);
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:8000/_reel-stage.html", { waitUntil:"load", timeout:45000 });
const [fa, fb] = [p.frameLocator("#a"), p.frameLocator("#b")];
/* รอจน UI ขึ้นจริงทั้งสองจอก่อนค่อยเริ่มเลื่อน — รอบแรกอัดไปตอนแอปยังอยู่หน้า
   สแปลช (บูตในกรอบ iframe ใช้เวลาถึง 20 วินาที) คลิปที่ได้จึงเป็นภาพนิ่ง */
await fa.getByText("Hello,").first().waitFor({ timeout: 90000 });
await fb.getByText("Hello,").first().waitFor({ timeout: 90000 });
await p.waitForTimeout(1200);
await fb.getByText("Schedule", { exact:true }).last().click();
await p.waitForTimeout(3000);
const t0 = Date.now();
/* เลื่อน "กล่องที่เลื่อนได้จริง" ข้างในแอป ไม่ใช่ window ของ iframe — แอปนี้เป็น
   app shell สูงเต็มจอ window จึงไม่มีอะไรให้เลื่อน (รอบก่อนคลิปเลยออกมาเป็นภาพนิ่ง) */
const scroll = async (_f, sel, to, ms) => p.evaluate(([sel, to, ms]) => new Promise(res => {
  const doc = document.querySelector(sel).contentWindow.document;
  const cands = [...doc.querySelectorAll("div,main,section")].filter(n => {
    const st = getComputedStyle(n);
    return /auto|scroll/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 60;
  });
  const el = cands.sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth))[0]
          || doc.scrollingElement;
  const from = el.scrollTop, t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms);
    el.scrollTop = from + (to - from) * (k < .5 ? 2*k*k : 1 - Math.pow(-2*k+2,2)/2);
    k < 1 ? requestAnimationFrame(step) : res(); };
  requestAnimationFrame(step);
}), [sel, to, ms]);
await p.waitForTimeout(2500);                 // ค้างให้เห็นจอแรกก่อน
await Promise.all([scroll(null,"#a",900,7000), scroll(null,"#b",520,7000)]);
await p.waitForTimeout(1800);
await Promise.all([scroll(null,"#a",1900,6500), scroll(null,"#b",1100,6500)]);
await p.waitForTimeout(2200);
await Promise.all([scroll(null,"#a",0,4000), scroll(null,"#b",0,4000)]);
await p.waitForTimeout(1500);
await ctx.close(); await b.close();
console.log("อัดเสร็จ · ช่วงที่มีเนื้อหาเริ่มวินาทีที่", ((Date.now()-t0)/1000).toFixed(0), "ก่อนจบ");
