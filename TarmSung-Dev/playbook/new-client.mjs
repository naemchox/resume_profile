#!/usr/bin/env node
/* =============================================================================
   new-client.mjs — ตั้งต้นเว็บของลูกค้ารายใหม่จากเดโมที่มีอยู่
   ใช้: node playbook/new-client.mjs <เดโมต้นแบบ> <slug-ลูกค้า> "ชื่อร้าน" [เบอร์] [ไลน์]
   ตัวอย่าง: node playbook/new-client.mjs krua-baansuan somtam-jay "ส้มตำเจ๊" 089-111-2222 @somtamjay

   ทำไมต้องมี (22/8/26): แผนสัปดาห์นี้คือทำเดโมให้ร้านที่ส่งรูปมา ให้เสร็จภายใน 1-2 วัน
   ต่อร้าน งานที่ซ้ำทุกครั้งคือ ก๊อปโฟลเดอร์ → ไล่แทนชื่อร้าน/เบอร์/ไลน์ → เปลี่ยนรูป
   สองขั้นแรกเป็นงานที่พลาดง่ายและน่าเบื่อ (ชื่อร้านเก่าหลงเหลืออยู่หน้าเดียวก็จบเห่
   ตอนส่งให้ลูกค้าดู) จึงทำให้เป็นสคริปต์ ส่วนขั้นที่สาม (รูป/เนื้อหา) เป็นงานคน

   ไม่แตะของเดิม: เขียนลง work/<slug>/ ใหม่เสมอ ถ้ามีอยู่แล้วจะไม่ทับให้
   ========================================================================== */
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* โทเคนของแต่ละเดโม — ค่าที่ต้องถูกแทนเมื่อเอาไปทำของร้านใหม่
   เก็บไว้ที่เดียวตรงนี้ เพราะถ้าไปเดาด้วย regex ตอนรัน มันจะไปโดนตัวเลขอื่นในหน้า */
const DEMOS = {
  "krua-baansuan": { th: "ครัวบ้านสวน", en: "BAAN SUAN KITCHEN", tel: "081-234-5678", line: "@baansuan" },
  "glow-clinic":   { th: "โกลว์ คลินิก", en: "GLOW CLINIC",       tel: "02-123-4567",  line: "" },
  homecraft:       { th: "Homecraft",    en: "Homecraft",          tel: "061-234-5678", line: "" },
  "the-terrace":   { th: "เดอะ เทอเรส",  en: "THE TERRACE",        tel: "02-118-4499",  line: "" },
  "the-bed":       { th: "The Bed",      en: "THE BED",            tel: "",             line: "" },
  parcela:         { th: "PARCELA",      en: "PARCELA",            tel: "",             line: "" },
  "velvet-leaf":   { th: "VELVET LEAF",  en: "VELVET LEAF",        tel: "",             line: "" },
  lumen:           { th: "Lumen",        en: "LUMEN",              tel: "",             line: "" },
  summit:          { th: "SUMMIT",       en: "SUMMIT",             tel: "",             line: "" },
};

const [demo, slug, name, tel, line] = process.argv.slice(2);
if (!demo || !slug || !name) {
  console.error("ใช้: node playbook/new-client.mjs <เดโม> <slug> \"ชื่อร้าน\" [เบอร์] [ไลน์]");
  console.error("เดโมที่มี: " + Object.keys(DEMOS).join(", "));
  process.exit(2);
}
if (!DEMOS[demo]) { console.error(`ไม่รู้จักเดโม "${demo}" — มีให้เลือก: ${Object.keys(DEMOS).join(", ")}`); process.exit(2); }

const src = join(ROOT, "work", demo);
const dst = join(ROOT, "work", slug);
if (!existsSync(src)) { console.error(`หา ${src} ไม่เจอ`); process.exit(2); }
if (existsSync(dst)) { console.error(`work/${slug} มีอยู่แล้ว — ลบก่อน หรือใช้ slug อื่น (สคริปต์นี้ไม่ทับของเดิม)`); process.exit(2); }

cpSync(src, dst, { recursive: true });

const t = DEMOS[demo];
const swaps = [[t.th, name], [t.en, name]];
if (tel && t.tel) swaps.push([t.tel, tel]);
if (line && t.line) swaps.push([t.line, line]);

let files = 0, hits = 0;
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (![".html", ".js", ".css", ".json", ".webmanifest"].includes(extname(p))) continue;
    let body = readFileSync(p, "utf8"); const before = body;
    for (const [from, to] of swaps) if (from) body = body.split(from).join(to);
    if (body !== before) {
      writeFileSync(p, body);
      files++;
      hits += before.split(t.th).length - 1;
    }
  }
};
walk(dst);

/* ตรวจซ้ำว่าไม่มีชื่อเดิมหลงเหลือ — ข้อผิดพลาดที่แพงที่สุดคือส่งให้ลูกค้าดูแล้วเจอ
   ชื่อร้านคนอื่นอยู่ในหน้า */
const leftovers = [];
const scan = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { scan(p); continue; }
    if (![".html", ".js", ".css"].includes(extname(p))) continue;
    const body = readFileSync(p, "utf8");
    for (const key of [t.th, t.en, t.tel, t.line]) {
      if (key && body.includes(key)) leftovers.push(`${p.slice(ROOT.length + 1)} — ยังมี "${key}"`);
    }
  }
};
scan(dst);

console.log(`\n✓ สร้าง work/${slug}/ จากเดโม ${demo} แล้ว — แทนชื่อใน ${files} ไฟล์ (${hits} จุด)`);
if (leftovers.length) {
  console.log("\n▲ ยังมีของเดิมหลงเหลือ (แก้ก่อนส่งลูกค้า):");
  leftovers.forEach((l) => console.log("   " + l));
}
console.log(`
งานที่เหลือเป็นของคน (สคริปต์ทำแทนไม่ได้):
  1. รูป — วางทับใน work/${slug}/img/ ใช้ชื่อไฟล์เดิม จะได้ไม่ต้องแก้โค้ด
  2. ข้อความจริงของร้าน — เมนู/บริการ/ราคา/เวลาเปิด
  3. โลโก้ ถ้ามี
  4. ดูจริงด้วยตา:  python3 -m http.server 8099   แล้วเปิด /work/${slug}/
  5. ถ่ายภาพ+คลิปเข้าพอร์ต:  node playbook/shoot-cover.mjs ${slug} && node playbook/shoot-pages.mjs ${slug}
     (ต้องเพิ่ม ${slug} ในลิสต์ SHOTS ของสองสคริปต์นั้นก่อน)
`);
