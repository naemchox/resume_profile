#!/usr/bin/env node
/* =============================================================================
   bump-assets.mjs — บวกเลขรุ่นให้ไฟล์ที่เนื้อในเปลี่ยนไปแล้ว
   ใช้:  node playbook/bump-assets.mjs          # ดูก่อนว่าจะบวกอะไรบ้าง
        node playbook/bump-assets.mjs --apply   # แก้จริงในไฟล์ HTML

   ทำไมต้องมี: /css /js /assets ถูกส่งด้วย Cache-Control immutable หนึ่งปี (ดู _headers)
   เลข ?v= จึงเป็นทางเดียวที่ทำให้คนที่เคยเข้าเว็บได้ไฟล์ใหม่ พอถ่ายภาพใหม่ทีละ 70 ใบ
   การไล่บวกเลขด้วยมือคือที่ที่จะลืม — และ 21/8/26 ก็ลืมจริง (peek.js ค้าง v=3
   สองรอบติด jek เห็นหน้าต่างแบบเก่าอยู่ครึ่งวัน) deploy.mjs จับได้แล้วว่าลืม
   ไฟล์นี้คือตัวแก้ให้ ไม่ใช่แค่ฟ้อง
   ========================================================================== */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = ["index.html", "reference.html", "privacy.html"];
/* การ์ดวงโค้ง hero ไม่ได้อยู่ในหน้า HTML — มันถูกสร้างจากลิสต์ใน js/main.js ที่เก็บเลขรุ่นเป็น
   shot: N / reel: N แทน ?v=N ไฟล์นี้เคยสแกนแต่ HTML เลขของ hero จึงค้างเงียบๆ ทุกครั้งที่ถ่ายใหม่
   (21/8/26 เจอค้างจริง 4 ใบ: the-bed, lumen, scoreup, ijek — คนที่เคยเข้าเว็บดูคลิปรุ่นเก่าอยู่)
   cache-buster เป็นของชนิดเดียวกันไม่ว่าจะเขียนด้วยทรงไหน จึงต้องเดินด้วยกลไกเดียวกันทั้งหมด */
const SCRIPTS = ["js/main.js"];
const manifestPath = join(ROOT, "playbook", "asset-versions.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const apply = process.argv.includes("--apply");

const hashOf = (rel) => {
  const p = join(ROOT, rel);
  return existsSync(p) ? createHash("md5").update(readFileSync(p)).digest("hex").slice(0, 12) : null;
};

/* รวบรวมทุก asset ที่มี ?v= จากทุกหน้า แล้วตัดสินใจ "ต่อไฟล์" ไม่ใช่ "ต่อหน้า" —
   ไฟล์เดียวกันที่ถูกอ้างในสองหน้าต้องได้เลขเดียวกัน ไม่งั้นเบราว์เซอร์โหลดสองรอบ */
const seen = new Map();     // rel -> { v, hash }   เลขสูงสุดที่ถูกใช้จริงของไฟล์นั้น
const uses = [];            // ทุกจุดที่อ้างถึง: { rel, v, file } — ไว้จับ "เลขไม่ตรงกันข้ามไฟล์"
const noteIn = (file) => (rel, v) => {
  const h = hashOf(rel);
  if (!h) return;
  uses.push({ rel, v: Number(v), file });
  const prev = seen.get(rel);
  seen.set(rel, { v: Math.max(Number(v), prev ? prev.v : 0), hash: h });
};

for (const page of PAGES) {
  const p = join(ROOT, page);
  if (!existsSync(p)) continue;
  const html = readFileSync(p, "utf8");
  const note = noteIn(page);
  // ทรง 1: href/src/data-reel ที่เขียนเลขไว้ท้าย URL — index.html ใช้ทรงนี้
  for (const m of html.matchAll(/(?:href|src|data-reel)="((?:css|js|assets)\/[^"?]+)\?v=(\d+)"/g)) note(m[1], m[2]);
  // ทรง 2: reference.html เก็บชื่อคลิปกับเลขรุ่นเป็นคนละแอตทริบิวต์
  // (data-reel="krua-baansuan" data-reel-v="2") แล้ว peek.js ต่อ URL เอง
  // สองทรงนี้ทำงานเดียวกันแต่คนละกลไก — ตราบใดที่ยังไม่รวมเป็นทรงเดียว ที่นี่ต้องรู้จักทั้งคู่
  // ไม่งั้นคลิปที่ถ่ายใหม่จะไม่ถึงคนที่เคยเข้าเว็บแล้ว ซึ่งเป็นสิ่งที่ไฟล์นี้มีไว้กัน
  for (const m of html.matchAll(/data-reel="([\w.-]+)"\s+data-reel-v="(\d+)"/g)) note(`assets/work/reel/${m[1]}.mp4`, m[2]);
}

/* ทรง 3: ลิสต์การ์ด hero ใน js/main.js — { img: "the-bed", ..., shot: 7, reel: 9 }
   shot = เลขของภาพนิ่ง assets/work/<img>.webp, reel = เลขของคลิป assets/work/reel/<img>.mp4
   อ่านทีละบรรทัด เพราะการ์ดหนึ่งใบ = หนึ่งบรรทัด (ใบที่มี emoji/pages ต่อหลายบรรทัด แต่
   คีย์ img/shot/reel อยู่บรรทัดแรกใบเดียวกันเสมอ) */
const missing = [];         // การ์ดที่ไม่มีเลขทั้งที่ไฟล์ถูกถ่ายใหม่ไปแล้ว = เสิร์ฟของเก่าค้าง
for (const script of SCRIPTS) {
  const p = join(ROOT, script);
  if (!existsSync(p)) continue;
  const note = noteIn(script);
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const img = line.match(/\{\s*img:\s*"([\w.-]+)"/)?.[1];
    if (!img) continue;
    for (const [key, rel] of [["shot", `assets/work/${img}.webp`], ["reel", `assets/work/reel/${img}.mp4`]]) {
      if (!existsSync(join(ROOT, rel))) continue;
      const v = line.match(new RegExp(`${key}:\\s*(\\d+)`))?.[1];
      if (v) { note(rel, v); continue; }
      /* ไม่เขียนคีย์เลย = การ์ดใบนี้ไม่ได้ใช้ไฟล์นั้น ไม่ใช่ลืม (Ijek ไม่เล่นคลิปบนวงโค้ง
         เพราะเป็นภาพนิ่ง+emoji layer ที่ align กันไว้, Gloss ไม่มี mp4) จึงไม่ทัก
         แต่ `reel: true` แปลว่า "ส่งไฟล์นี้แหละ ไม่ต้องมีเลข" ซึ่งถูกเฉพาะตอนยังเป็นรุ่น 1 */
      if (new RegExp(`${key}:\\s*true`).test(line) && (manifest[rel]?.v ?? 1) > 1) {
        missing.push({ img, key, rel, v: manifest[rel].v, file: script });
      }
    }
  }
}

/* เลขของไฟล์เดียวกันต้องเท่ากันทุกที่ที่อ้างถึง ไม่งั้นเบราว์เซอร์โหลดไฟล์เดียวกันสองรอบ
   และที่ที่เลขต่ำกว่าก็ยังเสิร์ฟของเก่าให้คนที่เคยเข้าเว็บอยู่ดี */
const drift = uses.filter((u) => u.v < seen.get(u.rel).v)
  .map((u) => ({ ...u, to: seen.get(u.rel).v }));

const bumps = [];
for (const [rel, cur] of seen) {
  const known = manifest[rel];
  if (known && known.v === cur.v && known.hash !== cur.hash) bumps.push([rel, cur.v, cur.v + 1]);
}

/* แก้เองไม่ได้ ต้องบอกให้รู้ — ไม่ใช่เงียบ: ถ้าการ์ดไม่มีเลขเลยก็ไม่มีเลขให้บวก
   คนแก้ต้องไปเติม shot:/reel: ในลิสต์เอง */
for (const m of missing) {
  console.error(`! ${m.file}: การ์ด "${m.img}" ไม่ได้เขียน ${m.key}: — แต่ ${m.rel} ถ่ายมาถึง v${m.v} แล้ว ` +
                `คนที่เคยเข้าเว็บจะยังได้ของเก่า (เติม ${m.key}: ${m.v} ในลิสต์)`);
}

if (!bumps.length && !drift.length) {
  console.log("ไม่มีอะไรต้องบวก — เลขรุ่นตรงกับเนื้อไฟล์ทุกตัว");
  process.exit(missing.length ? 1 : 0);
}

for (const [rel, from, to] of bumps) console.log(`${apply ? "บวก" : "จะบวก"} ${rel}  v${from} → v${to}`);
for (const d of drift) console.log(`${apply ? "ปรับให้ตรง" : "จะปรับให้ตรง"} ${d.file}: ${d.rel}  v${d.v} → v${d.to} (ที่อื่นใช้ v${d.to} อยู่แล้ว)`);
if (!apply) {
  console.log(`\nดูอย่างเดียว ${bumps.length + drift.length} จุด — สั่งจริง: node playbook/bump-assets.mjs --apply`);
  process.exit(0);
}

/* หนึ่งการแก้ = (ไฟล์, asset, เลขเดิม, เลขใหม่) — ทั้งเคสบวกเพราะเนื้อไฟล์เปลี่ยน และเคส
   ปรับให้ตรงเพราะอีกไฟล์ล้ำหน้าไปแล้ว เดินทางเดียวกันหมด */
const edits = [];
for (const [rel, from, to] of bumps) for (const f of [...PAGES, ...SCRIPTS]) edits.push({ file: f, rel, from, to });
for (const d of drift) edits.push({ file: d.file, rel: d.rel, from: d.v, to: d.to });

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const touched = new Set();
for (const file of new Set(edits.map((e) => e.file))) {
  const p = join(ROOT, file);
  if (!existsSync(p)) continue;
  let text = readFileSync(p, "utf8"); const before = text;
  for (const { rel, from, to } of edits.filter((e) => e.file === file)) {
    if (PAGES.includes(file)) {
      text = text.split(`${rel}?v=${from}`).join(`${rel}?v=${to}`);
      // ทรง 2 ต้องเขียนกลับคนละแบบ — ชื่อไฟล์ไม่ได้อยู่ในสตริงเดียวกับเลข
      const reelName = rel.match(/^assets\/work\/reel\/(.+)\.mp4$/)?.[1];
      if (reelName) {
        text = text.replace(new RegExp(`(data-reel="${esc(reelName)}"\\s+data-reel-v=")${from}(")`, "g"), `$1${to}$2`);
      }
    } else {
      // ทรง 3: เลขอยู่ในบรรทัดการ์ดของ img นั้นเท่านั้น ห้ามแทนทั้งไฟล์
      const m = rel.match(/^assets\/work\/(?:(reel)\/)?(.+)\.(?:webp|mp4)$/);
      if (!m) continue;
      const [, isReel, img] = m, key = isReel ? "reel" : "shot";
      text = text.replace(
        new RegExp(`(\\{\\s*img:\\s*"${esc(img)}"[^\\n]*?\\b${key}:\\s*)${from}\\b`, "g"), `$1${to}`);
    }
  }
  if (text !== before) { writeFileSync(p, text); touched.add(file); }
}
console.log(`\nแก้แล้ว ${edits.length} จุด ใน ${touched.size} ไฟล์ — deploy ได้เลย (ลายนิ้วมือจะถูกบันทึกตอน deploy สำเร็จ)`);
if (missing.length) process.exit(1);
