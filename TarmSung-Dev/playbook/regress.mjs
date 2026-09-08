#!/usr/bin/env node
/* =============================================================================
   regress.mjs — ด่าน "ของหายจากมือคนแก้" (22/8/26)
   ใช้:  node playbook/regress.mjs           # เทียบ working tree กับ HEAD
        node playbook/regress.mjs --live     # เทียบกับเว็บจริงที่คนเห็นอยู่ตอนนี้
        node playbook/regress.mjs --base <ref>   # เทียบกับ commit ไหนก็ได้

   ทำไมต้องมีไฟล์นี้ ทั้งที่มี audit-code / audit-heads / check-demo-rules / deploy --dry แล้ว
   22/8/26 หน้าผลงานถูกแก้ค้างไว้กลางทาง การ์ด Ijek กับ ScoreUp ถูกตัดเหลือแต่กรอบ
   แล้ว commit ของอีกเซสชันกวาดขึ้นเว็บไปทั้งอย่างนั้น ด่านทุกตัวที่มีอยู่ "ผ่านหมด"
   เพราะทุกตัวถามคำถามเดียวกัน: หน้านี้ยังทำงานไหม · ยังไม่มี error ไหม · ยังตรงกฎไหม
   ไม่มีตัวไหนถามว่า "เมื่อวานหน้านี้มีอะไร แล้ววันนี้หายไปไหม" — หน้าที่เนื้อหาหาย
   ไปครึ่งหนึ่งยังตอบว่า "ทำงานปกติ" ได้เสมอ

   ด่านนี้จึงไม่ตรวจกฎอะไรเลย มันเทียบสองสถานะของเว็บเดียวกัน แล้วฟ้องเฉพาะ "ของที่
   เคยมีแล้วหายไป" (หัวข้อ · ลิงก์ · รูป · ตัวหนังสือรวม) ของที่เพิ่มเข้ามาไม่ฟ้อง
   เพราะการเพิ่มคือสิ่งที่ตั้งใจทำอยู่แล้ว ส่วนการหายคือสิ่งที่แทบไม่เคยตั้งใจ

   อ่านผลยังไง: ไม่ต้องอ่านทั้งหมด ถ้าไม่มีของหาย มันพิมพ์บรรทัดเดียวว่าผ่าน
   ที่พิมพ์ยาวคือรายการที่หายไปจริงเท่านั้น = อ่านเฉพาะตอนมีปัญหา
   ========================================================================== */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const LIVE = argv.includes("--live");
const BASE_REF = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "HEAD";
const LIVE_ORIGIN = "https://tarmsung.pages.dev";

/* หน้าที่เทียบ = หน้าหลักของเว็บ + เดโมทุกใบใน work/ (หน้าแรกของแต่ละใบเป็นตัวแทน)
   ลิสต์ถูกอ่านจากดิสก์ ไม่ใช่พิมพ์มือ — ลิสต์ที่พิมพ์มือคือลิสต์ที่ลืมเติมของใหม่
   (audit-mobile กับ check-demo-rules เคยตกหล่นเดโมไปใบสองใบด้วยเหตุนี้) */
const pages = () => {
  const top = ["index.html", "reference.html", "privacy.html", "404.html"].filter((f) => existsSync(join(ROOT, f)));
  const demos = readdirSync(join(ROOT, "work"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, "work", d.name, "index.html")))
    .map((d) => `work/${d.name}/index.html`);
  return [...top, ...demos];
};

/* ลายนิ้วมือของหน้า = ของที่ "คนอ่านเห็น" ไม่ใช่โครงสร้างภายใน
   เก็บเป็นชุดข้อความ ไม่ใช่จำนวน เพราะจำนวนเท่าเดิมแต่สลับของก็คือของหาย
   (การ์ดใบหนึ่งหาย อีกใบถูกใส่ซ้ำ = นับได้เท่าเดิมทั้งที่พัง) */
const fingerprint = () => {
  const vis = (el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed";
  const txt = (el) => el.textContent.replace(/\s+/g, " ").trim();
  const heads = [...document.querySelectorAll("h1, h2, h3")].filter(vis).map(txt).filter(Boolean);
  const links = [...document.querySelectorAll("a[href]")].filter(vis)
    .map((a) => a.getAttribute("href").split("?")[0]).filter((h) => h && !h.startsWith("#"));
  const imgs = [...document.querySelectorAll("img")].map((i) => (i.getAttribute("src") || "").split("?")[0]);
  return {
    heads, links: [...new Set(links)], imgs: [...new Set(imgs)],
    // ความยาวตัวหนังสือรวม จับกรณีที่ "ย่อหน้าหายไปทั้งก้อน" ซึ่งไม่มีหัวข้อให้จับ
    chars: (document.body.innerText || "").replace(/\s+/g, " ").trim().length,
  };
};

const snap = async (browser, url) => {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await p.goto(url, { waitUntil: "load", timeout: 30000 });
    await p.waitForTimeout(2200);           // รอ reveal/lazy ให้ของโผล่ครบก่อนนับ
    await p.evaluate(() => document.querySelectorAll(".reveal, .is-locked").forEach((e) => e.classList.add("in")));
    await p.waitForTimeout(300);
    return await p.evaluate(fingerprint);
  } catch (e) {
    return { error: e.message.split("\n")[0] };
  } finally { await p.close(); }
};

/* ---- เตรียมสถานะ "ก่อน" -------------------------------------------------- */
let baseDir = null, baseLabel = "";
if (LIVE) {
  baseLabel = `เว็บจริง ${LIVE_ORIGIN}`;
} else {
  baseDir = mkdtempSync(join(tmpdir(), "tarmsung-base-"));
  execFileSync("bash", ["-c", `git -C ${JSON.stringify(ROOT)} archive ${JSON.stringify(BASE_REF)} | tar -x -C ${JSON.stringify(baseDir)}`]);
  baseLabel = `${BASE_REF} (${execFileSync("git", ["-C", ROOT, "rev-parse", "--short", BASE_REF]).toString().trim()})`;
}

const urlOf = (page, side) =>
  side === "now" ? pathToFileURL(join(ROOT, page)).href
  : LIVE ? `${LIVE_ORIGIN}/${page.replace(/index\.html$/, "")}`
  : pathToFileURL(join(baseDir, page)).href;

const browser = await chromium.launch();
const lost = [];
let checked = 0, skipped = [];

/* Cloudflare Pages เสิร์ฟหน้าแรกให้ทุก path ที่ไม่มีไฟล์จริง (ไม่ใช่ 404) — เดโมที่ถูก
   ถอดออกจากเว็บอย่าง parcela จึงตอบกลับมาเป็น "หน้าแรก" แล้วด่านนี้อ่านว่า "เนื้อหา
   ของหน้าแรกหายไปหมด" ทั้งที่หน้านั้นไม่เคยอยู่บนเว็บ ต้องรู้จักหน้าแรกไว้ก่อนเพื่อ
   แยกออก (กับดักเดียวกับที่เขียนไว้ใน memory ว่า "fallback ไม่ใช่หลักฐานว่าไฟล์ไม่มี") */
const homeFp = LIVE ? await snap(browser, `${LIVE_ORIGIN}/`) : null;
const isFallback = (fp) => homeFp && !homeFp.error && !fp.error
  && JSON.stringify(fp.heads) === JSON.stringify(homeFp.heads);

for (const page of pages()) {
  if (!LIVE && !existsSync(join(baseDir, page))) { skipped.push(`${page} (หน้าใหม่ ยังไม่มีในของเดิม)`); continue; }
  const before = await snap(browser, urlOf(page, "base"));
  const after = await snap(browser, urlOf(page, "now"));
  if (before.error) { skipped.push(`${page} (เปิดของเดิมไม่ได้: ${before.error})`); continue; }
  if (page !== "index.html" && isFallback(before)) { skipped.push(`${page} (ไม่ได้อยู่บนเว็บจริง)`); continue; }
  if (after.error) { lost.push({ page, why: [`เปิดหน้าไม่ได้เลย: ${after.error}`] }); continue; }
  checked++;

  const why = [];
  const gone = (k, label) => {
    const miss = before[k].filter((v) => !after[k].includes(v));
    if (miss.length) why.push(`${label}หายไป ${miss.length} รายการ: ${miss.slice(0, 6).map((m) => `"${m.slice(0, 48)}"`).join(" · ")}${miss.length > 6 ? " …" : ""}`);
  };
  gone("heads", "หัวข้อ");
  gone("links", "ลิงก์");
  gone("imgs", "รูป");
  /* 8% ไม่ใช่ 0%: ตัวเลขที่นับไม่ตรงกันเป๊ะเป็นเรื่องปกติของหน้าที่มีคิว/วันที่/ตัวเลขวิ่ง
     เกณฑ์ต้องหลวมพอที่จะไม่ฟ้องทุกครั้ง ไม่งั้นคนจะเลิกอ่านผลของด่านนี้ */
  if (before.chars > 200 && after.chars < before.chars * 0.92)
    why.push(`ตัวหนังสือหายไป ${Math.round((1 - after.chars / before.chars) * 100)}% (${before.chars} → ${after.chars} ตัว)`);
  if (why.length) lost.push({ page, why });
}
await browser.close();
if (baseDir) rmSync(baseDir, { recursive: true, force: true });

/* ---- รายงาน: ผ่าน = บรรทัดเดียว · ไม่ผ่าน = เฉพาะของที่หาย ---------------- */
if (skipped.length) console.log(`ข้าม ${skipped.length} หน้า — ${skipped.slice(0, 4).join(" · ")}${skipped.length > 4 ? " …" : ""}`);
if (!lost.length) {
  console.log(`✅ ไม่มีของหาย — เทียบ ${checked} หน้ากับ ${baseLabel}`);
  process.exit(0);
}
console.log(`❌ ของหายจาก ${lost.length} หน้า (เทียบกับ ${baseLabel}) — ตรวจก่อน commit/deploy`);
for (const l of lost) { console.log(`\n── ${l.page}`); l.why.forEach((w) => console.log("   " + w)); }
process.exit(1);
