#!/usr/bin/env node
/* =============================================================================
   audit-scroll.mjs — ด่าน "หน้าเว็บเลื่อนลื่นไหม" (22/8/26)
   ใช้:  python3 -m http.server 8099   (ที่รากรีโป) แล้ว
        node playbook/audit-scroll.mjs --all          # ตรวจเดโมทุกใบ + หน้าหลัก
        node playbook/audit-scroll.mjs velvet-leaf    # เฉพาะที่ระบุ

   ทำไมต้องมีไฟล์นี้ — และทำไมมันควรมีตั้งนานแล้ว
   22/8/26 jek รายงานว่าคลิป velvet-leaf "โคตรแล็ก" ไล่ไปสุดทางแล้วพบว่าไม่ใช่คลิป
   แต่เป็น **หน้าเดโมเองเลื่อนที่ 20fps** (เฟรมยาวเกิน 20ms 202 จาก 300 เฟรม
   ขณะที่เดโมใบอื่นได้ 60fps เฟรมยาว 0-4 ทุกใบ) คนที่กดเข้าเว็บจริงก็เจออาการนี้
   คลิปแค่บันทึกความกระตุกนั้นไว้

   แล้วทำไมด่านทั้งเจ็ดตัวถึงขึ้นเขียวหมดมาตลอด — เพราะไม่มีตัวไหนวัดเวลาเลย:
     audit-heads       หัวข้อครบไหม            (DOM)
     audit-code        ของตาย/เลขรุ่น/คลาสค้าง  (ไฟล์)
     audit-mobile      ล้นจอ/เขตกด/ตัวหนังสือ   (เลย์เอาต์นิ่ง)
     audit-sameness    คลังชื่อคลาสซ้ำกันไหม     (ไฟล์)
     check-demo-rules  ทรงหัวข้อ/เอฟเฟกต์/สปาย  (มี แต่ถามว่า "มีไหม" ไม่ได้ถามว่า "ลื่นไหม")
     audit-multi       เดินครบทุกหน้าไหม        (ลิงก์)
     regress / visual  ของหาย / ภาพเพี้ยน       (DOM + พิกเซล)
   หน้าเว็บที่ครบทุกอย่างและหน้าตาถูกต้องเป๊ะ แต่เลื่อนแล้วกระตุก ผ่านทั้งเจ็ดด่านสบายๆ
   ENGINE.md เขียนไว้เองว่า "กฎที่ไม่มีเครื่องจับ = กฎที่ถูกข้ามเงียบๆ" — ไฟล์นี้คือ
   เครื่องจับของกฎที่ยังไม่เคยมีเครื่องจับ

   วัดอะไร
   เลื่อนหน้าลงด้วย rAF ตามเวลานาฬิกาจริง แล้วเก็บเวลาต่อเฟรม รายงานสองตัว:
     fps กลาง (มัธยฐาน)  — ตัวตัดสิน ตกเมื่อต่ำกว่า MIN_FPS
     เฟรมยาว > 20ms      — ตัวบอกใบ้ ไม่ใช้ตัดสิน เพราะสวิงตามภาระเครื่องที่รันอยู่
   ใช้มัธยฐานไม่ใช่ค่าเฉลี่ย: เฟรมแรกๆ ที่กำลังถอดรหัสรูปจะดึงค่าเฉลี่ยลงทุกหน้า
   เท่ากันหมด ส่วนมัธยฐานบอก "สภาพปกติระหว่างเลื่อน" ซึ่งคือสิ่งที่คนรู้สึก

   เกณฑ์มาจากของจริง ไม่ใช่ตัวเลขสวยๆ: วัดวันเดียวกันได้ krua/the-bed/glow/homecraft
   = 60fps ทุกใบ ส่วน velvet-leaf ตอนพัง = 20-31fps ตั้งไว้ที่ 50 จึงแยกสองกลุ่มนี้
   ออกจากกันโดยไม่ฟ้องใบที่ปกติ (เครื่องตรวจที่ฟ้องของที่ไม่ผิด สอนให้คนเลิกอ่านผล)
   ========================================================================== */

/* ⚠️ ผลของด่านนี้ขึ้นกับ "เครื่องว่างแค่ไหน ณ ตอนวัด" ไม่ใช่แค่โค้ด (เจอจริง 23/8/26)
   work/gamedock วัดได้ fps 30 · เฟรมยาว 298/356 → ตกด่าน · deploy พังไปหนึ่งรอบเต็ม
   วัดซ้ำตอนเครื่องว่าง โค้ดเดิมทุกตัวอักษร ได้ fps 60 · เฟรมยาว 2/356 → ผ่านสบาย
   ต้นเหตุ: ตอนนั้นมี playwright สองชุดรันพร้อมกัน (สองเซสชันทำงานคนละเรื่องใน repo เดียว)
   เจอด่านนี้ฟ้องแดง อย่าเพิ่งไล่แก้โค้ด — ปิดของหนักให้หมดแล้ววัดหน้านั้นเดี่ยวๆ ก่อน:
       node playbook/audit-scroll.mjs work/<เดโม>/index.html
   ถ้าวัดเดี่ยวแล้วผ่าน = เครื่องโหลด ไม่ใช่บั๊ก */

import { chromium } from "playwright";

const BASE = "http://localhost:8099/";
const MIN_FPS = 50;
const EARLY = process.argv.includes("--early");   /* วัด 0-3 วิแรกหลังโหลด แทนที่จะรอหน้านิ่ง */
const SCROLL_PX_PER_SEC = 640;   // เร็วกว่าตอนถ่ายคลิปเท่าตัว เพื่อให้ตรวจทั้งหน้าจบไว
const MAX_FRAMES = 900;          // เพดานกันหน้ายาวมากๆ ลากเวลาตรวจ

const DEMOS = ["gamedock", "chang-chat", "krua-baansuan", "glow-clinic", "the-terrace", "the-bed",
               "homecraft", "velvet-leaf", "lumen", "summit",
               "the-terrace-multi", "the-bed-multi", "glow-clinic-multi"];
const ROOT_PAGES = ["index.html", "reference.html"];

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const all = process.argv.includes("--all") || !args.length;
const targets = all
  ? [...ROOT_PAGES, ...DEMOS.map((d) => `work/${d}/index.html`)]
  : args.map((a) => (a.includes("/") || a.endsWith(".html") ? a : `work/${a}/index.html`));

const b = await chromium.launch();
let bad = 0;
const rows = [];

for (const path of targets) {
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });

    /* ผ่านด่านหน้าเว็บก่อนวัด — เหตุผลเดียวกับ check-demo-rules: velvet-leaf มีด่าน
       ยืนยันอายุคลุมทั้งหน้า ถ้าไม่กดผ่านก็จะได้วัด "หน้าด่าน" ที่นิ่งสนิทแล้วรายงาน
       60fps ทุกครั้ง = ตกเพราะวัดไม่ถึง ซึ่งอ่านแยกไม่ออกจากผ่านจริง */
    const gate = p.getByRole("button", { name: /yes,? i am 20|ใช่|20\+|ยอมรับ|accept/i }).first();
    if (await gate.count()) { await gate.click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(900); }

    /* โหมดปกติรอ 1,600ms ให้ทุกอย่างนิ่งก่อนวัด ซึ่งแปลว่า **ช่วงที่คนเห็นกระตุกจริงที่สุด
       ไม่เคยถูกวัดเลย** — หัวข้อ The Bed สั่นในสองสามวินาทีแรก (ฟอนต์สลับ + hero animation
       2.8s + parallax) แล้วด่านนี้เพิ่งเริ่มจับหลังจากนั้นพอดี · `--early` = วัดทันทีที่หน้าโผล่
       ตาม DEMO-SPEC S2.9 (ต้องวัดช่วง 0-3 วิแรกด้วย ไม่ใช่วัดแต่ตอนหน้านิ่ง) */
    if (!EARLY) await p.waitForTimeout(1600);
    else await p.waitForTimeout(120);

    const r = await p.evaluate(({ pps, maxFrames }) => new Promise((res) => {
      const times = [], hot = [];
      let last = performance.now(), y = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      const step = (now) => {
        const dt = now - last; last = now;
        times.push(dt);
        if (dt > 20) hot.push(Math.round(y));
        y += pps / 60;
        scrollTo(0, y);
        if (y < max && times.length < maxFrames) requestAnimationFrame(step);
        else {
          const s = [...times].sort((a, b) => a - b);
          const mid = s[Math.floor(s.length / 2)] || 16.7;
          res({
            fps: Math.round(1000 / mid),
            frames: times.length,
            long: times.filter((t) => t > 20).length,
            zone: hot.length ? Math.round(hot.reduce((a, c) => a + c, 0) / hot.length) : 0,
            height: Math.round(max),
          });
        }
      };
      requestAnimationFrame(step);
    }), { pps: SCROLL_PX_PER_SEC, maxFrames: MAX_FRAMES });

    const fail = r.fps < MIN_FPS;
    if (fail) bad++;
    rows.push({ path, ...r, fail });
  } catch (e) {
    rows.push({ path, err: String(e).split("\n")[0].slice(0, 70) });
    bad++;
  }
  await p.close();
}
await b.close();

console.log(`เลื่อนหน้าแล้วลื่นไหม${EARLY ? " (โหมด --early: วัดทันทีที่หน้าโผล่)" : ""} — เกณฑ์ตก: fps กลางต่ำกว่า ${MIN_FPS}\n`);
for (const r of rows) {
  if (r.err) { console.log(`✗ ${r.path.padEnd(38)} โหลดไม่ได้ — ${r.err}`); continue; }
  const mark = r.fail ? "✗" : "✓";
  const zone = r.long ? ` · เฟรมยาว ${r.long}/${r.frames} กระจุกแถว y≈${r.zone}` : "";
  console.log(`${mark} ${r.path.padEnd(38)} fps กลาง ${String(r.fps).padStart(3)} · สูง ${r.height}px${zone}`);
}
console.log(`\nตรวจ ${rows.length} หน้า · ตก ${bad} ข้อ`);
if (bad) {
  console.log(`
หน้าที่ตกไม่ได้แปลว่า "ของหาย" หรือ "หน้าตาเพี้ยน" — ด่านอื่นจับสองอย่างนั้นอยู่แล้ว
มันแปลว่าคนที่เลื่อนหน้านี้จะรู้สึกหนืด ตัวที่เคยเจอจริงเรียงตามความถี่:
  1. filter: blur() บนของใหญ่ที่มีอนิเมชัน scale — เบลอถูกเรนเดอร์ใหม่ทุกเฟรม
  2. mix-blend-mode บนแผ่นเต็มจอแบบ fixed — ผสมสีทั้งจอทุกเฟรม
  3. backdrop-filter ที่ยังทำงานอยู่บนแผงที่ปิดแล้ว (opacity:0 แต่ยังจ่ายค่าเบลอ)
ดูเลข "กระจุกแถว y≈" เพื่อรู้ว่าไปหาที่ช่วงไหนของหน้า`);
  process.exit(1);
}
