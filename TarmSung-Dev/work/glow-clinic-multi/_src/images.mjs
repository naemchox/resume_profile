/* แปลงรูปเป็น WebP หลายขนาด — รัน: node work/glow-clinic/_src/images.mjs
   ทำไมต้องมี: qc วัดว่าหน้าแรกบนมือถือหนัก 1.29MB (ภาพ 1.13MB) เป็น JPEG ล้วน
   ไม่มี srcset ภาพกว้าง 1400px ถูกแสดงจริงที่ ~350px = ส่งข้อมูลเกินความจำเป็น 4 เท่า
   เดโมของบริษัทรับทำเว็บควรเป็นหลักฐานฝีมือ ไม่ใช่ตัวอย่างของสิ่งที่เราจะไม่ทำให้ลูกค้า
   ใช้ ffmpeg ที่เป็น dependency อยู่แล้ว ไม่ลงเครื่องมือใหม่ */
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const IMG = join(dirname(fileURLToPath(import.meta.url)), "..", "img");
const WIDTHS = [400, 800, 1400];
const kb = (p) => Math.round(statSync(p).size / 1024);

let before = 0, after = 0, made = 0;
for (const f of readdirSync(IMG).filter((f) => f.endsWith(".jpg"))) {
  const base = f.replace(/\.jpg$/, "");
  const src = join(IMG, f);
  before += statSync(src).size;
  // รูปย่อ th-* เล็กอยู่แล้ว ทำขนาดเดียวพอ
  const widths = base.startsWith("th-") ? [200] : WIDTHS;
  for (const w of widths) {
    const out = join(IMG, `${base}-${w}.webp`);
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", src,
      "-vf", `scale='min(${w},iw)':-2`, "-c:v", "libwebp", "-quality", "76", "-compression_level", "5", out]);
    after += statSync(out).size; made++;
  }
}
console.log(`สร้าง ${made} ไฟล์ webp · jpg เดิมรวม ${Math.round(before/1024)}KB → webp ทุกขนาดรวม ${Math.round(after/1024)}KB`);
