#!/usr/bin/env node
/* =============================================================================
   webm-twin.mjs — สร้าง "คู่แฝด WebM/VP9" ของคลิป .mp4
   ใช้เป็นโมดูล:  import { makeWebmTwin } from "./webm-twin.mjs"
   ใช้เป็นคำสั่ง:  node playbook/webm-twin.mjs assets/work/reel/ijek.mp4
                  node playbook/webm-twin.mjs --all      # ทุกไฟล์ที่ยังไม่มีคู่/คู่เก่ากว่า

   ทำไมต้องแยกเป็นไฟล์นี้
   หน้าเว็บเสิร์ฟ .webm ก่อนแล้วค่อยตกไปใช้ .mp4 และทั้งคู่ใช้เลข ?v เดียวกัน แปลว่า
   ถ้า .mp4 ถูกถ่ายใหม่แต่ .webm ยังเป็นรุ่นเก่า คนดูจะได้ "ภาพเก่า" ทั้งที่เลขรุ่นขยับแล้ว
   โดยไม่มีอะไรฟ้อง — deploy.mjs มีด่านจับเคสนี้ และ 21/8/26 มันจับได้จริง: ijek.mp4
   ถูกถ่ายด้วย shoot-app-reel.mjs ซึ่งไม่เคยทำคู่แฝดเลย ส่วน shoot-reel.mjs ทำ

   นั่นคืออาการของ "ของชนิดเดียวกันเดินคนละกลไก" — คลิปในหน้าผลงานมีสองสายการผลิต
   (เว็บใช้ shoot-reel, แอปใช้ shoot-app-reel) แต่ข้อกำหนดของไฟล์ที่ออกมาต้องเหมือนกัน
   ไฟล์นี้จึงเป็น "กลไกเดียว" ที่ทั้งสองสายเรียกใช้ แทนที่จะก๊อปคำสั่ง ffmpeg ไปวางสองที่

   ค่าที่ใช้: VP9 CRF 48 — วัด 21/8/26 เล็กกว่า H.264 CRF 31 ราวครึ่งหนึ่งที่ SSIM 0.986
   (velvet-leaf 2,668KB -> 1,311KB · ijek 1,229KB -> 303KB)
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ลำดับการหา ffmpeg ต้องตรงกับ pickEncoder() ใน shoot-reel.mjs เป๊ะ ไม่งั้นสองสคริปต์
   อาจใช้ ffmpeg คนละตัวคนละรุ่นกันโดยไม่มีใครรู้ (รีโปนี้ติดตั้ง ffmpeg-static ไว้ใน
   node_modules ไม่ได้พึ่ง ffmpeg ของเครื่อง) */
const ffmpeg = () => {
  if (process.env.FFMPEG_BIN && existsSync(process.env.FFMPEG_BIN)) return process.env.FFMPEG_BIN;
  const local = join(ROOT, "node_modules", "ffmpeg-static", "ffmpeg");
  if (existsSync(local)) return local;
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return "ffmpeg"; } catch { /* ไม่มีในเครื่อง */ }
  throw new Error("ไม่มี ffmpeg — ติดตั้งก่อน: npm i -D ffmpeg-static");
};

/** สร้าง .webm ข้างๆ .mp4 ที่ให้มา (เขียนทับของเดิมเสมอ) */
export function makeWebmTwin(mp4Path, bin = ffmpeg()) {
  const out = mp4Path.replace(/\.mp4$/, ".webm");
  execFileSync(bin, [
    "-v", "error", "-y", "-i", mp4Path,
    "-c:v", "libvpx-vp9", "-crf", "48", "-b:v", "0",
    "-row-mt", "1", "-cpu-used", "4", "-pix_fmt", "yuv420p", "-an",
    out,
  ]);
  return out;
}

/** คลิปที่ยังไม่มีคู่แฝด หรือคู่แฝดเก่ากว่าตัวเอง = ต้องทำใหม่ */
export function staleTwins(dir = join(ROOT, "assets/work/reel")) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => join(dir, f))
    .filter((mp4) => {
      const webm = mp4.replace(/\.mp4$/, ".webm");
      return !existsSync(webm) || statSync(webm).mtimeMs < statSync(mp4).mtimeMs;
    });
}

/* ---- โหมดคำสั่ง ---------------------------------------------------------- */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const list = args.includes("--all") || !args.length
    ? staleTwins()
    : args.map((a) => (a.startsWith("/") ? a : join(ROOT, a)));

  if (!list.length) { console.log("คู่แฝด WebM ครบและใหม่กว่า .mp4 ทุกไฟล์แล้ว"); process.exit(0); }
  const bin = ffmpeg();
  for (const mp4 of list) {
    if (!existsSync(mp4)) { console.error(`✗ ไม่มีไฟล์ ${mp4}`); process.exitCode = 1; continue; }
    process.stdout.write(`${mp4.split("/").pop()} → `);
    const out = makeWebmTwin(mp4, bin);
    console.log(`${(statSync(out).size / 1024).toFixed(0)} KB`);
  }
}
