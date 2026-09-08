#!/usr/bin/env node
/* =============================================================================
   deploy-client.mjs — ปล่อยเว็บของ "ลูกค้าจริง" ขึ้นเป็นโปรเจกต์ของตัวเอง
   ใช้: node playbook/deploy-client.mjs <slug>            # ปล่อยจริง
        node playbook/deploy-client.mjs <slug> --dry      # ตรวจอย่างเดียว

   ทำไมต้องแยกจาก deploy.mjs (22/8/26):
   เดโมทั้งหมดอยู่ใต้ tarmsung.pages.dev/work/ ซึ่งถูกตั้ง noindex + robots ปิดไว้
   ตั้งใจ — มันคือ "ตัวอย่างงาน" ไม่ใช่เว็บของใคร แต่เว็บของลูกค้าที่จ่ายเงินแล้ว
   ต้องตรงกันข้ามทุกข้อ: ต้องมี URL ของตัวเอง · ต้องให้ Google เก็บ · ต้องย้าย
   ไปโดเมนของลูกค้าได้โดยไม่กระทบเว็บเรา ถ้าเอาไปฝากไว้ใต้ /work/ เหมือนเดโม
   วันที่ลูกค้าขอโดเมนตัวเอง จะต้องรื้อทั้งชุด — เจอปัญหานี้ตอนนั้นคือสายไป

   ผลลัพธ์: โปรเจกต์ Cloudflare Pages ชื่อ client-<slug> → https://client-<slug>.pages.dev
   ต่อโดเมนจริงทีหลังได้จาก Cloudflare dashboard โดยไม่ต้องแก้โค้ด
   ========================================================================== */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
const DRY = process.argv.includes("--dry");

if (!slug || slug.startsWith("--")) {
  console.error("ใช้: node playbook/deploy-client.mjs <slug> [--dry]");
  process.exit(2);
}
const src = join(ROOT, "work", slug);
if (!existsSync(src)) { console.error(`หา work/${slug} ไม่เจอ`); process.exit(2); }

/* ---- ด่านก่อนปล่อย: ของที่ห้ามติดไปกับเว็บลูกค้า -------------------------- */
let bad = 0;
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const files = walk(src);
for (const f of files.filter((f) => [".html", ".js", ".css"].includes(extname(f)))) {
  const body = readFileSync(f, "utf8");
  const rel = f.slice(ROOT.length + 1);
  /* 1. เดโมทุกใบถูกใส่ noindex ไว้ (ดู robots.txt) — เว็บลูกค้าต้องไม่มี ไม่งั้น
        จ่ายเงินทำเว็บแล้ว Google ไม่เก็บ ซึ่งเป็นสิ่งเดียวที่เขาซื้อ */
  if (/name="robots"[^>]*noindex/.test(body)) {
    console.error(`✗ ${rel} มี noindex อยู่ — เว็บลูกค้าต้องให้ค้นเจอ (ลบเมตาแท็กนั้นก่อน)`);
    bad++;
  }
  /* 2. ข้อมูลที่ถูกปิดเป็น xx ตอนเป็นเดโม ต้องถูกแทนด้วยของจริงของลูกค้าก่อนส่งมอบ */
  if (/0x-xxx-xxxx|0\dx-xxx-xxxx|ซอย xx|Soi\s+[A-Za-z-]+\s+xx/.test(body)) {
    console.error(`✗ ${rel} ยังมีข้อมูลที่ปิดไว้ (xx) — ใส่เบอร์/ที่อยู่จริงของลูกค้าก่อนส่งมอบ`);
    bad++;
  }
  /* 3. ป้าย "งานสาธิต · ทำเว็บโดย ตามสั่ง" ที่ติดอยู่ทุกหน้าใน work/ (ดู _demo-badge.js)
        เว็บที่ลูกค้าจ่ายเงินแล้วต้องไม่มีป้ายนี้ — มันประกาศว่าเว็บเป็นของปลอม และ
        ไฟล์อยู่ที่ /work/ ของเราซึ่งไม่ถูกก๊อปไปด้วย สคริปต์แท็กที่ค้างจะเป็น 404 */
  if (body.includes("_demo-badge.js")) {
    console.error(`✗ ${rel} ยังมีป้ายเดโมของ ตามสั่ง ติดอยู่ — ลบแท็ก <script src="/work/_demo-badge.js"> ก่อนส่งมอบ`);
    bad++;
  }
  /* 4. เศษของเดโม: ชื่อร้านต้นแบบหลงเหลือ = ความผิดพลาดที่แพงที่สุดตอนส่งงาน */
  for (const ghost of ["ครัวบ้านสวน", "โกลว์ คลินิก", "เดอะ เทอเรส", "VELVET LEAF", "Homecraft", "PARCELA"]) {
    if (slug !== ghost && body.includes(ghost) && !slug.includes(ghost.toLowerCase())) {
      console.error(`✗ ${rel} ยังมีชื่อ "${ghost}" ของเดโมต้นแบบค้างอยู่`);
      bad++;
      break;
    }
  }
}

const mb = (files.reduce((n, f) => n + statSync(f).size, 0) / 1048576).toFixed(1);
console.log(`\nไฟล์ ${files.length} · ${mb} MB · ตกด่าน ${bad} ข้อ`);
if (bad) { console.error("\nยังส่งมอบไม่ได้ — แก้ให้หมดก่อน"); process.exit(1); }
if (DRY) { console.log("--dry: ไม่ปล่อยขึ้นเว็บ"); process.exit(0); }

/* ---- ปล่อยเป็นโปรเจกต์ของลูกค้าเอง ---------------------------------------- */
const project = `client-${slug}`;
const dist = mkdtempSync(join(tmpdir(), `client-${slug}-`));
cpSync(src, dist, { recursive: true });
// robots ของเว็บลูกค้า: ให้เก็บได้ทั้งเว็บ ตรงข้ามกับของเดโม
writeFileSync(join(dist, "robots.txt"), "User-agent: *\nAllow: /\n");

console.log(`\nกำลังปล่อยขึ้น Cloudflare Pages (${project}) ...`);
execFileSync("npx", ["wrangler", "pages", "deploy", dist, "--project-name=" + project, "--branch=main"],
  { stdio: "inherit", cwd: ROOT });
rmSync(dist, { recursive: true, force: true });
console.log(`\nเสร็จ → https://${project}.pages.dev`);
console.log(`ต่อโดเมนของลูกค้าทีหลังได้ที่ Cloudflare → Pages → ${project} → Custom domains`);
