#!/usr/bin/env node
/* =============================================================================
   shoot-cover.mjs — ถ่าย "ภาพนิ่งหน้าแรก" ที่การ์ดผลงานใช้ตอนยังไม่ hover
   ใช้: node playbook/shoot-cover.mjs               # ถ่ายใหม่ทุกใบ
        node playbook/shoot-cover.mjs the-bed lumen # ถ่ายเฉพาะที่ระบุ

   ทำไมต้องมีไฟล์นี้ ไม่ใช่ลากภาพมาเอง:
   ภาพนิ่งกับคลิป hover ต้องเป็น "หน้าเดียวกัน เวอร์ชันเดียวกัน" — ตอนที่ยังถ่ายมือ
   หน้าเว็บถูกแก้ไปหลายรอบแล้วภาพนิ่งค้างอยู่ที่ดีไซน์เก่า คนจึงเห็นภาพหนึ่งตอนนิ่ง
   แล้วเห็นอีกเว็บหนึ่งตอน hover ที่นี่ใช้ค่ากล้องชุดเดียวกับ shoot-reel.mjs
   (1280x800, deviceScaleFactor 1, รอ 2.5 วิให้ฟอนต์/ซีน 3D ตั้งตัว) เพื่อให้เฟรมแรก
   ของคลิปกับภาพนิ่งเป็นภาพเดียวกันเป๊ะ

   prep: หน้าไหนมีประตูบัง (เช่น velvet-leaf ถามอายุ) ต้องกดก่อน ไม่งั้นได้ภาพประตู
   ========================================================================== */

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SHOTS = {
  // เดโมสาย SME ไทย — สามหน้านี้คือของที่ cover เอาไปโชว์ (ร้านอาหาร/คลินิก/ร้านค้า)
  "krua-baansuan": { file: "work/krua-baansuan/index.html" },
  "glow-clinic":   { file: "work/glow-clinic/index.html" },
  "glow-clinic-multi": { file: "work/glow-clinic-multi/index.html" },
  // เวนิวจัดงาน — ฮีโร่เป็นรูปเต็มจอกับการ์ดแพ็กเกจที่ลอยขึ้นมาทับขอบล่างของรูป
  // settle เท่าค่าเริ่มต้นพอ: หน้านี้ไม่มีอนิเมชันขาเข้าที่ไถลจากนอกจอเหมือน the-bed
  "the-terrace":   { file: "work/the-terrace/index.html" },
  /* อู่ช่างชัด — พื้นมืดทั้งใบ ไม่มีอนิเมชันขาเข้าที่ยาวกว่าคนอื่น settle ค่าเริ่มต้นพอ */
  "chang-chat":    { file: "work/chang-chat/index.html" },
  /* ปกของเดโมหลายหน้าใช้หน้าแรกของมันเหมือนใบอื่น — ความต่างของแพ็ก ฿7,500 ไปโชว์
     ในภาพชุด 5 ใบที่การ์ดกางออกมา (ดู shoot-pages.mjs) ไม่ใช่ที่ปก */
  "the-terrace-multi": { file: "work/the-terrace-multi/index.html" },
  /* PARCELA ถูกถอดออกจากหน้าผลงาน 21/8/26 (jek สั่งเอาเดอะ เทอเรสขึ้นแทน)
     ซอร์สยังอยู่ที่ work/parcela/ ไม่ได้ลบ — ถ้าจะเอากลับขึ้นเว็บ ใส่บรรทัดของมัน
     กลับเข้าลิสต์นี้แล้วรันใหม่ ได้ไฟล์คืนใน 30 วินาที ไม่ต้องเก็บไฟล์ตายไว้บนเว็บ */
  // settle = รอเพิ่มหลังโหลด หน้าไหนมีอนิเมชันขาเข้าที่ยาวกว่าคนอื่น
  // the-bed: โลโก้กับแถบเมนูไถลเข้ามาช้า ถ่ายที่ 2.5 วิได้ตัวหนังสือซ้อนกันสองชั้น (วัดแล้ว)
  "the-bed":      { file: "work/the-bed/index.html", settle: 4500 },
  "the-bed-multi": { file: "work/the-bed-multi/index.html" },
  lumen:          { file: "work/lumen/index.html" },
  homecraft:      { file: "work/homecraft/index.html" },
  // hero เป็นสไลด์โชว์ 4 ใบวนรอบละ 28 วิ — ห้ามใส่ settle ให้ใบนี้
  // heroFade ทึบเต็มช่วง 1.1-7.0 วิ ทั้งกล้องนิ่ง (3.4 วิ) และเฟรมแรกของคลิป (2.5 วิ)
  // ตกอยู่ในช่วงนั้นพอดี => ได้สไลด์ใบเดียวกัน ถ้าถ่วงเวลาเพิ่มจะข้ามไปสไลด์ถัดไป
  summit:         { file: "work/summit/index.html" },
  "velvet-leaf":  { file: "work/velvet-leaf/index.html",
    prep: async (page) => {
      const yes = page.getByRole("button", { name: /yes,? i am 20|ใช่|20\+/i }).first();
      if (await yes.count()) { await yes.click(); await page.waitForTimeout(1200); }
    } },
  // flow / prototype2 / sample5 / prototype6.1 ถูกลบออกจาก work/ ไปแล้ว (ยืนยันด้วย
  // git log --diff-filter=D) — เอาออกจากลิสต์ ไม่งั้นสคริปต์ฟ้อง "หาไฟล์ไม่เจอ" ทุกครั้ง
};

/* 1600x1000 = จอเดียวกับที่ shoot-reel.mjs ใช้ถ่ายคลิป (21/8/26)
   เดิมที่นี่ถ่าย 1280x800 ส่วนคลิปถ่ายที่ 1600x1000 — หน้าเว็บเดียวกันจึงถูกเรนเดอร์
   คนละความกว้าง ตัวหนังสือกับกล่องในคลิปเล็กกว่าในภาพนิ่งราว 20% พอ hover การ์ด
   ภาพจึง "กระโดดซูม" (jek ทัก 21/8/26) ตัวเลขสองที่นี้ต้องเท่ากันเสมอ ถ้าจะแก้
   ต้องแก้พร้อมกันทั้งคู่แล้วถ่ายใหม่ทั้งภาพนิ่งและคลิป
   ไฟล์ที่ออกย่อเป็น 1440 กว้าง = ขนาดเดียวกับคลิปที่ผ่านการย่อแล้ว */
const W = 1600, H = 1000;
const OUT_W = 1440;
const QUALITY = 82;        // cwebp -q 82 ให้ไฟล์ราว 50-85 kb เท่าของเดิม

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
const dir = mkdtempSync(join(tmpdir(), "cover-"));

for (const name of list) {
  const { file, prep, settle = 0 } = SHOTS[name];
  const src = join(ROOT, file);
  if (!existsSync(src)) { console.error(`✗ ${name}: หา ${file} ไม่เจอ`); process.exitCode = 1; continue; }

  const page = await ctx.newPage();
  await page.goto("file://" + src, { waitUntil: "load" });
  // โหลดรอบแรกแล้วโหลดซ้ำ ก่อนจะแตะอะไรบนหน้า: หน้า the-bed ประกาศฟอนต์ด้วย
  // display=optional ซึ่งแปลว่า "ถ้าฟอนต์มาไม่ทันเฟรมแรก ให้ใช้ฟอนต์สำรองไปทั้งรอบนั้น
  // ห้ามสลับกลางคัน" — เบราว์เซอร์ที่เพิ่งเปิดจึงถ่ายได้หัวเรื่องเป็น Times ทั้งที่ Cinzel
  // โหลดเสร็จไปแล้ว (วัดแล้ว 2026-08-20: รอบแรกฟอนต์สำรอง รอบสอง Cinzel ตรงกับภาพเก่า)
  // รอบสองคือสิ่งที่คนที่เคยเข้าเว็บเห็นจริง ไม่ใช่กรณีพิเศษของหุ่นถ่ายภาพ
  // ทำก่อน prep เสมอ เพราะ reload ล้างสิ่งที่ prep กดไปแล้ว (ประตูอายุของ velvet-leaf)
  await page.evaluate(() => document.fonts.ready);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);
  if (prep) await prep(page);
  // อนิเมชันขาเข้าของหน้าเว็บ (โลโก้/เมนูที่ไถลเข้ามา) ทำให้ภาพเก่าติดเงาซ้อน
  // รออีกครึ่งวินาทีหลังกดประตู แล้วบังคับกลับไปบนสุดเผื่อ prep เลื่อนหน้า
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(900 + settle);

  await settleAnimations(page);
  const png = join(dir, name + ".png");
  await page.screenshot({ path: png });
  await page.close();

  const out = join(ROOT, "assets/work", `${name}.webp`);
  execFileSync("cwebp", ["-quiet", "-q", String(QUALITY), "-resize", String(OUT_W), "0", png, "-o", out]);
  console.log(`${name} → assets/work/${name}.webp`);
}

rmSync(dir, { recursive: true, force: true });
await browser.close();
