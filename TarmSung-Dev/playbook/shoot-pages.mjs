#!/usr/bin/env node
/* =============================================================================
   shoot-pages.mjs — ถ่าย "แถบสามช่วง" ของหน้าเดโม (บน · กลาง · ล่าง)
   ใช้: node playbook/shoot-pages.mjs the-terrace      # ถ่ายเฉพาะที่ระบุ
        node playbook/shoot-pages.mjs                  # ถ่ายทุกใบในลิสต์

   ภาพชุดนี้คือสิ่งที่การ์ดในหน้า reference.html กางออกมาให้ดู
   (assets/work/pages/<ชื่อ>-1..N.webp 2800px สำหรับเวที + -t.webp 320px สำหรับแถบรูปย่อ · N ผูกกับความยาวหน้า 3-8 ใบ)

   ทำไมต้องมีไฟล์นี้: ภาพชุดเดิมของ krua/glow/parcela/homecraft/lumen ถูกถ่ายด้วยมือ
   ทีละใบโดยไม่มีสคริปต์เก็บไว้ พอจะเพิ่มเดโมใบใหม่จึงไม่มีอะไรบอกว่า "ใบเดิมถ่ายที่
   ตำแหน่งไหน ขนาดเท่าไหร่" — ของชนิดเดียวกันต้องออกมาจากกลไกเดียวกัน ไม่งั้นการ์ด
   ใบใหม่จะเพี้ยนจากเพื่อนโดยไม่มีใครรู้ตัวจนกว่าจะเห็นเรียงกัน
   ========================================================================== */
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ลิสต์เดียวกับ shoot-cover.mjs — เดโมที่มีการ์ดในหน้า reference */
const SHOTS = {
  "krua-baansuan": "work/krua-baansuan/index.html",
  "glow-clinic":   "work/glow-clinic/index.html",
  /* 27/8/26 เปลี่ยนเป็นเดโมคลินิก 14 หน้า (คืนจาก commit 0bc85e9) — เลือก 6 หน้าที่
     "อธิบายส่วนต่างราคา" ได้จริง ไม่ใช่หน้าที่สวยที่สุด: หน้าแรก · โปรแกรม hub ·
     โปรโมชั่นเดือนนี้ · เครื่องมือและความรู้ · คนหล่อสวย · รีวิว
     (สามหน้าท้ายคือหน้าที่ฉบับ 5 หน้าเดิมไม่มีเลย = เหตุผลที่ราคาต่างกัน) */
  "glow-clinic-multi": [
    "work/glow-clinic-multi/index.html",
    "work/glow-clinic-multi/programs/index.html",
    "work/glow-clinic-multi/promotions/index.html",
    "work/glow-clinic-multi/knowledge/index.html",
    "work/glow-clinic-multi/customers/index.html",
    "work/glow-clinic-multi/reviews/index.html",
  ],
  "the-terrace":   "work/the-terrace/index.html",
  "chang-chat":    "work/chang-chat/index.html",
  /* เดโมแพ็ก ฿7,500 ใส่เป็น "ลิสต์ของหน้า" ไม่ใช่พาธเดียว — ดูเหตุผลที่ตัวลูปข้างล่าง */
  "the-terrace-multi": [
    "work/the-terrace-multi/index.html",
    "work/the-terrace-multi/venue/index.html",
    "work/the-terrace-multi/packages/index.html",
    "work/the-terrace-multi/story/index.html",
    "work/the-terrace-multi/contact/index.html",
  ],
  /* PARCELA ถูกถอดออกจากหน้าผลงาน 21/8/26 (jek สั่งเอาเดอะ เทอเรสขึ้นแทน)
     ซอร์สยังอยู่ที่ work/parcela/ ไม่ได้ลบ — ถ้าจะเอากลับขึ้นเว็บ ใส่บรรทัดของมัน
     กลับเข้าลิสต์นี้แล้วรันใหม่ ได้ไฟล์คืนใน 30 วินาที ไม่ต้องเก็บไฟล์ตายไว้บนเว็บ */
  homecraft:       "work/homecraft/index.html",
  /* สามใบล่างนี้เพิ่มทีหลัง: ตอนแรกไฟล์นี้รู้จักแค่เดโมที่เพิ่งทำ แต่ภาพรายช่วงมีครบ
     ทั้งเจ็ดงานในหน้าอ้างอิงผลงาน — พอ the-bed เปลี่ยนรูปทั้งชุดแล้วสั่งถ่ายใหม่
     สคริปต์ตอบว่า "ไม่รู้จัก the-bed" ทั้งที่ภาพของมันอยู่ในหน้านั้นอยู่แล้ว */
  "the-bed":       "work/the-bed/index.html",
  "the-bed-multi": [
    "work/the-bed-multi/index.html",
    "work/the-bed-multi/suites/index.html",
    "work/the-bed-multi/amenities/index.html",
    "work/the-bed-multi/story/index.html",
    "work/the-bed-multi/contact/index.html",
  ],
  lumen:           "work/lumen/index.html",
  "velvet-leaf":   "work/velvet-leaf/index.html",
  summit:          "work/summit/index.html",
};

/* หน้าที่มีประตูกั้นก่อนเข้า ต้องกดผ่านก่อน ไม่งั้นได้ภาพประตูใบเดียวแล้วจบ
   (velvet-leaf ถามอายุ 20+ — รอบก่อนถ่ายได้ "1 ใบ" เพราะหน้ายังเลื่อนไม่ได้) */
const PREP = {
  "velvet-leaf": async (page) => {
    const yes = page.getByRole("button", { name: /yes,? i am 20|ใช่|20\+/i }).first();
    if (await yes.count()) { await yes.click(); await page.waitForTimeout(1500); }
  },
};

const W = 1280, H = 800;     // ถ่ายที่ขนาดเดสก์ท็อปเดียวกับปก
/* 1600 ไม่ใช่ 760 — วัดจากที่มันถูกแสดงจริง (21/8/26):
   ในหน้าต่างดูผลงาน ภาพถูกวางกว้าง 928 CSS px บนจอ retina = 1,856 พิกเซลจริง
   ไฟล์เดิมกว้าง 760 จึงถูก "ขยาย 2.44 เท่า" ทุกครั้งที่เปิดดู — นั่นคือเหตุผล
   ที่ jek ถามว่าทำไมภาพแตก มันไม่ได้ถ่ายมาไม่ดี มันถูกยืด
   หลังขยายกล่องเป็น 1400px ที่ต้องครอบคือ 2,189 จึงใช้ 2200 = ไม่ยืดเลยแม้แต่นิด */
/* 2800 ไม่ใช่ 2200 (21/8/26): 2200 พอดีกับกล่องปกติ (1,094 CSS px × dpr2 = 2,189)
   แต่พอหน้าต่างมีโหมดเต็มจอ ภาพเดียวกันถูกวางกว้างเท่าจอจริง — บนจอ 5K ที่ dpr2
   นั่นคือเกิน 2,800 พิกเซล 2200 จะเริ่มถูกยืดอีกรอบ 2800 ครอบเคสนั้นโดยไฟล์ยัง
   อยู่ราว 120-160KB ต่อใบ และโหลดทีละใบเท่านั้น */
const OUT_W = 2800;
const QUALITY = 76;
/* รูปย่อในแถบล่างกว้างจริงแค่ 104 CSS px (208 บน retina) ถ้าใช้ไฟล์ 1600 ใบเดียว
   กันทั้งเวทีและแถบ = เปิดการ์ดหนึ่งใบโหลดภาพใหญ่สี่ไฟล์เพื่อไปวาดรูปจิ๋วสี่รูป
   จึงออกไฟล์ที่สองสำหรับแถบโดยเฉพาะ */
const THUMB_W = 320;
const THUMB_Q = 72;

const want = process.argv.slice(2);
const list = want.length ? want : Object.keys(SHOTS);
for (const n of list) if (!SHOTS[n]) { console.error(`ไม่รู้จัก "${n}" — มีให้เลือก: ${Object.keys(SHOTS).join(", ")}`); process.exit(2); }

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("ต้องมี playwright ก่อน:  npm i -D playwright && npx playwright install chromium"); process.exit(2); }

/* รอให้อนิเมชันขาเข้าของหน้าจบจริง ไม่ใช่เดาเป็นวินาที: หน้าอย่าง the-bed มีโลโก้
   กับแถบเมนูที่ไถลเข้ามา ถ้ากดชัตเตอร์กลางทางจะได้ตัวหนังสือซ้อนสองชั้น (ภาพปก
   the-bed ที่ jek ทัก 21/8/26 เป็นแบบนั้นทั้งที่ตั้ง settle ไว้ 4.5 วิแล้ว —
   การจูนเป็นวินาทีรายหน้าคือการเดา ซึ่งจะพังอีกเมื่อหน้าเปลี่ยน)
   getAnimations() บอกสถานะจริงของทั้ง CSS animation/transition และ WAAPI */
async function settleAnimations(page, cap = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < cap) {
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === "running"
        && (a.effect && a.effect.getTiming().iterations !== Infinity)).length);
    if (!running) return;
    await page.waitForTimeout(250);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const dir = mkdtempSync(join(tmpdir(), "pages-"));

for (const name of list) {
  /* เดโมหลายหน้า (แพ็ก ฿7,500) เขียนเป็นลิสต์ของหน้าแทนพาธเดียว: ภาพชุดของมันต้องเป็น
     "คนละหน้า" ไม่ใช่ "คนละช่วงของหน้าเดียว" เพราะสิ่งที่การ์ดต้องขายคือเว็บนี้มีหลายหน้าจริง
     ถ้าถ่ายแบบเดิมจะได้หน้าแรกสามช่วง ซึ่งดูไม่ต่างจากการ์ดแพ็ก ฿3,500 เลยสักนิด
     ทุกอย่างหลังจากจุดนี้ใช้กลไกเดิมทั้งหมด (ขนาด · คุณภาพ · ชื่อไฟล์ · รูปย่อ) */
  const multi = Array.isArray(SHOTS[name]);
  const srcs = (multi ? SHOTS[name] : [SHOTS[name]]).map((r) => join(ROOT, r));
  const gone = srcs.find((s) => !existsSync(s));
  if (gone) { console.error(`✗ ${name}: หา ${gone} ไม่เจอ`); process.exitCode = 1; continue; }

  let shot = 0; const note = [];
  for (const src of srcs) {
  const page = await ctx.newPage();
  /* ?reduce=1 = test hook ใน js/main.js ของเดโม: เผยทุก .reveal ทันทีโดยไม่ต้องรอ
     ให้มันเลื่อนผ่านตา — ไม่งั้นภาพช่วงกลางกับช่วงล่างจะได้กล่องเปล่า */
  await page.goto("file://" + src + "?reduce=1", { waitUntil: "load" });
  // อุ่นแคชฟอนต์แล้วโหลดซ้ำ ด้วยเหตุผลเดียวกับ shoot-cover.mjs (display=optional)
  await page.evaluate(() => document.fonts.ready);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);
  if (PREP[name]) { await PREP[name](page); await page.waitForTimeout(1200); }
  await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" });

  const travel = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  /* บน = 0 · กลาง = ครึ่งทาง · ล่าง = สุดหน้า  ไม่ใช่ตำแหน่งที่เลือกด้วยตา
     เพราะตำแหน่งที่เลือกด้วยตาจะไม่ตรงกันระหว่างใบ และซ้ำไม่ได้เมื่อหน้าเปลี่ยน */
  /* กลับมาสามใบต่อหน้า (21/8/26 ตามที่ jek สั่ง) — เมื่อชั่วโมงก่อนเพิ่งขยายเป็นแปด
     เพราะ "หน้ายาวขึ้นแล้ว" ซึ่งจริง แต่ผลที่ได้คือหน้าต่างหนึ่งบานมีเก้าหน้าให้กด
     แล้วคลิป (ซึ่งเป็นของที่ควรดูที่สุด เพราะมันเลื่อนทั้งหน้าให้ดูอยู่แล้ว) กลายเป็น
     หนึ่งในเก้า ไม่ใช่พระเอก สามใบ = บน / กลาง / ล่าง พอจะบอกว่า "หน้ายาวและมีของ"
     โดยไม่แย่งความสนใจจากคลิป
     หมายเหตุ: กติกานี้ใช้กับ "เว็บ" ที่มีคลิป — การ์ดแอป (Ijek/ScoreUp) ไม่มีคลิป
     ภาพจึงเป็นของเดียวที่มี และยังเก็บครบตามความยาวหน้าเหมือนเดิม (ดู _shot-app) */
  /* ใบกลางไม่หยุดที่ "ครึ่งหนึ่งของหน้า" ดิบๆ อีกแล้ว (21/8/26 jek: บางใบเหมือน
     ถ่ายไม่ตั้งใจ — เนื้อหาเหลื่อมกับแถบเมนูที่ลอยอยู่ บางใบได้พื้นที่ว่างครึ่งใบ)
     ครึ่งทางของหน้าเว็บมักตกกลางย่อหน้าหรือกลางที่ว่างระหว่างเซ็กชัน ภาพที่ได้จึง
     อ่านไม่ออกว่าเป็นส่วนไหนของหน้า — เลื่อนไปเกาะ "หัวเซ็กชันที่ใกล้ครึ่งทางที่สุด"
     แทน แล้วเผื่อความสูงของแถบเมนูที่ตรึงอยู่ (sticky/fixed) ไม่ให้มันทับหัวข้อ
     ของเซ็กชันนั้น เกณฑ์ ±35% ของจอ: ไกลกว่านั้นแปลว่าไม่มีเซ็กชันไหนอยู่แถวนั้นจริง
     ก็ใช้ครึ่งทางดิบตามเดิม */
  /* หาที่หยุดที่ "เป็นหัวเซ็กชัน" ให้ทั้งใบกลางและใบท้าย — ใบท้ายเดิมหยุดที่ก้น
     หน้าเป๊ะๆ (travel) ซึ่งมักได้ท้ายลิสต์กับฟุตเตอร์ ครึ่งใบเป็นที่ว่าง
     (velvet-leaf: หางเมนูเครื่องดื่ม — jek ทัก 21/8/26) ใบท้ายจึงเล็งที่ 85% ของ
     ความยาวหน้าแล้วเกาะหัวเซ็กชันที่ใกล้ที่สุดเหมือนใบกลาง */
  const snapTo = (target) => page.evaluate((mid) => {
    const vh = window.innerHeight;
    /* วัดแถบที่ตรึงอยู่จริงจาก DOM ทั้งหน้า ไม่ใช่เดาจากชื่อแท็ก/คลาส: เดโมแต่ละ
       ใบตั้งชื่อแถบบนไม่เหมือนกัน (header, .topbar, div เปล่าๆ) พอเดาผิดค่าที่ได้
       เป็น 0 แล้วหัวข้อของเซ็กชันก็ไปนอนอยู่ใต้แถบ (the-bed: "QUIET ROOMS." โดน
       เฉือนครึ่งบรรทัด) เอาทุก element ที่ position เป็น fixed/sticky และเกาะอยู่
       ครึ่งบนของจอ แล้วใช้ขอบล่างที่ต่ำสุดเป็นความสูงจริงของแถบ */
    const stickyH = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const c = getComputedStyle(e);
        if (!["fixed", "sticky"].includes(c.position) || c.visibility === "hidden") return false;
        const r = e.getBoundingClientRect();
        return r.top <= vh * 0.25 && r.height > 24 && r.width > window.innerWidth * 0.5;
      })
      .reduce((h, e) => Math.max(h, e.getBoundingClientRect().bottom), 0);
    /* หัวเซ็กชันจริงๆ ของหน้าเว็บงานเรามาได้หลายทรง — <section>, กล่องลูกของ <main>,
       หรืออย่างน้อยก็หัวข้อ h2 ที่ขึ้นต้นบล็อกใหม่ เก็บมาให้ครบก่อนค่อยเลือก */
    const tops = [...document.querySelectorAll("section, [data-section], main > div, h2")]
      .map((e) => e.getBoundingClientRect().top + window.scrollY)
      .filter((t) => t > vh * 0.25);
    if (!tops.length) return null;
    const near = tops.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
    /* เกาะหัวเซ็กชันที่ใกล้เป้าที่สุดเสมอ ไม่ตั้งเพดานระยะ: หน้ายาว 9,000px ที่มี
       เซ็กชันละ 1,500px จะไม่มีหัวไหนอยู่ใกล้เป้าในระยะ 35% ของจอเลย แล้วมันก็ตก
       กลับไปหยุดกลางย่อหน้าเหมือนเดิม — ซึ่งคือบั๊กที่กำลังแก้อยู่ */
    return Math.round(Math.max(0, near - stickyH - 24));   /* เผื่อที่หายใจใต้แถบอีก 24px */
  }, target);

  const mid = (await snapTo(Math.round(travel / 2))) ?? Math.round(travel / 2);
  let last = (await snapTo(Math.round(travel * 0.85))) ?? travel;
  // ใบท้ายต้องไม่ไปทับใบกลาง (หน้าที่เซ็กชันห่างกันมากอาจเกาะหัวเดียวกันทั้งคู่)
  if (last <= mid + 200) last = travel;

  const stops = multi ? [0] : (travel <= 0 ? [0] : [0, mid, last]);

  for (let i = 0; i < stops.length; i++) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), stops[i]);
    /* 1200 ไม่ใช่ 700 และรอรูปที่ยัง lazy อยู่ให้มาถึงก่อนกดชัตเตอร์ — ภาพที่
       jek ทักว่า "เหมือนถ่ายไม่ตั้งใจ" บางใบคือรูปที่ยังโหลดไม่เสร็จตอนถ่าย */
    await page.waitForTimeout(1200);
    await page.evaluate(() => Promise.all([...document.images]
      .filter((im) => !im.complete)
      .map((im) => new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 2500); }))));
    await settleAnimations(page);
    const n = ++shot;
    const png = join(dir, `${name}-${n}.png`);
    await page.screenshot({ path: png });
    const out = join(ROOT, "assets/work/pages", `${name}-${n}.webp`);
    execFileSync("cwebp", ["-quiet", "-q", String(QUALITY), "-resize", String(OUT_W), "0", png, "-o", out]);
    const thumb = join(ROOT, "assets/work/pages", `${name}-${n}-t.webp`);
    execFileSync("cwebp", ["-quiet", "-q", String(THUMB_Q), "-resize", String(THUMB_W), "0", png, "-o", thumb]);
  }
  await page.close();
  note.push(multi ? src.slice(ROOT.length + 1) : `${stops.length} ช่วง (${stops.join(", ")})`);
  }
  console.log(`${name} → ${shot} ใบ · ${note.join(" · ")}`);
}

rmSync(dir, { recursive: true, force: true });
await browser.close();
