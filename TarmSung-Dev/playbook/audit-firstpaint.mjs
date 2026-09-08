#!/usr/bin/env node
/* =============================================================================
   audit-firstpaint.mjs — ด่าน "รีเฟรชแล้วกระตุกไหม" (25/8/26)
   ใช้:  node playbook/audit-firstpaint.mjs                  # ไล่ work/ ทั้งหมด บน WebKit
        node playbook/audit-firstpaint.mjs the-bed the-terrace
        node playbook/audit-firstpaint.mjs --engine=chromium
        node playbook/audit-firstpaint.mjs --cold            # วัดรอบโหลดแรกแทนรอบรีเฟรช

   ---------------------------------------------------------------------------
   ทำไมต้องมีไฟล์นี้ ทั้งที่มี audit-motion / audit-scroll / visual แล้ว

   25/8/26 เจ้าของฟ้องอาการกระตุก 5 อย่าง **ทุกอย่างผ่านด่านที่มีอยู่หมด**:
     1 รูปฮีโร่เป็น background-image → มาช้าจนต้องเอา LQIP เบลอมาคั่น = เบลอ→ชัด ทุกรีเฟรช
     2 font-display:optional → ผลไม่เหมือนกันในแต่ละรีเฟรช
     3 หัวข้อหั่นเป็นคำในกล่องที่ขนาดเปลี่ยนตามฟอนต์
     4 JS รอ fonts.ready ถึง 900ms แล้วโผล่พรวด
     5 ตัวเลขนับ 0→480 ทำให้ความกว้างโตทุกเฟรม ทั้งบรรทัดถูกจัดใหม่ ~60 ครั้ง/วินาที

   ทำไมด่านเดิมจับไม่ได้ — สามข้อ และทั้งสามเป็นเรื่องโครงสร้าง ไม่ใช่ "ลืมเขียน rule"
     ก. **ผิดเบราว์เซอร์** — audit ทุกตัวใน playbook/ import chromium (เช็คได้ด้วย
        `grep -l chromium playbook/audit-*.mjs` = ครบทุกไฟล์ · webkit = 0 ไฟล์)
        เจ้าของเทสบน Safari ซึ่งได้ไฟล์ฟอนต์คนละไฟล์ ตีความ display:optional คนละแบบ
        ไฟล์นี้จึงรัน **WebKit เป็นค่าเริ่มต้น** ไม่ใช่ทางเลือก
     ข. **ตัววัดที่ใช้มองไม่เห็นอาการชนิดนี้** — CLS จับ "เบลอ→ชัด" ไม่ได้ตลอดกาล
        เพราะไม่มีอะไรเลื่อนตำแหน่ง เปลี่ยนแค่ความคมชัด เลขจึงเขียวตลอดทั้งที่ตาเห็นว่าพัง
     ค. **ด่านเดิมเป็นตัวตรวจกฎ ไม่ใช่ตัวตรวจอาการ** — audit-motion เขียนไว้เองว่า
        "ดูจากสาเหตุ ไม่ใช่รอให้เห็นเฟรมตก" ซึ่งแปลว่า *มันหาได้เฉพาะสาเหตุที่เรารู้จักแล้ว*
        บั๊กทั้ง 5 ข้อข้างบนไม่มีข้อไหนอยู่ในลิสต์สาเหตุที่เคยเขียนไว้ — โดยนิยามมันจึงหาไม่เจอ

   ไฟล์นี้จึงไม่ถามว่า "โค้ดผิดกฎข้อไหน" แต่ถาม **คุณสมบัติที่ต้องจริงเสมอ** 2 ข้อ
   ซึ่งไม่ต้องรู้สาเหตุล่วงหน้า = จับของที่เรายังไม่เคยเจอได้ด้วย

   ---------------------------------------------------------------------------
   ด่าน 1 — ปิดอนิเมชันแล้วหน้าต้องนิ่ง
     เปิดหน้าด้วย prefers-reduced-motion: reduce ซึ่งดับการเคลื่อนไหว "ที่ตั้งใจ" ทิ้งหมด
     ถ่ายภาพเป็นระยะตั้งแต่เฟรมแรกถึง 3.5 วิ แล้วเทียบทุกใบกับใบสุดท้าย
     **อะไรก็ตามที่ยังเปลี่ยน = ของที่ไม่ได้ตั้งใจ** — รูปมาช้า ฟอนต์สลับ เลย์เอาต์กระโดด
     LQIP เบลอ→ชัด เข้าข่ายหมดโดยไม่ต้องเขียนกฎแยกให้สักข้อ
     นี่คือกลไกที่จับข้อ 1-4 ได้ทั้งชุดด้วยกฎเดียว

   ด่าน 2 — ของที่ไม่ได้เล่นอนิเมชัน ห้ามขยับ
     เปิดหน้าแบบปกติ (อนิเมชันทำงาน) แล้วเก็บ offsetLeft/Top/Width/Height ของทุกอีลิเมนต์
     ที่มีตัวหนังสือ ทุกเฟรมเป็นเวลา 3.5 วิ
     ใช้ offset* ไม่ใช่ getBoundingClientRect ตั้งใจ: อนิเมชันที่ทำถูกวิธีเล่นบน transform
     ซึ่ง **ไม่แตะ offset*** เลย ค่าที่ขยับจึงแปลว่ามีการจัดเลย์เอาต์ใหม่จริง = กระตุกจริง
     นี่คือกลไกที่จับข้อ 5 ได้ และจับ "ของอื่นที่ทำแบบเดียวกัน" ได้ด้วยโดยไม่ต้องรู้ว่ามันคืออะไร

   วัดรอบ **รีเฟรช** เป็นค่าเริ่มต้น (โหลดหนึ่งรอบให้แคชอุ่นก่อน แล้วค่อย reload แล้ววัด)
   เพราะอาการที่ถูกฟ้องคือ "ตอน refresh" ไม่ใช่ตอนเปิดครั้งแรก · --cold เพื่อวัดอีกแบบ

   เทียบพิกเซลด้วย ffmpeg เหมือน visual.mjs (ffmpeg-static เป็น dependency อยู่แล้ว)
   และหั่นเป็นแถบเหมือนกัน ด้วยเหตุผลเดียวกับที่ visual.mjs เขียนไว้: ของที่พังจริงมักเล็ก
   ค่าเฉลี่ยทั้งหน้าจะกลืนมันหาย
   ========================================================================== */
import { webkit, chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes("--" + n);
const opt  = (n, d) => (argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split("=").pop();

const ENGINE = opt("engine", "webkit");
const COLD   = flag("cold");
const targets = argv.filter((a) => !a.startsWith("--"));

/* เกณฑ์ — ตั้งจากของจริงที่วัดได้ ไม่ใช่ตัวเลขกลมๆ
   BAND/LEVEL ยกมาจาก visual.mjs ตรงๆ เพื่อให้สองด่านพูดภาษาเดียวกัน */
const BAND = 80, LEVEL = 24;
const SETTLE_MS  = 400;   /* ปิดอนิเมชันแล้วหน้าต้องนิ่งภายในเท่านี้หลังเฟรมแรก */
const BAND_FRAC  = 0.02;  /* แถบไหนเปลี่ยนเกิน 2% ของพิกเซลในแถบ = เห็นด้วยตา */
const SHIFT_PX   = 1;     /* เก็บทุกอย่างที่ขยับตั้งแต่ 1px ขึ้นไป */
/* แต่ "ตก" เฉพาะที่ขยับตั้งแต่เท่านี้ — 25/8/26 วัดพื้นเสียงรบกวนจริงหลังแก้บั๊กหมดแล้ว
   ได้ 1-3px ทุกใบ ซึ่งมาจากการปัดเศษพิกเซลตอนอนิเมชันเข้าที่ ไม่ใช่การจัดเลย์เอาต์ใหม่
   ถ้าตั้งเกณฑ์ตกที่ 1px ด่านจะแดงตลอดกาลจนไม่มีใครอ่าน = ด่านที่ไม่มีใครอ่านคือด่านที่ไม่มี
   ที่ต่ำกว่าเกณฑ์ยังถูกพิมพ์ออกมาเป็น "เตือน" อยู่ ไม่ได้ซ่อน — SKIP ≠ PASS
   **ห้ามขยับเลขนี้เพื่อให้ของที่แก้ไม่ผ่านกลายเป็นผ่าน** ถ้าจะขยับต้องวัดพื้นใหม่ทั้งชุดก่อน */
const FAIL_PX    = 4;

/* ---- หน้าที่จะตรวจ -------------------------------------------------------- */
const WORK = readdirSync(join(ROOT, "work"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, "work", d.name, "index.html")))
  .map((d) => d.name).sort();
const sites = targets.length ? targets.map((t) => t.replace(/^work\//, "").replace(/\/$/, "")) : WORK;

/* ---- เสิร์ฟไฟล์เอง ไม่ต้องให้คนจำว่าต้องเปิดเซิร์ฟเวอร์ก่อน ---------------- */
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm" };
const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404).end(); return; }
  const f = existsSync(p) && readdirSync(dirname(p)).length && extname(p) ? p : join(p, "index.html");
  try {
    const body = readFileSync(f);
    res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream",
      /* แคชได้จริง — ด่านนี้วัด "รอบรีเฟรช" ถ้าห้ามแคชจะกลายเป็นวัดรอบโหลดแรกทุกครั้ง */
      "cache-control": "public, max-age=60" });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ---- เทียบพิกเซลทีละแถบ (ยกกลไกจาก visual.mjs) ---------------------------- */
const pngSize = (f) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const worstBand = (a, b) => {
  const A = pngSize(a), B = pngSize(b);
  const w = Math.min(A.w, B.w), h = Math.min(A.h, B.h);
  const raw = execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", a, "-i", b,
    "-filter_complex", `[0:v]crop=${w}:${h}:0:0,format=gray[a];[1:v]crop=${w}:${h}:0:0,format=gray[b];[a][b]blend=all_mode=difference`,
    "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
  let worst = 0, worstY = 0;
  for (let y0 = 0; y0 < h; y0 += BAND) {
    const y1 = Math.min(y0 + BAND, h);
    let changed = 0;
    for (let y = y0; y < y1; y++) { const row = y * w; for (let x = 0; x < w; x++) if (raw[row + x] > LEVEL) changed++; }
    const frac = changed / ((y1 - y0) * w);
    if (frac > worst) { worst = frac; worstY = y0; }
  }
  return { frac: worst, y: worstY };
};

/* ---- ด่าน 2: หัววัดที่ฝังในหน้า ------------------------------------------- */
/* รับค่าคงที่เป็น "อาร์กิวเมนต์" ห้ามอ้างตัวแปรระดับโมดูล
   page.evaluate ส่งไปแค่ตัวฟังก์ชัน ค่าคงที่ข้างนอกไม่ตามไปด้วย — อ้างเมื่อไหร่ได้
   ReferenceError ในหน้าเว็บ ซึ่งถ้ามันเกิดใน setTimeout จะไม่มีใครจับ promise
   ไม่มีวัน resolve แล้ว evaluate ค้างตลอดกาล (เสียเวลาไป ~15 นาทีกับเรื่องนี้ 25/8/26)
   audit-motion.mjs เขียนเตือนเรื่องนี้ไว้แล้วตั้งแต่ต้น ผมอ่านแล้วยังพลาดซ้ำ */
const layoutProbe = ({ ms, SHIFT_PX }) => new Promise((doneOuter) => {
  /* ---- เริ่มเก็บ "ค่าตั้งต้น" เมื่อไหร่ (แก้ 25/8/26) --------------------------
     รอบแรกเก็บที่วินาทีที่ 0 ทันทีที่ evaluate เข้ามา ซึ่งเป็นจังหวะที่ HTML ยังถูก parse
     อยู่และสไตล์ชีตยังมาไม่ครบ — สภาพตอนนั้นคือ "ตัวหนังสือกองกันดิบๆ" ไม่ใช่หน้าเว็บ
     วัดได้จริงบน the-terrace: ที่ 1ms ได้ hero=3826 body=48811 · ที่ 232ms ได้
     hero=611 body=9799 คนละโลกกัน
     พอเอาสภาพดิบมาเป็นฐานเทียบ ด่านจึงฟ้อง homecraft ว่า "ขยับ 794px ที่ 8ms"
     ซึ่ง **ไม่ใช่บั๊กของเว็บ เป็นบั๊กของเครื่องมือวัด** และผมเสียเวลาไล่ผีไปแล้วหนึ่งรอบ

     ตอนนี้รอ readyState พ้น "loading" ก่อน = DOM ถูก parse จบและสไตล์ชีตที่บล็อกอยู่
     ถูกใช้แล้ว จากนั้นรออีกหนึ่งเฟรมให้เบราว์เซอร์วาดจริงหนึ่งครั้ง แล้วค่อยเก็บฐาน

     ของที่ขยับ "ก่อน" จุดนี้ไม่ได้ถูกปล่อยผ่าน — ด่าน 1 (เทียบพิกเซลตั้งแต่ commit)
     เป็นคนดูช่วงนั้น สองด่านจึงแบ่งหน้าที่กันชัด ไม่ใช่มีรูตรงกลาง:
       ด่าน 1 = ตั้งแต่เริ่มโหลด ถึงหน้านิ่ง  (ดูพิกเซล)
       ด่าน 2 = ตั้งแต่หน้าถูกจัดเลย์เอาต์แล้ว (ดูตำแหน่ง) */
  const done = doneOuter;
  const begin = () => requestAnimationFrame(() => {
  /* ของที่ "ขยับได้โดยไม่ผิด" มีสองชนิด ต้องกันออกก่อน ไม่งั้นด่านจมบวกปลอมจนไม่มีใครอ่าน
     (รอบแรกไม่กัน แล้วได้ 290 จุดต่อหน้า ซึ่งเท่ากับไม่มีด่าน)

     1. ของที่ยึดกับจอ ไม่ใช่ยึดกับเอกสาร — position:fixed / sticky
        หัวเว็บ sticky พอเลื่อนลง 9,000px ตำแหน่งเทียบเอกสารของมันก็เปลี่ยน 9,000px
        ตามนิยาม นั่นคือหน้าที่ของมัน ไม่ใช่อาการกระตุก

     2. ของที่ประกาศไว้เองว่าจะเปลี่ยนขนาด — มี transition/animation บน
        width/height/inline-size/block-size (เช่น แถบดาว .rate > i ที่ไล่ width ตามคะแนน)
        DEMO-SPEC อนุญาตไว้ = เจตนา ไม่ใช่ของหลุด
        **ตัวมันเองเท่านั้นที่ได้รับยกเว้น ของที่ถูกมันดันไม่ได้รับ** — ถ้าการโตของมัน
        ไปดันของอื่น นั่นคืออาการที่ต้องฟ้อง */
  const anchored = (e) => { for (let n = e; n; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === "fixed" || p === "sticky") return true; } return false; };
  const SIZE = /\b(width|height|inline-size|block-size)\b/;
  const declaresResize = (e) => { const c = getComputedStyle(e); return SIZE.test(c.transitionProperty) || (c.animationName !== "none" && c.animationName !== ""); };

  const els = [...document.querySelectorAll("body *")].filter((e) => {
    if (!e.offsetParent && e !== document.body) return false;
    if (anchored(e) || declaresResize(e)) return false;
    return [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  }).slice(0, 250);

  /* วัดตำแหน่งเทียบ "ทั้งเอกสาร" ไม่ใช่เทียบ offsetParent ตรงๆ
     รอบแรกใช้ e.offsetTop เฉยๆ แล้วได้บวกปลอม 459px ทันที: พอคลาสไหนเปลี่ยน position
     ของอีลิเมนต์แม่ offsetParent ก็เปลี่ยนตัว ตัวเลขจึงกระโดดทั้งที่ตาไม่เห็นอะไรขยับเลย
     ไต่สาย offsetParent ขึ้นไปบวกกันเอง = ค่าเดียวกันเสมอไม่ว่าใครจะเป็น offsetParent
     และยังไม่โดน transform รบกวน (ต่างจาก getBoundingClientRect) ซึ่งเป็นเหตุผลที่
     เลือก offset* ตั้งแต่แรก — อนิเมชันที่ทำถูกวิธีเล่นบน transform ล้วน */
  const absPos = (e) => { let x = 0, y = 0; for (let n = e; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return [x, y]; };
  const snap = (e) => { const [x, y] = absPos(e); return [x, y, e.offsetWidth, e.offsetHeight]; };

  const first = new Map(els.map((e) => [e, snap(e)]));
  const moved = new Map();
  const t0 = performance.now();
  const tick = () => {
    for (const e of els) {
      const a = first.get(e), c = snap(e);
      const d = Math.max(...c.map((v, k) => Math.abs(v - a[k])));
      if (d < SHIFT_PX) continue;
      const prev = moved.get(e) || { d: 0 };
      if (d > prev.d) moved.set(e, { d, at: Math.round(performance.now() - t0), a, c });
    }
    /* setTimeout 50ms ไม่ใช่ rAF ทุกเฟรม — absPos ไต่สาย offsetParent = บังคับเบราว์เซอร์
       คำนวณเลย์เอาต์ใหม่ทุกครั้ง คูณ 250 ตัว คูณ 60 เฟรม/วินาที แล้วหน้าหน่วงจนวัดไม่ได้จริง
       (รอบแรกทำแบบนั้น ด่านรันไม่จบใน 5 นาที) 20 ครั้ง/วินาทีจับเลย์เอาต์กระโดดได้ครบอยู่แล้ว
       เพราะของที่เราหาคือ "ตำแหน่งเปลี่ยน" ไม่ใช่ "เปลี่ยนกี่เฟรม" */
    if (performance.now() - t0 < ms) setTimeout(tick, 50);
    /* เช็ค anchored อีกรอบ "ตอนจบ" ไม่ใช่ทุกเฟรม — หัวเว็บเปลี่ยนเป็น sticky กลางทางได้
       (main.js เติมคลาส .stuck เมื่อเลื่อนพ้นฮีโร่) ถ้าเช็คแค่ตอนเริ่มมันจะหลุดมาเป็นบวกปลอม
       แต่ถ้าเช็คทุกเฟรม = getComputedStyle 600 ตัว × 60 ครั้ง/วินาที หน้าค้างจนวัดอะไรไม่ได้
       (รอบแรกทำแบบนั้นแล้ว ด่านรันไม่จบใน 5 นาที) เช็คหัวท้ายพอ ตัดได้เท่ากันแต่ไม่หน่วง */
    else done([...moved.entries()].filter(([e]) => !anchored(e)).map(([e, v]) => ({
      el: e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") +
          (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""),
      txt: (e.textContent || "").trim().slice(0, 24),
      px: Math.round(v.d), at: v.at,
      from: v.a.join("/"), to: v.c.join("/"),
      counter: !!(e.matches("[data-count], .num") || e.querySelector("[data-count], .num")),
    })).sort((a, b) => b.px - a.px));
  };
    setTimeout(tick, 0);
  });
  /* ทั้งก้อนต้องอยู่ในฟังก์ชันเดียว ห้ามแยกเป็นฟังก์ชันระดับโมดูลแล้วเรียกกัน
     page.evaluate ส่งไปแค่ตัวฟังก์ชันนี้ตัวเดียว ตัวที่อยู่ข้างนอกไม่ตามไป
     (พลาดซ้ำรอบที่สองในไฟล์เดียวกัน — ดูคอมเมนต์เรื่อง SHIFT_PX ข้างบน) */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin, { once: true });
  else begin();
});

/* ---- เดิน --------------------------------------------------------------- */
const engine = ENGINE === "chromium" ? chromium : webkit;
const b = await engine.launch();
const shots = mkdtempSync(join(tmpdir(), "tarmsung-fp-"));
let bad = 0;
console.log(`ด่านรีเฟรช · เครื่องยนต์ ${ENGINE} · วัดรอบ ${COLD ? "โหลดแรก" : "รีเฟรช"} · ${sites.length} หน้า\n`);

for (const site of sites) {
  const url = `${BASE}/work/${site}/index.html`;
  const problems = [];
  const warnings = [];
  const t = Date.now(); const step = (m) => process.stdout.write(`   · ${m} (${((Date.now() - t) / 1000).toFixed(1)}s)\n`);

  /* ---- ด่าน 1 ---- */
  /* วัดสองรอบเสมอ ไม่ใช่เลือกอย่างใดอย่างหนึ่ง — สองรอบเจออาการคนละชนิด
     รอบเย็น (แคชว่าง)  = จับรูปมาช้า / LQIP เบลอ→ชัด / ฟอนต์สลับ
     รอบรีเฟรช (แคชอุ่น) = จับเลย์เอาต์กระโดด / สคริปต์ที่รอของแล้วโผล่พรวด
     รอบแรกที่เขียนวัดแต่รอบรีเฟรช แล้วด่านขึ้นเขียวให้โค้ดที่พังจริง เพราะพอแคชอุ่น
     รูปกับฟอนต์มาถึงตั้งแต่เฟรมแรก อาการที่ต้องจับจึงไม่เกิดในรอบนั้นเลย

     และต้องเริ่มถ่ายตั้งแต่ waitUntil:"commit" ห้ามรอ "load"
     รอบแรกรอ load ก่อนค่อยถ่าย = กว่ากล้องจะเปิด รูปโหลดจบไปแล้ว
     ของที่ต้องจับคือ "ระหว่างทาง" ไม่ใช่ "ปลายทาง" */
  const stability = async (label, cold) => {
    const ctx = await b.newContext({ reducedMotion: "reduce", viewport: { width: 1100, height: 700 } });
    const p = await ctx.newPage();
    try {
      if (!cold) await p.goto(url, { waitUntil: "load", timeout: 30000 });
      const nav = cold ? p.goto(url, { waitUntil: "commit", timeout: 30000 })
                       : p.reload({ waitUntil: "commit", timeout: 30000 });
      await nav;
      const frames = [];
      const t0 = Date.now();
      for (const _ of Array(8).keys()) {
        const f = join(shots, `${site}-${label}-${frames.length}.png`);
        await p.screenshot({ path: f });
        frames.push({ f, t: Date.now() - t0 });
        await p.waitForTimeout(170);
      }
      const final = frames.at(-1).f;
      let settle = null, wFrac = 0, wAt = 0, wY = 0;
      for (const fr of frames.slice(0, -1)) {
        const { frac, y } = worstBand(fr.f, final);
        if (frac > BAND_FRAC) { settle = fr.t; if (frac > wFrac) { wFrac = frac; wAt = fr.t; wY = y; } }
      }
      return { settle, wFrac, wAt, wY };
    } catch (e) { return { err: e.message.split("\n")[0] }; } finally { await ctx.close(); }
  };
  let settle = null;
  for (const [label, cold] of [["รอบเย็น", true], ["รอบรีเฟรช", false]]) {
    const r = await stability(label, cold); step(`ด่าน1 ${label}`);
    if (r.err) { problems.push(`${label} เปิดไม่ขึ้น: ${r.err}`); continue; }
    if (r.settle === null) { if (settle === null) settle = "เฟรมแรก"; continue; }
    settle = `${r.settle}ms`;
    if (r.settle > SETTLE_MS)
      problems.push(`${label}: ปิดอนิเมชันแล้วหน้ายังเปลี่ยนถึง ${r.settle}ms (เกิน ${SETTLE_MS}) · แถบที่เปลี่ยนมากสุด ${(r.wFrac * 100).toFixed(1)}% ที่ y≈${r.wY}px เมื่อ ${r.wAt}ms`);
  }

  /* ---- ด่าน 2 ---- */
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  /* error ในหน้าเว็บต้องดังออกมา ไม่ใช่เงียบแล้วด่านขึ้นเขียว (SKIP ≠ PASS) */
  p2.on("pageerror", (e) => problems.push("สคริปต์ในหน้าพัง: " + e.message.split("\n")[0]));
  let moves = [];
  try {
    await p2.goto(url, { waitUntil: "load", timeout: 30000 });
    if (!COLD) await p2.reload({ waitUntil: "commit", timeout: 30000 });
    /* ต้องเลื่อนระหว่างวัด — ของที่เล่นตอนเลื่อนถึง (ตัวเลขนับ, reveal) อยู่ใต้ขอบจอ
       ถ้าจอดอยู่บนสุด 3.5 วิ มันไม่เคยเริ่มวิ่ง ด่านจึงไม่มีอะไรให้จับ
       รอบแรกไม่เลื่อน แล้วด่านขึ้นเขียวให้บั๊กตัวเลขนับที่เจ้าของเห็นด้วยตาเปล่า
       offset* วัดเทียบเอกสาร การเลื่อนจอจึงไม่ทำให้ค่าขยับเอง */
    const probe = p2.evaluate(layoutProbe, { ms: 5200, SHIFT_PX });
    for (let k = 0; k < 10; k++) {
      await p2.evaluate((n) => scrollTo(0, (document.body.scrollHeight / 10) * n), k);
      await p2.waitForTimeout(400);
    }
    /* เพดานเวลาเสมอ — ถ้า probe ไม่คืนค่า ต้อง "ฟ้องว่าวัดไม่ได้" ไม่ใช่ค้างเงียบ */
    const got = await Promise.race([probe, new Promise((r) => setTimeout(() => r(null), 12000))]);
    if (got === null) problems.push("ด่าน 2 วัดไม่สำเร็จ (probe ไม่คืนค่าใน 12 วิ) — ยังไม่ได้ตรวจ ไม่ใช่ผ่าน");
    else moves = got.filter((m) => m.px >= SHIFT_PX);
    const hard = moves.filter((m) => m.px >= FAIL_PX);
    for (const m of (hard.length ? hard : []).slice(0, 4))
      problems.push(`เลย์เอาต์ขยับ ${m.px}px ที่ ${m.at}ms — ${m.el}${m.txt ? ` "${m.txt}"` : ""}${m.counter ? " (ตัวเลขนับ)" : ""}  [x/y/w/h ${m.from} → ${m.to}]`);
    if (hard.length > 4) problems.push(`…และอีก ${hard.length - 4} จุด`);
    const soft = moves.filter((m) => m.px < FAIL_PX);
    if (soft.length) warnings.push(`เตือน: มีของขยับ 1-${Math.max(...soft.map((m) => m.px))}px อีก ${soft.length} จุด (ต่ำกว่าเกณฑ์ตก ${FAIL_PX}px = ระดับปัดเศษ)`);
    step("ด่าน2");
  } catch (e) { problems.push("ด่าน 2 ล้ม: " + e.message.split("\n")[0]); }
  await ctx2.close();

  if (problems.length) { bad++; console.log(`❌ ${site}`); problems.forEach((x) => console.log(`     ${x}`)); }
  else console.log(`✅ ${site} — ปิดอนิเมชันแล้วนิ่งใน ${settle === null ? "เฟรมแรก" : settle} · ไม่มีเลย์เอาต์ขยับเกิน ${FAIL_PX}px`);
  warnings.forEach((x) => console.log(`     ${x}`));
}

await b.close();
server.close();
rmSync(shots, { recursive: true, force: true });
console.log(`\n${bad ? `❌ มีปัญหา ${bad}/${sites.length} หน้า` : `✅ ผ่านทั้ง ${sites.length} หน้า`}`);
process.exit(bad ? 1 : 0);
