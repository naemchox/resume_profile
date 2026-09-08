#!/usr/bin/env node
/* =============================================================================
   visual.mjs — ด่าน "หน้าเว็บแสดงผลเพี้ยนไหม" (22/8/26)
   ใช้:  node playbook/visual.mjs              # เทียบภาพ working tree กับเว็บจริง
        node playbook/visual.mjs --base HEAD   # เทียบกับ commit แทนเว็บจริง
        node playbook/visual.mjs index.html    # เฉพาะบางหน้า
        node playbook/visual.mjs --mobile      # เทียบที่ 390px ด้วย

   ทำไมต้องมี ทั้งที่มี regress.mjs แล้ว
   regress.mjs อ่าน DOM — จับ "ของหาย" ได้ แต่จับ "ของอยู่ครบแต่หน้าตาเพี้ยน" ไม่ได้
   22/8/26 ของพังสองชิ้นที่ jek จับได้ด้วยตาเปล่าเป็นชนิดนี้ทั้งคู่: โลโก้ไข่ดาวกลาย
   เป็นก้อนดำ (CSS ไม่ข้าม shadow tree ของ <use>) กับป้ายในฮีโร่ที่หายตอนชี้การ์ด
   DOM ถูกต้องทั้งสองเคส ด่านทุกตัวจึงขึ้นเขียว

   ทำไมไม่วัดทั้งหน้าเป็นคะแนนเดียว (ฉบับแรกของไฟล์นี้ทำแบบนั้นแล้วพลาด)
   ฉบับแรกวัด SSIM ทั้งหน้า แล้วเอาบั๊กโลโก้ของจริงกลับมาวางทดสอบ — ด่านขึ้น "ผ่าน"
   เพราะโลโก้ 36x36 px อยู่ในหน้าสูงหมื่นพิกเซล ค่าเฉลี่ยกลืนมันหายไปหมด
   ของที่พังจริงมักเล็กและอยู่จุดเดียว ตัววัดที่เฉลี่ยทั้งหน้าจึงตรวจไม่เจอตลอดกาล
   ฉบับนี้หั่นหน้าเป็นแถบสูง 100px แล้วนับ "สัดส่วนพิกเซลที่เปลี่ยน" ทีละแถบ

   ทำไมต้องวัดความสั่นของหน้าเองก่อน — และวัดทั้งสองฝั่ง
   หน้านี้มีรีลหมุน มีคลิปเล่นวน มีสไลด์โชว์ ถ้าตั้งเกณฑ์ตายตัวจะฟ้องทุกครั้งจนคนเลิกอ่าน
   ตัวนี้จึงถ่ายซ้ำสองครั้ง "ทั้งฝั่งเดิมและฝั่งใหม่" แล้วเอาค่าที่สั่นมากกว่าเป็นพื้นของแถบนั้น
   รอบแรกวัดพื้นจากฝั่งเดิมอย่างเดียว ผลคือฟ้องผิดทันที 4 หน้า: สไลด์โชว์ของ summit
   กับรางวิ่งในหน้าแรกอยู่คนละจังหวะระหว่างไฟล์ในเครื่องกับเว็บจริง (คนละความหน่วง
   ในการโหลด) ฝั่งเดิมถ่ายติดกันสองช็อตเลยนิ่ง = พื้น 0% ทั้งที่ของจริงไม่นิ่งเลย

   วัดด้วย ffmpeg (ffmpeg-static เป็น dependency อยู่แล้วจาก shoot-reel) แปลงภาพส่วนต่าง
   เป็น rawvideo สีเทาแล้วอ่านไบต์ตรงๆ ไม่ต้องลงไลบรารีถอด PNG เพิ่ม
   ========================================================================== */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const MOBILE = argv.includes("--mobile");
const BASE_REF = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : null;
const ONLY = argv.filter((a) => !a.startsWith("--") && a !== BASE_REF);
const LIVE_ORIGIN = "https://tarmsung.pages.dev";
const OUT = join(tmpdir(), "tarmsung-visual");

const BAND = 100;      // สูงของแถบที่หั่นเทียบ — เล็กพอให้ของขนาดโลโก้ยังเป็นสัดส่วนที่เห็น
const LEVEL = 24;      // ต่างเกินนี้ (0-255) ถึงนับว่า "พิกเซลนี้เปลี่ยน" กันเรื่องบีบอัด/แอนตี้เอเลียส
/* 24/8/69 ยกจาก 0.004 เป็น 0.008 — ไม่ใช่เพราะอยากผ่อนเกณฑ์ แต่เพราะความหมายของมันเปลี่ยน
   ตอนตั้ง 0.004 ค่าพื้นของแถบอยู่ที่ 5-12% (มีของขยับเองในหน้า) เลขนี้จึงเป็นแค่ตัวคัดขั้นต้น
   ตัวตัดสินจริงคือ "มากกว่าพื้น 1.6 เท่า" พอ .shot-page ถูกหยุดตอนถ่าย (แก้ 23/8/69)
   ค่าพื้นลงมาเหลือ 0.0% ทุกแถบ เงื่อนไข "มากกว่าพื้น" จึงจริงเสมอ และ MIN_FRAC กลายเป็น
   ด่านทั้งด่านโดยที่ไม่มีใครตั้งใจ ผลคือฟ้องความต่าง 0.4-0.8% สามรอบติดจนต้องใส่
   --allow-visual ทับ ซึ่งเป็นทางที่ด่านจะตาย
   0.008 ยังต่ำกว่าของเล็กสุดที่ไฟล์นี้บอกว่าต้องจับให้ได้ (โลโก้ 36px = ~0.9%) */
const MIN_FRAC = 0.008;
const OVER = 1.6;        // และต้องมากกว่าพื้นของแถบตัวเองเท่านี้เท่า จึงเรียกว่าเพี้ยน

const pages = () => {
  if (ONLY.length) return ONLY;
  /* ค่าเริ่มต้นเทียบเฉพาะหน้าหลัก 4 ใบ เพราะเป็นหน้าที่ลูกค้าเห็นก่อนตัดสินใจ และเทียบ
     ครบ 18 หน้าใช้เวลา 5 นาทีครึ่ง — ด่านที่ช้าจนคนขี้เกียจรันคือด่านที่ไม่มีอยู่จริง
     เดโมทั้งชุดเรียกด้วย --all ตอนที่แตะของในนั้น */
  const top = ["index.html", "reference.html", "privacy.html", "404.html"].filter((f) => existsSync(join(ROOT, f)));
  const demos = readdirSync(join(ROOT, "work"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, "work", d.name, "index.html")))
    .map((d) => `work/${d.name}/index.html`);
  return argv.includes("--all") ? [...top, ...demos] : top;
};

/* หยุดทุกอย่างที่หยุดได้ก่อนถ่าย ส่วนที่หยุดไม่ได้ (รีลที่วาดด้วย rAF) ปล่อยให้ไปโผล่
   ในค่าพื้นแทน ดีกว่าซ่อนทิ้ง — บริเวณที่ซ่อนคือบริเวณที่ด่านนี้ตาบอดถาวร */
const FREEZE = `*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }
                video { visibility: hidden !important; }
                /* 23/8/26 — .shot-page คือภาพซ้อนชนิดเดียวกับคลิปพรีวิว แต่พลิกเฟรมด้วย
                   setInterval ไม่ใช่ด้วย <video> บรรทัดบนจึงไม่โดน ผลคือด่านนี้ฟ้อง
                   reference.html แบบสุ่ม: รันสามรอบติดโดยไม่แตะโค้ดเลย ได้แถบที่เปลี่ยน
                   คนละชุดทุกรอบ (3100-3300 / 4100-4300 / ผ่านเฉยๆ) ด่านที่ผลไม่ซ้ำเดิม
                   จะจบลงที่คนใส่ --allow-visual ทุกครั้งจนด่านตายทั้งตัว
                   ซ่อนแค่ภาพซ้อน ภาพนิ่งใต้การ์ดยังถูกเทียบตามปกติ — ที่เสียไปคือ
                   ด่านนี้จะไม่เห็นพรีวิวตอน hover ซึ่งเป็นราคาเดียวกับที่จ่ายให้ video
                   อยู่แล้วตั้งแต่แรก ของชนิดเดียวกันต้องใช้กลไกเดียวกัน */
                .shot-page, .shot-reel { display: none !important; }`;

const shot = async (browser, url, file, width) => {
  const p = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
  try {
    await p.goto(url, { waitUntil: "load", timeout: 40000 });
    await p.addStyleTag({ content: FREEZE });
    await p.evaluate(async () => {
      document.querySelectorAll("img[loading=lazy]").forEach((i) => (i.loading = "eager"));
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 900) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      scrollTo(0, 0);
      document.querySelectorAll(".reveal, .is-locked").forEach((e) => e.classList.add("in"));
      document.querySelectorAll(".queue-num").forEach((e) => (e.textContent = "000"));  // เลขคิวเดินเอง ตรึงให้เท่ากันสองฝั่ง
      await (document.fonts ? document.fonts.ready : Promise.resolve());
      /* รอ "รูปโหลดครบ" ไม่ใช่แค่รอเวลา — รอบแรกฟ้อง reference.html บ้างไม่ฟ้องบ้าง
         เพราะบางช็อตถ่ายตอนการ์ดยังเป็นช่องขาว ด่านที่ผลไม่ซ้ำเดิมคือด่านที่เชื่อไม่ได้
         (จับเวลาไว้ 8 วิ เพื่อไม่ให้รูปเสียใบเดียวค้างทั้งด่าน) */
      await Promise.race([
        Promise.all([...document.images].map((i) => i.complete && i.naturalWidth
          ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))),
        new Promise((r) => setTimeout(r, 8000)),
      ]);
    });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: file, fullPage: true });
    return true;
  } catch { return false; } finally { await p.close(); }
};

const pngSize = (f) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

/* สัดส่วนพิกเซลที่เปลี่ยน แยกทีละแถบ — ffmpeg คายภาพส่วนต่างเป็นไบต์สีเทาออก stdout
   แล้วนับใน JS ไม่ต้องเขียนไฟล์กลาง และไม่ต้องมีตัวถอด PNG */
const bandDiff = (a, b) => {
  const A = pngSize(a), B = pngSize(b);
  const w = Math.min(A.w, B.w), h = Math.min(A.h, B.h);
  const raw = execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", a, "-i", b,
    "-filter_complex", `[0:v]crop=${w}:${h}:0:0,format=gray[a];[1:v]crop=${w}:${h}:0:0,format=gray[b];[a][b]blend=all_mode=difference`,
    "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
  const bands = [];
  for (let y0 = 0; y0 < h; y0 += BAND) {
    const y1 = Math.min(y0 + BAND, h);
    let changed = 0;
    for (let y = y0; y < y1; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) if (raw[row + x] > LEVEL) changed++;
    }
    bands.push({ y0, frac: changed / ((y1 - y0) * w) });
  }
  return { bands, hA: A.h, hB: B.h };
};

const diffImage = (a, b, out) => {
  const A = pngSize(a), B = pngSize(b);
  const w = Math.min(A.w, B.w), h = Math.min(A.h, B.h);
  execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-i", a, "-i", b,
    "-filter_complex", `[0:v]crop=${w}:${h}:0:0[a];[1:v]crop=${w}:${h}:0:0[b];[a][b]blend=all_mode=difference,eq=brightness=0.25:saturation=3`,
    out], { stdio: "ignore" });
};

/* ---- สถานะ "ก่อน" -------------------------------------------------------- */
let baseDir = null, baseLabel = `เว็บจริง ${LIVE_ORIGIN}`;
if (BASE_REF) {
  baseDir = mkdtempSync(join(tmpdir(), "tarmsung-vbase-"));
  execFileSync("bash", ["-c", `git -C ${JSON.stringify(ROOT)} archive ${JSON.stringify(BASE_REF)} | tar -x -C ${JSON.stringify(baseDir)}`]);
  baseLabel = `${BASE_REF} (${execFileSync("git", ["-C", ROOT, "rev-parse", "--short", BASE_REF]).toString().trim()})`;
}
const urlOf = (page, side) =>
  side === "now" ? pathToFileURL(join(ROOT, page)).href
  : baseDir ? pathToFileURL(join(baseDir, page)).href
  : `${LIVE_ORIGIN}/${page.replace(/index\.html$/, "")}`;

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

/* Cloudflare Pages เสิร์ฟหน้าแรกให้ทุก path ที่ไม่มีไฟล์ (ไม่ใช่ 404) เดโมที่ถอดออกจาก
   เว็บแล้วอย่าง parcela จึงถูกเทียบกับ "หน้าแรก" แล้วต่างกันทั้งหน้า — วัดจากส่วนสูง
   ไม่พอ (ต่างกันแค่ 23% ก็รอดตะแกรงมาแล้ว) ต้องเทียบกับภาพหน้าแรกจริงๆ */
let homeShot = null;
if (!baseDir) {
  homeShot = join(OUT, "live-home.png");
  if (!(await shot(browser, `${LIVE_ORIGIN}/`, homeShot, 1440))) homeShot = null;
}
const isLiveFallback = (page, baseFile, width) => {
  if (!homeShot || width !== 1440 || page === "index.html") return false;   // หน้าแรกย่อมเหมือนหน้าแรก
  const d = bandDiff(baseFile, homeShot);
  const changed = d.bands.reduce((n, b) => n + b.frac, 0) / d.bands.length;
  return changed < 0.01 && Math.abs(d.hA - d.hB) < 40;    // เหมือนหน้าแรกเกือบทั้งหน้า = ไม่ใช่หน้าของตัวเอง
};
const widths = MOBILE ? [1440, 390] : [1440];
const bad = [], skipped = [];
let checked = 0;

for (const page of pages()) {
  if (baseDir && !existsSync(join(baseDir, page))) { skipped.push(`${page} (หน้าใหม่)`); continue; }
  for (const width of widths) {
    const tag = `${page.replace(/[\/\.]/g, "_")}-${width}`;
    const a1 = join(OUT, `${tag}-base1.png`), a2 = join(OUT, `${tag}-base2.png`);
    const b = join(OUT, `${tag}-now.png`), b2 = join(OUT, `${tag}-now2.png`);
    if (!(await shot(browser, urlOf(page, "base"), a1, width))) { skipped.push(`${page} (เปิดของเดิมไม่ได้)`); continue; }
    if (!(await shot(browser, urlOf(page, "base"), a2, width))) { skipped.push(`${page} (เปิดของเดิมไม่ได้)`); continue; }
    if (!(await shot(browser, urlOf(page, "now"), b, width))) { bad.push({ page, width, why: "เปิดหน้าใหม่ไม่ได้เลย" }); continue; }
    if (!(await shot(browser, urlOf(page, "now"), b2, width))) { bad.push({ page, width, why: "เปิดหน้าใหม่ไม่ได้เลย" }); continue; }

    if (isLiveFallback(page, a1, width)) { skipped.push(`${page} (ยังไม่ได้อยู่บนเว็บจริง — เว็บตอบเป็นหน้าแรก)`); continue; }
    const floorBase = bandDiff(a1, a2);        // แถบไหนของฝั่งเดิมขยับเองบ้าง
    const floorNow = bandDiff(b, b2);          // แถบไหนของฝั่งใหม่ขยับเองบ้าง
    const now = bandDiff(a1, b);
    const heightGap = Math.abs(now.hA - now.hB) / Math.max(now.hA, now.hB);
    checked++;

    /* พื้นของแถบ = ความสั่นที่มากกว่าของสองฝั่ง ของที่ขยับเองฝั่งไหนก็ตาม ไม่ใช่ความพัง */
    const hits = now.bands.map((band, i) => ({ band,
        floor: Math.max(floorBase.bands[i] ? floorBase.bands[i].frac : 0,
                        floorNow.bands[i] ? floorNow.bands[i].frac : 0) }))
      .filter(({ band, floor: f }) => band.frac >= MIN_FRAC && band.frac > Math.max(f * OVER, MIN_FRAC))
      .sort((x, y) => y.band.frac - x.band.frac);
    if (hits.length) {
      const dif = join(OUT, `${tag}-DIFF.png`);
      diffImage(a1, b, dif);
      const top = hits.slice(0, 3).map(({ band, floor: f }) =>
        `y=${band.y0}-${band.y0 + BAND}px เปลี่ยน ${(band.frac * 100).toFixed(1)}% (พื้นแถบนี้ ${(f * 100).toFixed(1)}%)`);
      bad.push({ page, width, dif,
        why: `${hits.length} แถบเปลี่ยนเกินปกติ — ${top.join(" · ")}`
           + (heightGap > 0.02 ? ` · ความสูงหน้า ${now.hA} → ${now.hB}px` : "") });
    }
  }
}
await browser.close();
if (baseDir) rmSync(baseDir, { recursive: true, force: true });

if (skipped.length) console.log(`ข้าม ${skipped.length} หน้า — ${skipped.slice(0, 3).join(" · ")}${skipped.length > 3 ? " …" : ""}`);
if (!bad.length) { console.log(`✅ ภาพหน้าเว็บไม่เพี้ยน — เทียบ ${checked} หน้ากับ ${baseLabel}`); process.exit(0); }
console.log(`❌ หน้าตาเปลี่ยนเกินปกติ ${bad.length} จุด (เทียบกับ ${baseLabel}) — เปิดภาพส่วนต่างดูก่อนปล่อย`);
for (const x of bad) console.log(`\n── ${x.page} @${x.width}px\n   ${x.why}${x.dif ? `\n   ภาพส่วนต่าง: ${x.dif}` : ""}`);
process.exit(1);
