#!/usr/bin/env node
/* =============================================================================
   shoot-devices.mjs — ถ่ายภาพที่ไปอยู่ใน "อุปกรณ์" ของฮีโร่หน้าแรก
   ใช้: node playbook/shoot-devices.mjs           # ถ่ายทุกชุดในลิสต์
        node playbook/shoot-devices.mjs the-bed   # เฉพาะที่ระบุ

   ทำไมต้องมีไฟล์นี้ (21/8/26): assets/work/devices/*.webp เป็นชุดเดียวในเว็บที่
   ไม่มีสคริปต์ถ่าย — ทำมือทั้งหมด พอหน้าเดโมแก้เลย์เอาต์ (the-bed: ฮีโร่เคยล้นไป
   นอนใต้แถบเมนู) ภาพในจอคอม/แท็บเล็ต/มือถือของฮีโร่ก็ค้างอยู่กับดีไซน์เก่า และ
   ไม่มีใครรู้ว่าถ่ายที่ขนาดไหน ตำแหน่งไหน กติกาเดียวกับ shoot-cover/shoot-pages:
   ของชนิดเดียวกันต้องออกมาจากกลไกเดียวกัน

   ขนาดมาจาก width/height ที่เขียนไว้ในมาร์กอัปของ index.html เป๊ะๆ — ถ่ายที่ขนาด
   ที่มันถูกแสดงจริง ไม่ใช่ถ่ายใหญ่แล้วให้เบราว์เซอร์ย่อ
   ========================================================================== */
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ชุดของฮีโร่: หนึ่งเดโม → สี่ไฟล์ ที่ต่างกันแค่ขนาดจอกับตำแหน่งที่หยุด
   scroll: "top" = หัวหน้า · "section" = หัวเซ็กชันกลางหน้า (ตรรกะเดียวกับใบกลาง
   ของ shoot-pages.mjs) เพื่อให้จอที่สองไม่ได้ภาพซ้ำกับจอแรก */
const RIGS = {
  "the-bed": { file: "work/the-bed/index.html", out: "bed", shots: [
    { name: "desk",  w: 1200, h: 750, scroll: "top" },
    { name: "desk2", w: 1000, h: 625, scroll: "section" },
    { name: "tab",   w: 600,  h: 800, scroll: "top" },
    { name: "phone", w: 380,  h: 822, scroll: "top" },
  ] },
};

const QUALITY = 82;

const want = process.argv.slice(2);
const list = want.length ? want : Object.keys(RIGS);
for (const n of list) if (!RIGS[n]) { console.error(`ไม่รู้จัก "${n}" — มีให้เลือก: ${Object.keys(RIGS).join(", ")}`); process.exit(2); }

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("ต้องมี playwright ก่อน:  npm i -D playwright && npx playwright install chromium"); process.exit(2); }

/* รอให้อนิเมชันขาเข้าจบจริง — ก๊อปกติกาเดียวกับ shoot-cover.mjs ไว้ตรงนี้ด้วย
   เพราะสองไฟล์นี้ถ่ายหน้าเดียวกันคนละขนาด ถ้ารอไม่เหมือนกันจะได้คนละเฟรม */
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
const dir = mkdtempSync(join(tmpdir(), "devices-"));

for (const name of list) {
  const rig = RIGS[name];
  const src = join(ROOT, rig.file);
  if (!existsSync(src)) { console.error(`✗ ${name}: หา ${rig.file} ไม่เจอ`); process.exitCode = 1; continue; }

  for (const shot of rig.shots) {
    const ctx = await browser.newContext({ viewport: { width: shot.w, height: shot.h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto("file://" + src, { waitUntil: "load" });
    // เหตุผลเดียวกับ shoot-cover: ฟอนต์ display=optional ต้องผ่านรอบแรกไปก่อน
    await page.evaluate(() => document.fonts.ready);
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" });

    if (shot.scroll === "section") {
      const to = await page.evaluate(() => {
        const vh = window.innerHeight;
        const mid = (document.documentElement.scrollHeight - vh) / 2;
        const stickyH = [...document.querySelectorAll("body *")]
          .filter((e) => {
            const c = getComputedStyle(e);
            if (!["fixed", "sticky"].includes(c.position) || c.visibility === "hidden") return false;
            const r = e.getBoundingClientRect();
            return r.top <= vh * 0.25 && r.height > 24 && r.width > window.innerWidth * 0.5;
          })
          .reduce((h, e) => Math.max(h, e.getBoundingClientRect().bottom), 0);
        const tops = [...document.querySelectorAll("section, main > div, h2")]
          .map((e) => e.getBoundingClientRect().top + window.scrollY)
          .filter((t) => t > vh * 0.25);
        if (!tops.length) return Math.round(mid);
        const near = tops.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
        return Math.round(Math.max(0, near - stickyH - 24));
      });
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), to);
      await page.waitForTimeout(1200);
    }

    await settleAnimations(page);
    await page.evaluate(() => Promise.all([...document.images]
      .filter((im) => !im.complete)
      .map((im) => new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 2500); }))));

    const png = join(dir, `${rig.out}-${shot.name}.png`);
    await page.screenshot({ path: png });
    await ctx.close();

    const out = join(ROOT, "assets/work/devices", `${rig.out}-${shot.name}.webp`);
    execFileSync("cwebp", ["-quiet", "-q", String(QUALITY), "-resize", String(shot.w), "0", png, "-o", out]);
    console.log(`${rig.out}-${shot.name} → ${shot.w}x${shot.h}`);
  }
}

rmSync(dir, { recursive: true, force: true });
await browser.close();
