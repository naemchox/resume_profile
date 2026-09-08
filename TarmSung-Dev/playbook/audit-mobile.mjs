/* ตรวจทุกหน้าบนจอมือถือจริง (390x844, dpr 2, touch) — ใช้: node playbook/audit-mobile.mjs
   (ต้องมีเซิร์ฟเวอร์อยู่ที่ 127.0.0.1:8098 — python3 -m http.server 8098 ในโฟลเดอร์นี้)

   ทำไมต้องมีไฟล์นี้: หน้าเว็บถูกตรวจด้วยตาบนจอคอมเสมอ ส่วนคนที่กดจากลิงก์ที่เรา
   ส่งให้ลูกค้าเปิดบนมือถือแทบทั้งหมด ของที่พังเฉพาะจอเล็ก (ล้นแนวนอน · ปุ่มเล็ก
   จนกดพลาด · ตัวหนังสือ 9px · รูปไม่บอกขนาดแล้วจอกระตุก) จึงไม่มีใครเห็นจนลูกค้าเห็น

   23/8/26 เพิ่มหมวด "กล่องยุบจนเฉือนเนื้อหา" หลังเจอบั๊กที่ด่านนี้มองไม่เห็น: รีลการ์ด
   ผลงานบนจอ ≤1024px เหลือสูง 39px ทั้งที่การ์ดสูง 200px คนกดจากมือถือจึงเห็นการ์ดเป็น
   แถบบางๆ ด่านเดิมตรวจแต่ "ล้น/ปุ่มเล็ก/ตัวหนังสือเล็ก" ซึ่งทั้งสามผ่านหมด เพราะของ
   ไม่ได้ล้นออกมา — มันถูกครอบหายไปข้างใน overflow:hidden ต่างหาก
   และเพิ่มรอบสอง 820px เพราะโหมดคอลัมน์เดียวสลับที่ 1024px ไม่ใช่ที่ 390px
   คนย่อหน้าต่างบนคอมจึงเจอโหมดเดียวกับมือถือ แต่ด่านที่ยิงแค่ 390 ไม่เคยเห็นช่วงนั้น

   หมายเหตุการอ่านผล: "ล้นแนวนอน" ที่รายงานเป็นการวัดระดับ element ของที่ล้นแต่ถูก
   overflow:hidden ครอบไว้ (แถบวิ่ง marquee, แสงประดับ) จะโผล่ในลิสต์ด้วย ให้ดูบรรทัด
   สรุปท้ายหน้าว่า "หน้านี้เลื่อนขวาได้จริงกี่ px" — 0 = ไม่กระทบคนใช้
*/
import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/* deploy.mjs เลี้ยงเซิร์ฟเวอร์ไว้ที่ 8099 ส่วนคนรันมือมักเปิด 8098 — รับได้ทั้งสองทาง */
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:8098";
/* ไล่โฟลเดอร์ใน work/ เอง ไม่ใช่พิมพ์ชื่อไว้ในลิสต์ — 21/8/26 เจอว่าลิสต์ที่พิมพ์มือ
   ตกหล่น the-terrace กับ summit ไปทั้งคู่ (เดโมสองใบที่เพิ่มทีหลังแล้วไม่มีใครกลับ
   มาเติมชื่อ) ผลคือรันแล้วขึ้นว่า "ไม่พบปัญหา" ทั้งที่ไม่เคยเปิดสองหน้านั้นเลย
   ด่านที่ข้ามของบางชิ้นเงียบๆ อันตรายกว่าด่านที่ฟ้อง — ข้าม ไม่เท่ากับ ผ่าน */
const WORK = readdirSync(join(ROOT, "work"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, "work", d.name, "index.html")))
  .map((d) => d.name).sort();
const PAGES = ["/", "/reference.html", "/privacy.html", "/404.html",
  ...WORK.map((s) => `/work/${s}/index.html`)];

const b = await chromium.launch();
/* สองความกว้าง ไม่ใช่ความกว้างเดียว: 390 คือมือถือจริง 820 คือหน้าต่างที่ย่อบนคอม
   ซึ่งยังอยู่ใต้เบรกพอยต์ 1024px ที่ main.js สลับเป็นโหมดคอลัมน์เดียว
   ของที่พังเฉพาะโหมดนั้นต้องโดนจับได้ทั้งสองช่วง ไม่ใช่แค่ช่วงเดียว */
const SIZES = [
  { w:390, h:844, dpr:2, touch:true,  tag:"มือถือ 390" },
  { w:820, h:900, dpr:1, touch:false, tag:"หน้าย่อ 820" },
];
let total = 0, cutTotal = 0;
for (const S of SIZES) {
const ctx = await b.newContext({ viewport:{width:S.w,height:S.h}, deviceScaleFactor:S.dpr, isMobile:S.touch, hasTouch:S.touch });
console.log(`\n=========== ${S.tag} ===========`);
for (const path of PAGES) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(e.message.slice(0,90)));
  p.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,90)); });
  await p.goto(BASE + path, { waitUntil:"load", timeout:45000 });
  await p.waitForTimeout(1200);
  // ประตูตรวจอายุของ velvet-leaf ต้องผ่านก่อน ไม่งั้นตรวจได้แค่หน้าประตู
  const gate = p.getByText("YES, I AM 20+");
  if (await gate.count()) { await gate.first().click(); await p.waitForTimeout(1500); }
  await p.evaluate(async () => {   // เลื่อนให้สุดหน้า เพื่อให้ของที่ reveal ทีหลังโผล่มาให้ตรวจ
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const vw = window.innerWidth, out = { over: [], taps: [], small: [], cut: [], noDim: 0, h: document.documentElement.scrollHeight };
    const name = (n) => n.tagName.toLowerCase() + (n.id ? "#"+n.id : "") + (typeof n.className === "string" && n.className ? "."+n.className.trim().split(/\s+/).slice(0,2).join(".") : "");
    for (const n of document.querySelectorAll("body *")) {
      const st = getComputedStyle(n);
      if (st.display === "none" || st.visibility === "hidden" || +st.opacity === 0) continue;
      const b = n.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (b.right > vw + 1) out.over.push({ el: name(n), px: Math.round(b.right - vw) });
      /* วัด "พื้นที่ที่นิ้วแตะแล้วโดน" ไม่ใช่ขนาดกล่องของปุ่ม — ปุ่มไอคอนหลายตัวในเว็บนี้
         ขยายเขตกดด้วย ::after ที่ลอยอยู่หลังปุ่ม กล่องจึงยังเล็กแต่กดติดแล้วจริง
         (เคยลองยิง elementFromPoint แทน แต่มันใช้ได้เฉพาะของที่อยู่ในจอตอนนั้น
          ของใต้ fold เลยถูกฟ้องหมดทั้งที่ปกติ — จึงอ่านจาก ::after ตรงๆ) */
      if (/^(a|button|summary)$/.test(n.tagName.toLowerCase()) && b.height > 0) {
        const af = getComputedStyle(n, "::after");
        const grown = af.content !== "none" && /absolute|fixed/.test(af.position);
        /* วัดจาก offsetWidth/Height ไม่ใช่กล่องบนจอ (22/8/26) — สองอาการที่ทำให้
           รายงานนี้ฟ้องของที่ไม่ผิด:
           1) min-height:44px ออกมาเป็น 43.99 จากการปัดเศษพิกเซลย่อย แล้วโดนฟ้อง
              ทั้งที่ตั้งไว้ 44 เป๊ะ (a.work-live)
           2) การ์ดที่อนิเมชัน .reveal--scale ยังไม่จบ ถูกวัดตอนกำลังย่ออยู่ (0.97)
              44 จึงกลายเป็น 42.7 — ฟ้องเพราะจับเวลาผิด ไม่ใช่เพราะเขตกดเล็กจริง
           offsetWidth/Height เป็นขนาดตามเลย์เอาต์ ไม่รวม transform และเป็นจำนวนเต็ม
           อาการทั้งสองจึงหายพร้อมกัน โดยของที่เล็กจริงยังถูกฟ้องเหมือนเดิม */
        const w = Math.max(n.offsetWidth || b.width, grown ? parseFloat(af.width) || 0 : 0);
        const h = Math.max(n.offsetHeight || b.height, grown ? parseFloat(af.height) || 0 : 0);
        if (w < 44 || h < 44)
          out.taps.push({ el: name(n), size: `${Math.round(w)}x${Math.round(h)}`, txt: (n.textContent||"").trim().replace(/\s+/g," ").slice(0,18) });
      }
      const fs = parseFloat(st.fontSize);
      if (fs && fs < 12.5 && n.children.length === 0 && (n.textContent||"").trim().length > 3)
        out.small.push({ el: name(n), fs: fs.toFixed(1), txt: n.textContent.trim().slice(0,24) });
      /* กล่องที่ยุบจนเฉือนเนื้อหาตัวเองทิ้ง — อาการที่ไม่ล้นออกมาให้เห็น จึงรอดด่านบน
         เงื่อนไข: ตั้ง overflow แนวตั้งเป็น hidden/clip (ไม่ใช่ auto/scroll ที่คนเลื่อนดูเองได้)
         แล้ว "โชว์ได้ไม่ถึง 60% ของที่เนื้อในต้องใช้" และหายเกิน 48px

         ทำไมต้องเป็นอัตราส่วน ไม่ใช่จำนวนพิกเซล: รอบแรกตั้งไว้ที่ "หายเกิน 32px" เฉยๆ
         ได้มา 18 ข้อ ซึ่งเกือบทั้งหมดคือ hero ที่ตั้งใจครอบแสงเบลอ/แถบวิ่งไว้ (โชว์ 927
         จากที่ต้องใช้ 1159 = 80% ของยังอ่านออกครบ) ด่านที่ฟ้องของถูก 17 ครั้งต่อของผิด
         1 ครั้ง คือด่านที่จะโดนปิดทิ้งภายในสัปดาห์เดียว
         ของที่พังจริงหน้าตาต่างกันคนละเรื่อง: รีลการ์ดโชว์ 39px จากที่ต้องใช้ 200px = 19%
         เส้นแบ่งที่ 60% จึงแยกสองอย่างนี้ออกจากกันได้โดยไม่ต้องพิมพ์ชื่อของยกเว้นไว้ */
      const ovY = st.overflowY;
      if ((ovY === "hidden" || ovY === "clip") && n.clientHeight > 0 && n.scrollHeight > 0
          && n.scrollHeight - n.clientHeight > 48 && n.clientHeight / n.scrollHeight < 0.6) {
        const real = n.querySelector("img, h1, h2, h3, h4, p, li, button, a");
        if (real) out.cut.push({ el: name(n), show: Math.round(b.height), need: n.scrollHeight, lost: n.scrollHeight - n.clientHeight });
      }
      if (n.tagName === "IMG" && (!n.getAttribute("width") || !n.getAttribute("height")) && !st.aspectRatio.includes("/")) out.noDim++;
    }
    const seen = new Set();
    out.over = out.over.filter(o => !seen.has(o.el) && seen.add(o.el)).sort((a,b)=>b.px-a.px).slice(0,4);
    const s2 = new Set(); out.taps = out.taps.filter(o => !s2.has(o.el) && s2.add(o.el)).slice(0,5);
    const s4 = new Set(); out.cut = out.cut.filter(o => !s4.has(o.el) && s4.add(o.el)).sort((a,b)=>b.lost-a.lost).slice(0,5);
    const s3 = new Set(); out.small = out.small.filter(o => !s3.has(o.el+o.fs) && s3.add(o.el+o.fs)).slice(0,5);
    return out;
  });
  const realScroll = await p.evaluate(() => { window.scrollTo(9999, 0); const x = window.scrollX; window.scrollTo(0, 0); return x; });
  const issues = r.over.length + r.taps.length + r.small.length + r.cut.length + (r.noDim?1:0) + errs.length;
  total += issues; cutTotal += r.cut.length;
  console.log(`\n── ${path}  (สูง ${(r.h/844).toFixed(1)} จอ) ${issues ? "" : "✓ ไม่พบปัญหา"}`);
  if (r.over.length) console.log(`   ล้นแนวนอน (element): ${r.over.map(o=>`${o.el} +${o.px}px`).join(" · ")}`);
  console.log(`   หน้านี้เลื่อนขวาได้จริง: ${realScroll}px ${realScroll ? "← ต้องแก้" : "(ของล้นถูกครอบไว้)"}`);
  if (r.cut.length) console.log("   ⚠ กล่องยุบจนเฉือนเนื้อหา:", r.cut.map(c=>`${c.el} โชว์ ${c.show}px จากที่ต้องใช้ ${c.need}px (หาย ${c.lost}px)`).join(" · "));
  if (r.taps.length) console.log("   เขตกดแคบกว่า 44px:", r.taps.map(t=>`${t.el} ${t.size} "${t.txt}"`).join(" · "));
  if (r.small.length) console.log("   ตัวหนังสือ <12.5px:", r.small.map(t=>`${t.fs}px ${t.el} "${t.txt}"`).join(" · "));
  if (r.noDim) console.log(`   รูปไม่บอกขนาด: ${r.noDim} ใบ (จอกระตุกตอนโหลด)`);
  if (errs.length) console.log("   error:", [...new Set(errs)].slice(0,3).join(" | "));
  await p.close();
}
await ctx.close();
}
console.log(`\nรวมทั้งเว็บ (สองความกว้าง): ${total} ข้อ`);
/* ออกรหัส 1 เฉพาะหมวด "กล่องยุบจนเฉือนเนื้อหา" — หมวดนี้แปลว่าคนกดเข้ามาแล้วมองไม่เห็น
   ของที่เราตั้งใจให้เห็น ปล่อยขึ้นเว็บไม่ได้ ส่วนหมวดอื่น (ปุ่มเล็ก · ตัวหนังสือเล็ก ·
   ของล้นที่ถูกครอบไว้) เป็นรายงานให้อ่าน ไม่บล็อก เพราะมีเคสตั้งใจอยู่จริง
   ตั้งใจให้เฉือน = ใส่ --allow-cut แล้วเขียนเหตุผลกำกับไว้ในคอมมิต */
/* ออกรหัส 2 ไม่ใช่ 1 สำหรับ "เจอของผิด" — เพราะ node ใช้รหัส 1 กับ exception ด้วย
   24/8/69 เซิร์ฟเวอร์ตายกลางรัน สคริปต์นี้ throw แล้วออกรหัส 1 แล้ว deploy.mjs
   รายงานว่า "มีกล่องที่เฉือนเนื้อหาทิ้งบนจอเล็ก" ทั้งที่ไม่เคยตรวจจบสักหน้า
   ด่านที่บอกสาเหตุผิดส่งให้คนไปตามหาปัญหาที่ไม่มีอยู่ = แย่กว่าไม่มีด่าน */
if (cutTotal && !process.argv.includes("--allow-cut")) {
  console.log(`\n✗ มี ${cutTotal} กล่องที่เฉือนเนื้อหาตัวเองทิ้งบนจอเล็ก — แก้ก่อนปล่อย`);
  await b.close(); process.exit(2);
}
await b.close();
