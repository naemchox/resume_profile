/* ด่านตรวจ: รีเฟรชกลางหน้าแล้วต้องไม่เด้งไปโชว์หัวเว็บก่อน
   ที่มา (25/8/26): jek ฟ้องว่าเดโม The Terrace พอกด Refresh ตอนอ่านอยู่กลางหน้า
   จะแวบเห็นฮีโร่ก่อน แล้วค่อยเด้งกลับที่เดิม "หลังจากนาน"
   วัดแล้ว: Safari/WebKit คืนตำแหน่ง scroll หลังอีเวนต์ load เท่านั้น (y ตอน DCL = 0
   และตอน load ก็ยัง 0) เน็ตช้า = ค้างผิดที่ 1.3 วินาที — วัดได้ ไม่ใช่ความรู้สึก

   ตรวจ "คุณสมบัติ" 2 ข้อ ไม่ใช่ตรวจว่ามีสคริปต์ไหม:
     1. y ตอน DOMContentLoaded ต้องเท่าตำแหน่งเดิม (คืนก่อนรูปโหลดเสร็จ)
     2. หัวเว็บต้องอยู่ในสถานะสุดท้ายตั้งแต่เฟรมแรก ไม่ใช่ค่อยๆ ทึบ/ขึ้นเส้นให้เห็น
     3. (เตือนอย่างเดียว) ที่ 150ms หลังรีเฟรชอยู่ตำแหน่งเดิมหรือยัง — บางหน้ามีไฟล์
        บล็อกการเรนเดอร์เยอะจน DCL มาช้ากว่านั้นเอง ซึ่งไม่ใช่อาการที่ฟ้องกันอยู่
   หน่วงรูป/ฟอนต์ 1200ms ทุกไฟล์เพื่อเลียนเน็ตจริง — บนเซิร์ฟเวอร์ในเครื่องที่โหลดเสร็จ
   ใน 60ms อาการนี้มองไม่เห็นเลยแม้จะยังพังอยู่

   ใช้: node playbook/audit-scroll-restore.mjs [base]   (ค่าเริ่มต้น http://localhost:8124) */
import { webkit } from "playwright";

const BASE = (process.argv[2] || "http://localhost:8124").replace(/\/$/, "");
const PAGES = process.argv.slice(3).filter((a) => !a.startsWith("-"));
const LIST = PAGES.length ? PAGES : [
  "/", "/work/the-terrace/", "/work/the-bed/", "/work/homecraft/", "/work/glow-clinic/",
  "/work/lumen/", "/work/parcela/", "/work/summit/", "/work/velvet-leaf/", "/work/krua-baansuan/",
  "/work/chang-chat/", "/work/the-terrace-multi/", "/work/the-bed-multi/", "/work/glow-clinic-multi/",
  /* หน้าลูกของเดโมหลายหน้า — เพจที่ยาวพอจะเลื่อนได้จริงส่วนใหญ่อยู่ตรงนี้ ไม่ใช่หน้าแรก */
  "/work/the-terrace-multi/packages/", "/work/the-terrace-multi/venue/",
  "/work/the-bed-multi/suites/", "/work/glow-clinic-multi/doctor/",
];
const WANT = 3000;
/* ยอมคลาดได้ 40px: หลังคืนตำแหน่งแล้ว รูปที่โหลดตามมาอาจทำให้ของเหนือจุดนั้นสูงขึ้น/ลดลง
   เบราว์เซอร์จะเลื่อน scroll ชดเชยให้เนื้อหาที่ตาเห็นอยู่กับที่ (scroll anchoring)
   วัดที่ summit: ค้างที่ 2979 แทน 3000 ตลอดกาล = เนื้อหาถูกที่แล้ว ไม่ใช่คืนตำแหน่งพลาด */
const TOL = 40;

const b = await webkit.launch();
let fails = 0, checked = 0;
for (const path of LIST) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route(/\.(webp|jpg|jpeg|png|avif|mp4|webm|woff2)(\?|$)/i, async (r) => {
    await new Promise((x) => setTimeout(x, 1200)); await r.continue();
  });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__y = {};
    addEventListener("DOMContentLoaded", () => { window.__y.dcl = Math.round(scrollY); });
    addEventListener("load", () => { window.__y.load = Math.round(scrollY); });
    /* หัวเว็บต้องไม่ "โผล่" ตอนเปิดมากลางหน้า: เก็บทุกสถานะของแถบใน 800ms แรก
       ถ้ามีมากกว่าหนึ่งค่า = มันกำลังไล่สีให้เห็น ทั้งที่ผู้ใช้ไม่ได้เลื่อนอะไรเลย */
    window.__nav = [];
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector(".nav-shell, .site-header");
      if (el) {
        const c = getComputedStyle(el), before = getComputedStyle(el, "::before");
        const k = c.borderBottomColor + "|" + c.backgroundColor + "|" + before.opacity;
        if (window.__nav[window.__nav.length - 1] !== k) window.__nav.push(k);
      }
      if (performance.now() - t0 < 800) requestAnimationFrame(tick);
    };
    tick();
  });
  try {
    await p.goto(BASE + path, { waitUntil: "load", timeout: 30000 });
    const tall = await p.evaluate((w) => document.documentElement.scrollHeight - innerHeight > w, WANT);
    if (!tall) { console.log(`⚠️  ${path}: หน้าสั้นเกินกว่าจะเลื่อนถึง ${WANT}px — ข้าม`); await ctx.close(); continue; }
    await p.evaluate((w) => scrollTo(0, w), WANT);
    await p.waitForTimeout(600);
    await p.reload({ waitUntil: "commit" });
    await p.waitForTimeout(150);
    const early = await p.evaluate(() => Math.round(scrollY)).catch(() => -1);
    await p.waitForTimeout(2500);
    const y = await p.evaluate(() => window.__y);
    checked++;
    const nav = await p.evaluate(() => window.__nav || []);
    if (nav.length > 1) { fails++; console.log(`❌ ${path}: หัวเว็บไล่สีให้เห็นตอนรีเฟรช ${nav.length} ขั้น (${nav.join(" → ")})`); }
    const late = (y.dcl ?? 0) < WANT - TOL;
    const stuck = early < WANT - TOL;
    if (late) { fails++; console.log(`❌ ${path}: y ตอน DCL = ${y.dcl ?? "?"} (ควรเป็น ${WANT}) — ยังรอ load อยู่`); }
    else if (stuck) console.log(`⚠️  ${path}: ที่ 150ms ยังอยู่ y=${early} (คืนตำแหน่งทัน DCL แล้ว แต่ DCL หน้านี้มาช้ากว่า 150ms)`);
  } catch (e) {
    fails++; checked++; console.log(`❌ ${path}: ${String(e).split("\n")[0]}`);
  }
  await ctx.close();
}
await b.close();
console.log(fails ? `🔴 รีเฟรชกลางหน้า ${fails}/${checked} ตก` : `🟢 รีเฟรชกลางหน้าผ่าน ${checked}/${checked} (ไม่มีหน้าไหนเด้งไปหัวเว็บ)`);
process.exit(fails ? 1 : 0);
