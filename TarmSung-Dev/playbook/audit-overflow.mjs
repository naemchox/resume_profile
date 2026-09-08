#!/usr/bin/env node
/* =============================================================================
   audit-overflow.mjs — ด่านตรวจ "การเกย" (23 ส.ค. 2026)
   ใช้:  node playbook/audit-overflow.mjs            # ทุกเดโม
         node playbook/audit-overflow.mjs the-bed    # เฉพาะที่ระบุ

   ทำไมต้องมีด่านนี้:
   jek เห็นเองว่าเพชรของโลโก้ The Bed "เกย" ออกนอกแถบเมนู — ตัวตรวจที่มีอยู่ทั้งหมด
   มองไม่เห็น เพราะทุกตัวอ่าน "กล่องตามผัง" (offsetHeight) ซึ่งของชิ้นนั้นสูง 36px
   ตรงตามที่เขียนไว้เป๊ะ แต่มันถูก rotate(45deg) ทำให้ "กล่องที่ตาเห็น" สูง 50.9px
   transform ไม่เปลี่ยนผัง เบราว์เซอร์จึงไม่กันที่ให้ และไม่มีใครนับว่ามันพัง

   กฎที่ด่านนี้บังคับ: ของที่อยู่ในแถบเมนู "กล่องที่ตาเห็น" ต้องอยู่ในแถบ
   เทียบด้วย getBoundingClientRect() (นับ transform) ไม่ใช่ offsetHeight (ไม่นับ)
   และต้องตรวจ "ตอนแถบหดแล้ว" ด้วย เพราะแถบหดคือตอนที่เตี้ยที่สุด = ตอนที่เกย
   ========================================================================== */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const TOL = 1;            /* px — ต่ำกว่านี้คือเศษการปัดของเบราว์เซอร์ ไม่ใช่การเกย */

const MIME = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".mjs":"text/javascript",
  ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg", ".png":"image/png", ".mp4":"video/mp4", ".woff2":"font/woff2", ".ico":"image/x-icon" };

/* เสิร์ฟผ่าน http ไม่ใช่ file:// — เดโมหลายหน้ามีลิงก์แบบโฟลเดอร์ และ view transition
   ไม่ทำงานบน opaque origin (เจอมาแล้ว 23/8/26) */
const server = createServer((req, res) => {
  let p = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

/* หน้าที่ต้องตรวจ = index ของทุกเดโม + ทุกหน้าย่อยของเดโมหลายหน้า */
const demos = readdirSync(join(ROOT, "work")).filter((d) =>
  statSync(join(ROOT, "work", d)).isDirectory() && existsSync(join(ROOT, "work", d, "index.html")));
const targets = [];
for (const d of demos) {
  if (only.length && !only.includes(d)) continue;
  targets.push([d, `/work/${d}/`]);
  const sub = join(ROOT, "work", d);
  for (const s of readdirSync(sub)) {
    if (s.startsWith("_") || s === "css" || s === "js" || s === "img" || s === "assets") continue;
    if (existsSync(join(sub, s, "index.html"))) targets.push([d, `/work/${d}/${s}/`]);
  }
}

const probe = () => {
  const vis = (e) => {
    const c = getComputedStyle(e);
    if (c.display === "none" || c.visibility === "hidden" || +c.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const bars = [...document.querySelectorAll("header, .site-header, nav, .nav")]
    .filter((e) => { const p = getComputedStyle(e).position; return p === "fixed" || p === "sticky"; })
    .filter(vis);
  if (!bars.length) return { bar: null, bad: [] };
  /* แถบที่สูงที่สุดคือแถบจริง ตัวที่ซ้อนอยู่ข้างในเป็นลูกของมัน */
  const bar = bars.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
  const box = bar.getBoundingClientRect();
  const bad = [];
  for (const e of bar.querySelectorAll("*")) {
    if (!vis(e)) continue;
    const c = getComputedStyle(e);
    /* ของที่ "ตั้งใจ" ให้ห้อยออกนอกแถบ (เมนูมือถือที่กางลงมา · ป้ายลอย) ประกาศตัวเอง
       ด้วย position absolute/fixed เสมอ — ไม่นับ ส่วนของที่ไหลตามผังปกติต้องอยู่ในแถบ */
    if (c.position === "absolute" || c.position === "fixed") continue;
    const r = e.getBoundingClientRect();
    const over = Math.max(box.top - r.top, r.bottom - box.bottom);
    if (over <= 1) continue;
    bad.push({ over: +over.toFixed(1),
      sel: e.tagName.toLowerCase() + (e.className && typeof e.className === "string"
        ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""),
      visH: +r.height.toFixed(1), layoutH: e.offsetHeight, tf: c.transform === "none" ? "" : "transform" });
  }
  /* ของชิ้นเดียวกันซ้อนกันหลายชั้น (span ใน a ใน div) รายงานแค่ชั้นที่เกยมากที่สุด */
  bad.sort((a, b) => b.over - a.over);
  return { bar: +box.height.toFixed(1), bad: bad.slice(0, 4) };
};

const browser = await chromium.launch();
let fails = 0, checked = 0;
for (const [demo, url] of targets) {
  for (const [w, h, name] of [[1440, 900, "จอกว้าง"], [390, 844, "มือถือ"]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    try {
      await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: "load", timeout: 20000 });
      await page.waitForTimeout(350);
      /* ต้องตรวจ "ตอนหด" ด้วย — แถบที่หดแล้วคือตอนที่เตี้ยที่สุด = ตอนที่ของเกยออกมา
         ตอนไม่เลื่อนแถบยังสูงอยู่ อาการจะไม่โผล่ ซึ่งเป็นเหตุผลที่มันหลุดมาถึงตาคน */
      for (const [y, state] of [[0, "บนสุด"], [600, "เลื่อนแล้ว"]]) {
        await page.evaluate((yy) => scrollTo({ top: yy, behavior: "instant" }), y);
        await page.waitForTimeout(450);
        const r = await page.evaluate(probe);
        checked++;
        if (!r.bar || !r.bad.length) continue;
        fails++;
        console.log(`❌ ${url} · ${name} · ${state} · แถบสูง ${r.bar}px`);
        for (const b of r.bad)
          console.log(`     เกย ${b.over}px  ${b.sel}  (ตาเห็น ${b.visH} / ตามผัง ${b.layoutH}${b.tf ? " · " + b.tf : ""})`);
      }
    } catch (e) {
      fails++; console.log(`❌ ${url} · ${name} · ERROR ${String(e.message).split("\n")[0]}`);
    }
    await page.close();
  }
}
await browser.close();
server.close();
console.log(fails ? `\nไม่ผ่าน ${fails} จุด จาก ${checked} การตรวจ` : `✅ ผ่าน — ไม่มีของเกยนอกแถบเมนู (${checked} การตรวจ)`);
process.exit(fails ? 1 : 0);
