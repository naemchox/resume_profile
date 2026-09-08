#!/usr/bin/env node
/* =============================================================================
   make-reel-sm.mjs — ทำไฟล์ "ฉบับการ์ด" (<ชื่อ>-sm.mp4) จากคลิปเต็มที่มีอยู่แล้ว
   ใช้: node playbook/make-reel-sm.mjs            # ทำใหม่ทุกใบ
        node playbook/make-reel-sm.mjs homecraft  # เฉพาะที่ระบุ

   ทำไมต้องมีสองขนาด (22/8/26 — jek: "Homecraft โคตรแล็ก ไปดูว่าเว็บอื่นเขาทำกันยังไง")
   ไปดูของจริงมาแล้วสองเจ้าที่ทำเรื่องเดียวกับเรา (แกลเลอรีโชว์เว็บ เล่นคลิปตอนชี้การ์ด)
   วัดจากไฟล์ที่เขาเสิร์ฟจริง ไม่ใช่จากบทความ:

     awwwards.com   880x660  450KB  218 kb/s  · กล่องบนหน้า 432x324 = พอดี 2 เท่า (retina)
     godly.website  480x270  ~120KB ~120 kb/s · กล่องบนหน้า 280x169 = ~1.7 เท่า
     ของเรา (เดิม)  1440x900 982KB  577 kb/s  · กล่องการ์ด 631x394

   สามอย่างที่เขาทำเหมือนกันทั้งคู่ และเราทำตรงข้ามทั้งสามข้อ:
     1) ขนาดไฟล์เท่าที่กล่องบนหน้าต้องใช้จริง ไม่ใหญ่กว่านั้น
     2) **MP4/H.264 อย่างเดียว** ไม่มี WebM เลยสักเจ้า — H.264 ถอดรหัสด้วยฮาร์ดแวร์
        ได้ทุกเครื่องรวมซาฟารี ส่วน VP9 บนแมคถอดด้วยซีพียู คลิป 1440x900 VP9 จึงกิน
        ซีพียูตลอดเวลาที่เล่น ซึ่งตรงกับอาการที่เจ้าของเว็บรายงาน ("ทั้งหน้าสะดุด")
     3) บิตเรตต่ำกว่าเรา — เทียบต่อพิกเซล awwwards 376 kb/s ต่อล้านพิกเซล เรา 444

   ทำไมไม่ย่อคลิปเดิมทิ้งไปเลย: ไฟล์เดียวกันนี้ถูกใช้สองที่ที่ขนาดต่างกันมาก
     ชี้การ์ด        กล่อง 482-631 CSS px  -> ฉบับ -sm
     หน้าต่างดูผลงาน กล่องถึง ~1350 CSS px  -> ฉบับเต็ม (webm+mp4 ของเดิม ไม่แตะ)
   ซึ่งก็เป็นวิธีเดียวกับที่ทั้งสองเจ้าใช้ (ดูพาธของ godly: items/<id>/0/480x270.mp4
   = มีหลายฉบับต่อหนึ่งคลิป) ตัดฉบับเต็มทิ้งเมื่อไหร่ หน้าต่างดูผลงานจะเบลอทันที

   960x600 มาจากไหน: การ์ดในฮีโร่กว้าง 482 CSS px -> retina พอดีที่ 964
   การ์ดหน้าอ้างอิงกว้าง 631 -> ได้ 0.76 เท่าของ retina ซึ่งยอมรับได้ (เทียบภาพแล้ว
   ที่ขนาดการ์ดจริง ตัวหนังสือเล็กนุ่มลงนิดเดียว) แลกกับพิกเซลที่ต้องถอดรหัสน้อยลง 56%
   ========================================================================== */
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "assets", "work", "reel");

/* ค่าที่ตั้งจากการวัด ไม่ใช่ความรู้สึก — เทียบเฟรมเดียวกันที่ขนาดการ์ดจริง (1262px)
   ระหว่างของเดิมกับ 960/crf34 แล้วดูออกยากมาก ส่วนไฟล์เล็กลงราวครึ่งหนึ่ง */
const OUT_W = 960, OUT_H = 600, CRF = 34;

const ff = (() => {
  const local = join(ROOT, "node_modules", "ffmpeg-static", "ffmpeg");
  if (existsSync(local)) return local;
  if (process.env.FFMPEG_BIN && existsSync(process.env.FFMPEG_BIN)) return process.env.FFMPEG_BIN;
  return "ffmpeg";
})();

const want = process.argv.slice(2);
const names = readdirSync(DIR)
  .filter((f) => f.endsWith(".mp4") && !f.endsWith("-sm.mp4"))
  .map((f) => f.replace(/\.mp4$/, ""))
  .filter((n) => !want.length || want.includes(n));

if (!names.length) { console.error("ไม่พบคลิปที่ตรงกับที่ขอ"); process.exit(2); }

const kb = (p) => Math.round(statSync(p).size / 1024);
let before = 0, after = 0;

for (const n of names) {
  const src = join(DIR, `${n}.mp4`);
  const out = join(DIR, `${n}-sm.mp4`);
  execFileSync(ff, [
    "-y", "-v", "error", "-i", src,
    "-vf", `scale=${OUT_W}:${OUT_H}:flags=lanczos`,
    "-c:v", "libx264", "-crf", String(CRF), "-preset", "slow",
    "-pix_fmt", "yuv420p",
    /* faststart = ย้ายตารางดัชนีไปหัวไฟล์ ให้เริ่มเล่นได้ก่อนไฟล์มาครบ
       สำคัญกว่าปกติ เพราะ Cloudflare Pages ตอบ Range request ด้วย 200 พร้อมไฟล์
       ทั้งก้อน ไม่ใช่ 206 (วัดซ้ำ 22/8/26 ยังเป็นอยู่) */
    "-movflags", "+faststart",
    "-an", out,                      // ไม่มีเสียง — คลิปนี้ปิดเสียงตลอดอยู่แล้ว
  ], { stdio: "inherit" });

  /* เทียบกับ .webm เพราะนั่นคือไฟล์ที่การ์ด "เคย" ดึงจริง (reel-video.js เรียง webm ก่อน) */
  const oldF = existsSync(join(DIR, `${n}.webm`)) ? join(DIR, `${n}.webm`) : src;
  before += kb(oldF); after += kb(out);
  console.log(`${n.padEnd(20)} ${String(kb(oldF)).padStart(5)}KB -> ${String(kb(out)).padStart(5)}KB`);
}
console.log(`\nรวม ${names.length} ใบ: ${before}KB -> ${after}KB (${Math.round((1 - after / before) * 100)}% เล็กลง)`);
console.log("อย่าลืมบวกเลขรุ่น data-reel-v ในหน้า HTML ถ้าไฟล์เปลี่ยน");
