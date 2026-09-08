#!/usr/bin/env node
/* =============================================================================
   fix-font-flash.mjs — เลิกให้หน้าเว็บสลับฟอนต์ให้คนเห็น
   ใช้: node playbook/fix-font-flash.mjs            (ทุกหน้า)
        node playbook/fix-font-flash.mjs the-terrace

   ปัญหา: ลิงก์ Google Fonts ของเราเขียน display=swap ซึ่งแปลว่า "วาดด้วยฟอนต์สำรอง
   ไปก่อน แล้วค่อยสลับเป็นฟอนต์จริงเมื่อโหลดเสร็จ" — บนเน็ตช้า วัดที่ 400kbps หน้า
   the-terrace สลับที่วินาทีที่ 3.9 กล่องหัวข้อเปลี่ยนจาก 780 เป็น 724px ต่อหน้าคนอ่าน
   นั่นคือ "โชว์ฟอนต์เก่าแล้วกระพริบเป็นฟอนต์ใหม่" ที่เจ้าของทักมา 24/8/26
   หน้า the-bed แก้ไปแล้วรอบก่อนด้วย display=optional + preload และวัดแล้วไม่สลับ

   ตัวนี้ทำสองอย่างให้ทุกหน้า:
   1. display=swap → display=optional  (optional = ถ้าฟอนต์มาไม่ทันช่วงต้น ก็ใช้ฟอนต์
      สำรองไปทั้งรอบนั้นเลย ไม่สลับกลางคัน = ไม่มีอะไรกระพริบ)
   2. เติม <link rel=preload> ให้ไฟล์ฟอนต์ของ "ฟอนต์หัวเรื่อง" (ตระกูลแรกในลิงก์)
      เพราะ optional เฉยๆ แปลว่าคนที่เข้าครั้งแรกจะได้ฟอนต์สำรองไปทั้งหน้า
      preload ทำให้ไฟล์มาทันช่วงต้นเกือบทุกครั้ง คนจึงยังเห็นฟอนต์จริงเหมือนเดิม

   ดึงทั้งไฟล์ของ Chrome และของ Safari: Google เสิร์ฟคนละไฟล์ให้สองเบราว์เซอร์
   (ตัวแปรผัน vs ตัวสแตติก) ถ้า preload แต่ของ Chrome ฝั่ง Safari จะยังสลับให้เห็นอยู่
   ซึ่งเป็นจุดบอดที่ Chromium ตรวจไม่เจอ — บันทึกไว้ในหน้า the-bed ตั้งแต่รอบก่อน
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const UA_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const DEMOS = ["the-bed", "the-terrace", "glow-clinic", "krua-baansuan", "chang-chat",
               "homecraft", "velvet-leaf", "lumen", "summit", "gamedock",
               "the-terrace-multi", "the-bed-multi", "glow-clinic-multi"];
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = args.length
  ? args.map((a) => (a.endsWith(".html") ? a : `work/${a}/index.html`))
  : ["index.html", "reference.html", ...DEMOS.map((d) => `work/${d}/index.html`)];

/* เอาเฉพาะช่วงอักขระที่หน้าเราใช้จริง — ละตินพื้นฐานกับไทย
   ไม่งั้นจะ preload ไฟล์กรีก/ซีริลลิกที่ไม่มีใครได้เห็นสักตัว */
const WANTED = /U\+0000-00FF|U\+0E01/;

const cssFor = async (url, ua) => {
  const r = await fetch(url, { headers: { "user-agent": ua } });
  if (!r.ok) throw new Error(`โหลด CSS ไม่ได้ (${r.status})`);
  return r.text();
};

/* ดึง woff2 ของตระกูลแรกในลิงก์ (= ฟอนต์หัวเรื่อง ซึ่งเป็นตัวที่คนเห็นสลับชัดที่สุด) */
const pickFiles = (css, family) => {
  const out = [];
  for (const block of css.split("@font-face").slice(1)) {
    const fam = /font-family:\s*'([^']+)'/.exec(block)?.[1];
    if (fam !== family) continue;
    if (!WANTED.test(block)) continue;
    const url = /src:\s*url\(([^)]+)\)/.exec(block)?.[1];
    if (url && url.endsWith(".woff2") && !out.includes(url)) out.push(url);
  }
  return out;
};

let changed = 0;
for (const path of targets) {
  const file = join(ROOT, path);
  if (!existsSync(file)) { console.log(`! ข้าม ${path} (ไม่มีไฟล์)`); continue; }
  let html = readFileSync(file, "utf8");

  const link = /<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(html);
  if (!link) { console.log(`· ${path} — ไม่ได้ใช้ Google Fonts`); continue; }
  const url = link[1].replace(/&amp;/g, "&");

  const before = /display=([a-z]+)/.exec(url)?.[1] || "auto";
  /* แก้ URL ก่อน แล้วจำ "แท็กหลังแก้" ไว้เป็นจุดอ้างอิงของ preload — ถ้าใช้แท็กเดิม
     มันจะหาไม่เจอเพราะข้างในมี display=swap ที่เพิ่งถูกเปลี่ยนไปแล้ว (พลาดมาแล้วหนึ่งรอบ) */
  let anchor = link[0];
  if (before !== "optional") {
    const fixed = /display=/.test(link[1])
      ? link[1].replace(/display=[a-z]+/, "display=optional")
      : link[1] + "&display=optional";
    html = html.replace(link[1], fixed);
    anchor = link[0].replace(link[1], fixed);
  }

  /* ตระกูลแรก = ฟอนต์หัวเรื่องในทุกหน้าของเรา (เขียนไว้ตัวแรกเสมอ) */
  const family = decodeURIComponent(/family=([^&:]+)/.exec(url)?.[1] || "").replace(/\+/g, " ");
  let added = 0;
  if (family && !html.includes('rel="preload" as="font"')) {
    const files = [];
    for (const ua of [UA_CHROME, UA_SAFARI]) {
      try { files.push(...pickFiles(await cssFor(url, ua), family)); } catch (e) { console.log(`  ! ${path}: ${e.message}`); }
    }
    const uniq = [...new Set(files)].slice(0, 3);
    if (uniq.length) {
      const tags = uniq.map((f) =>
        `<link rel="preload" as="font" type="font/woff2" crossorigin\n      href="${f}" />`).join("\n");
      html = html.replace(anchor,
        `<!-- preload ฟอนต์หัวเรื่อง (${family}) — คู่กับ display=optional ข้างล่าง\n` +
        `     optional เฉยๆ แปลว่าคนที่เข้าครั้งแรกได้ฟอนต์สำรองทั้งหน้า preload ทำให้ไฟล์\n` +
        `     มาทันช่วงต้นเกือบทุกครั้ง · มีสองไฟล์เพราะ Google เสิร์ฟ Chrome กับ Safari คนละตัว\n` +
        `     (เติมอัตโนมัติด้วย playbook/fix-font-flash.mjs) -->\n${tags}\n${anchor}`);
      added = uniq.length;
    }
  }

  if (before !== "optional" || added) {
    writeFileSync(file, html);
    console.log(`✓ ${path} — display=${before} → optional${added ? ` · preload ${added} ไฟล์ (${family})` : ""}`);
    changed++;
  } else console.log(`· ${path} — เรียบร้อยอยู่แล้ว`);
}
console.log(`\nแก้ ${changed} หน้า — หน้าที่เป็น multi ต้องรัน _build.mjs ของมันต่อ ไม่งั้นหน้าลูกยังเป็นของเก่า`);
