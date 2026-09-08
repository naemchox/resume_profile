#!/usr/bin/env node
/* =============================================================================
   audit-multi.mjs — ตรวจเดโมหลายหน้าให้ครบ "ทุกหน้า" ไม่ใช่หน้าตัวอย่าง
   ใช้:  python3 -m http.server 8099   (ที่รากรีโป) แล้ว
        node playbook/audit-multi.mjs the-terrace-multi the-bed-multi glow-clinic-multi

   ทำไมมีไฟล์นี้: check-demo-rules.mjs วัด "หน้าแรกของแต่ละใบเป็นตัวแทน" ซึ่งพอสำหรับ
   กฎดีไซน์ แต่บั๊กที่หลุดจริงอยู่หน้าใน — /contact ของเทอเรสเคยเหลือปุ่มสองปุ่มลอย
   โดยที่อยู่หายทั้งก้อน และลิงก์ภายในที่ไม่มี / ท้ายอีก 11 จุดซึ่งเป็น 404 บนโฮสต์ทั่วไป
   ด่านนี้เดินตามลิงก์เองจนครบทุกหน้า แล้วตรวจสิ่งที่ "ดูด้วยตาแล้วมองข้ามได้"
   ========================================================================== */
import { chromium } from "playwright";
const DEMOS = process.argv.slice(2);
if (!DEMOS.length) { console.error("ใช้: node playbook/audit-multi.mjs <เดโม> [เดโม...]"); process.exit(2); }
const b = await chromium.launch();
let fail = 0;
for (const demo of DEMOS) {
  /* 27/8/26 รับ PORT ได้ — เครื่องนี้มีเซิร์ฟเวอร์ค้างที่ 8099 ของอีกเซสชันซึ่งชี้คนละราก
     ด่านเลยตอบ 404 ทั้งที่หน้าเว็บไม่ได้พัง (เสียเวลาไล่หาอยู่พักหนึ่ง) */
  const base = `http://localhost:${process.env.PORT || 8099}/work/${demo}/`;
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const seen = new Set(), queue = [base], metas = new Map(), report = [];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue; seen.add(url);
    const pg = await ctx.newPage();
    const bad = [], errs = [];
    pg.on("response", r => r.status() >= 400 && bad.push(`${r.status()} ${r.url().replace(base, "")}`));
    pg.on("pageerror", e => errs.push(e.message));
    pg.on("console", m => m.type() === "error" && errs.push(m.text()));
    const res = await pg.goto(url, { waitUntil: "networkidle" }).catch(() => null);
    const short = url.replace(base, "") || "(หน้าแรก)";
    if (!res || res.status() >= 400) { report.push(`✗ ${short} — โหลดไม่ได้ (${res?.status()})`); fail++; await pg.close(); continue; }
    const d = await pg.evaluate(() => ({
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.content || "",
      canon: document.querySelector("link[rel=canonical]")?.href || "",
      og: document.querySelector('meta[property="og:image"]')?.content || "",
      h1: [...document.querySelectorAll("h1")].length,
      noAlt: [...document.querySelectorAll("img:not([alt])")].length,
      nameless: [...document.querySelectorAll("a[href]")].filter(a =>
        !a.innerText.trim() && !a.getAttribute("aria-label") && !a.querySelector("img[alt]:not([alt=''])")).length,
      links: [...document.querySelectorAll("a[href]")].map(a => a.href),
    }));
    if (!d.title) { report.push(`✗ ${short} — ไม่มี <title>`); fail++; }
    if (!d.desc)  { report.push(`✗ ${short} — ไม่มี description`); fail++; }
    if (!d.canon) { report.push(`✗ ${short} — ไม่มี canonical`); fail++; }
    if (!d.og)    { report.push(`✗ ${short} — ไม่มี og:image`); fail++; }
    if (d.h1 !== 1) { report.push(`✗ ${short} — มี <h1> ${d.h1} อัน (ต้อง 1)`); fail++; }
    if (d.noAlt)  { report.push(`✗ ${short} — รูปไม่มี alt ${d.noAlt} ใบ`); fail++; }
    if (d.nameless) { report.push(`✗ ${short} — ลิงก์ไม่มีชื่อให้อ่าน ${d.nameless} อัน`); fail++; }
    if (bad.length) { report.push(`✗ ${short} — ทรัพยากรตอบ 4xx: ${[...new Set(bad)].join(", ")}`); fail++; }
    if (errs.length) { report.push(`✗ ${short} — console: ${[...new Set(errs)].slice(0, 2).join(" | ")}`); fail++; }
    /* เมตาซ้ำ = สองหน้าแย่งกันเองในผลค้นหา ซึ่งทำลายสิ่งที่แพ็ก ฿7,500 ขายพอดี */
    for (const [k, v] of [["title", d.title], ["desc", d.desc], ["canonical", d.canon]]) {
      const key = k + "::" + v;
      if (metas.has(key)) { report.push(`✗ ${short} — ${k} ซ้ำกับ ${metas.get(key)}`); fail++; }
      else metas.set(key, short);
    }
    /* ล้นแนวนอนบนมือถือ: ตัดสินจาก "มีของยื่นเกินจอจริงไหม" ไม่ใช่ scrollWidth ดิบ —
       scrollWidth เกินไม่กี่พิกเซลโดยไม่มี element ไหนยื่นเลย คือเศษการปัดของเบราว์เซอร์
       ด่านที่ฟ้องของที่ไม่พัง จะทำให้คนเลิกเชื่อด่าน แล้ววันที่มันฟ้องของจริงก็ไม่มีใครฟัง */
    const mob = await ctx.newPage(); await mob.setViewportSize({ width: 390, height: 844 });
    await mob.goto(url, { waitUntil: "networkidle" });
    const ov = await mob.evaluate(() => {
      const de = document.documentElement, W = de.clientWidth, hits = [];
      for (const e of document.querySelectorAll("body *")) {
        const r = e.getBoundingClientRect();
        if (r.right <= W + 0.5) continue;
        let p = e.parentElement, clipped = false;
        while (p) { if (getComputedStyle(p).overflowX !== "visible") { clipped = true; break; } p = p.parentElement; }
        if (!clipped) hits.push(`${e.tagName}.${(e.className || "").toString().slice(0, 30)}`);
      }
      return { ov: de.scrollWidth - W, hits: hits.slice(0, 3) };
    });
    if (ov.hits.length || ov.ov > 8) { report.push(`✗ ${short} — ล้นแนวนอนบนมือถือ ${ov.ov}px · ${ov.hits.join(" | ")}`); fail++; }
    await mob.close();
    for (const l of d.links) if (l.startsWith(base) && !l.includes("#")) queue.push(l.split("?")[0]);
    await pg.close();
  }
  console.log(`\n=== ${demo} — เดินครบ ${seen.size} หน้า ===`);
  console.log(report.length ? report.join("\n") : "  ไม่พบปัญหา");
  await ctx.close();
}
await b.close();
console.log(`\nรวมตก ${fail} ข้อ`);
process.exit(fail ? 1 : 0);
