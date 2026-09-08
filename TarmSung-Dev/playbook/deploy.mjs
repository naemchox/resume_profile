#!/usr/bin/env node
/* =============================================================================
   deploy.mjs — ปล่อยเว็บตามสั่งขึ้น Cloudflare Pages ด้วยขั้นตอนเดียวทุกครั้ง
   ใช้: node playbook/deploy.mjs            # ตรวจ + ปล่อยจริง
        node playbook/deploy.mjs --dry      # ประกอบ dist กับตรวจอย่างเดียว ไม่ปล่อย

   ทำไมต้องมีไฟล์นี้ ไม่ใช่พิมพ์ rsync + wrangler เอาเอง:
   วันที่ 2026-08-20 เว็บจริงถูกทับด้วยสำเนาเก่าสองครั้งในวันเดียว เพราะแต่ละคน
   (และแต่ละเซสชัน) ประกอบโฟลเดอร์ที่จะอัปด้วยมือคนละแบบ ใครกดทีหลังชนะเสมอ
   ผลคือหน้า The Bed ที่แก้เรื่องรูปไปแล้ว กลับไปดึงรูปจากเซิร์ฟเวอร์คนอื่นอีกรอบ
   วิธีเดียวที่กันได้คือให้ "การปล่อยเว็บ" เป็นสคริปต์เดียวที่ทุกคนเรียก
   ========================================================================== */
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
/* ---- ปล่อยจาก commit ไม่ใช่จากโฟลเดอร์จริง (25/8/26) ------------------------
   เดิมสคริปต์นี้ก๊อปไฟล์จากโฟลเดอร์ในเครื่องตรงๆ แปลว่า **อะไรที่แก้ค้างไว้แต่ยังไม่
   commit ก็ขึ้นเว็บไปด้วยเสมอ** รวมถึงงานของอีกเซสชันที่ยังทำไม่เสร็จ
   25/8/26 เกิดขึ้นจริงสองรอบในวันเดียว: กด deploy แล้วพางานที่อีกเซสชันกำลังแก้ค้าง
   (52 ไฟล์) ขึ้นเว็บ ทั้งที่เจ้าของงานยังไม่ได้ตัดสินใจปล่อย
   คอมเมนต์หัวไฟล์นี้เตือนเรื่อง "ใครกดทีหลังชนะเสมอ" ไว้แล้ว แต่กันได้แค่ครึ่งเดียว
   คือกันการประกอบโฟลเดอร์คนละแบบ ไม่ได้กันการปล่อยของที่ยังทำไม่เสร็จ

   ตอนนี้ค่าเริ่มต้นคือประกอบจาก HEAD ด้วย git archive = ปล่อยเฉพาะของที่ commit แล้ว
   ใส่ --dirty ถ้าจงใจจะปล่อยของที่ยังไม่ commit (เช่นทดสอบเร็วๆ) แล้วมันจะบอกให้เห็น
   ด่านต่างๆ ยังรันจากโฟลเดอร์จริงเหมือนเดิม เพราะสคริปต์ในนั้นต้องใช้ node_modules
   ซึ่ง git archive ไม่มี — ถ้าสองฝั่งไม่ตรงกัน จะพิมพ์รายการไฟล์ที่ต่างให้เห็นก่อนเสมอ */
const DIRTY = process.argv.includes("--dirty");
const PROJECT = "tarmsung";

/* ---- โฮสต์เดียว ไม่มีสอง ----------------------------------------------------
   ที่เดียวที่เว็บนี้ขึ้นจริงคือ Cloudflare Pages โปรเจกต์ "tarmsung"
   tarmsung.netlify.app ไม่ได้เสิร์ฟเนื้อหาอะไรแล้ว — วัดแล้วทุก path (รวมไฟล์ css)
   ตอบ 301 มาที่ tarmsung.pages.dev เก็บไว้เป็นทางผ่านให้ลิงก์เก่าที่ส่งลูกค้าไปแล้ว
   เท่านั้น ห้าม deploy ขึ้น Netlify อีก และ netlify.toml ถูกลบออกจากรีโปแล้ว
   (2026-08-20) เพราะถ้ามันอยู่ ใครกด "link repo" ที่ Netlify เมื่อไหร่ จะได้เว็บ
   ชุดที่สองที่เนื้อหาไม่ตรงกันทันที และเราจะไม่รู้ว่าลูกค้าเปิดเจอชุดไหน */

/* ---- สิ่งที่ขึ้นเว็บ (ทุกอย่างที่ไม่อยู่ในนี้ ไม่ขึ้น) --------------------- */
/* functions/ = โค้ดฝั่งเซิร์ฟเวอร์ของ Cloudflare Pages (ตอนนี้มี /api/lead ตัวเดียว)
   ต้องอยู่ในลิสต์นี้ ไม่งั้นมันไม่ถูกก๊อปลง dist และฟอร์มจะยิงไปที่ 404 เงียบๆ */
const DIRS  = ["assets", "css", "js", "work", "functions"];
const FILES = ["index.html", "reference.html", "privacy.html", "404.html",
               "robots.txt", "sitemap.xml", "_redirects", "_headers", "security.txt"];

/* ---- สิ่งที่ต้องไม่ติดขึ้นไป ---------------------------------------------
   cover*.png  = ภาพปกไว้ทำโฆษณา หนัก 13MB และไม่มีหน้าไหนอ้างถึงเลย
   *.md        = โน้ตภายใน (_redirects เคยต้องมากันไว้ทีละไฟล์เพราะเรื่องนี้)
   _verify-*   = ไฟล์ของด่านตรวจ ไม่ใช่ของเว็บ
   _contrast.* = สคริปต์วัดสี ใช้ตอนพัฒนา                                     */
const SKIP = (p) => /(^|\/)cover.*\.png$/.test(p) || extname(p) === ".md"
  || /(^|\/)_verify-exempt\.json$/.test(p) || /(^|\/)_contrast\.(js|mjs)$/.test(p)
  // work/parcela = เดโมที่ถูกถอดออกจากหน้าผลงาน 21/8/26 ซอร์สยังอยู่ในรีโปเพื่อ
  // เอากลับได้ แต่ไม่ต้องอัปขึ้นเว็บอีก (_redirects พาลิงก์เก่าไปหน้าผลงานแทน)
  || /^work\/parcela(\/|$)/.test(p)
  // _src = เทมเพลตต้นทางของเดโมหลายหน้า (ยังมี {{R}} ที่ไม่ถูกแทน) build-multi.mjs ประกอบเป็น
  // หน้าจริงให้แล้ว ตัวมันเองไม่ใช่หน้าเว็บ — 24/8/26 เช็คพบว่ามันถูกอัปขึ้นเว็บจริง เปิดได้ 200
  // links.mjs กันไว้ตั้งแต่แรก (OFF_SITE) แต่ลิสต์นี้ไม่มี ทั้งที่คอมเมนต์บอกว่าสองลิสต์ต้องตรงกัน
  || p.split("/").includes("_src");

/* ---- ด่านก่อนปล่อย: ของที่เคยหลุดขึ้นเว็บมาแล้ว ห้ามหลุดซ้ำ ----------------
   ทั้งสองข้อนี้มาจาก audit 2026-08-20 และทั้งคู่ "กลับมา" หลังแก้ไปแล้วรอบหนึ่ง
   จึงต้องเป็นกฎที่รันได้ ไม่ใช่ข้อตกลงที่จำกันเอง                              */
const BANNED = [
  { pat: /c2\.hongpak\.in\.th/, where: /\.html$/,
    why: "หน้าเดโมดึงรูปจากเซิร์ฟเวอร์ของเว็บจองที่พักเจ้าอื่น — ต้องใช้รูปใน work/<slug>/img/ เท่านั้น" },
  { pat: /tarmsung\.netlify\.app/, where: /\.(html|xml)$/,
    why: "โดเมนเก่าที่ตอนนี้เป็นแค่ 301 — canonical/og/sitemap ต้องชี้ tarmsung.pages.dev" },
];

const walk = (d, out = []) => {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    if (f.name.startsWith(".") || f.name === "node_modules") continue;
    const p = join(d, f.name);
    f.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

const dist = mkdtempSync(join(tmpdir(), "tarmsung-dist-"));
/* 24/8/26 บนวินโดวส์ path คั่นด้วยแบ็กสแลช กฎที่เขียนว่า rel.includes("/") จึงเป็นเท็จเสมอ
   ด่าน ?v= ที่ตั้งใจตรวจเฉพาะไฟล์ระดับบนสุด เลยลามไปตรวจหน้าเดโมทุกหน้า (ที่คอมเมนต์
   ข้างล่างบอกเองว่าไม่ต้องตรวจ) = ปล่อยเว็บจากเครื่องวินโดวส์ไม่ได้
   REL() คืนพาธที่คั่นด้วย "/" เสมอ ทุกด่านข้างล่างจึงอ่านพาธแบบเดียวกันทั้งสองเครื่อง */
const REL = (f) => f.slice(dist.length + 1).split(sep).join("/");
const copied = [];
/* 24/8/26 เดิมเรียก /bin/mkdir กับ /bin/cp ตรงๆ ซึ่งมีแค่บนแมค — บนเครื่องวินโดวส์
   สคริปต์ตายตั้งแต่ไฟล์แรก (ENOENT spawnSync /bin/mkdir) แปลว่า "ปล่อยเว็บ" ทำได้
   เครื่องเดียวทั้งที่ repo นี้ทำงานสองเครื่อง ใช้ fs ของ node แทน ได้ผลเหมือนกันทุกที่ */
const cp = (from, to) => { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); copied.push(to); };

/* ต้นทางของไฟล์ที่จะขึ้นเว็บ — ไม่ใช่ ROOT เสมอไป (ดูเหตุผลบนหัวไฟล์) */
let SRC = ROOT, archiveDir = null;
{
  const dirtyFiles = execFileSync("git", ["-C", ROOT, "status", "--porcelain", "--untracked-files=no"])
    .toString().trim().split("\n").filter(Boolean);
  if (DIRTY) {
    if (dirtyFiles.length) console.log(`! --dirty: ปล่อยของที่ยังไม่ commit ${dirtyFiles.length} ไฟล์ขึ้นเว็บด้วย`);
  } else if (dirtyFiles.length) {
    console.log(`! มีไฟล์ที่แก้แล้วยังไม่ commit ${dirtyFiles.length} ไฟล์ — **จะไม่ขึ้นเว็บรอบนี้**`);
    for (const l of dirtyFiles.slice(0, 8)) console.log(`    ${l}`);
    if (dirtyFiles.length > 8) console.log(`    …และอีก ${dirtyFiles.length - 8}`);
    console.log(`  (ตั้งใจจะปล่อยของพวกนี้ให้ commit ก่อน หรือใส่ --dirty)`);
  }
  if (!DIRTY) {
    archiveDir = mkdtempSync(join(tmpdir(), "tarmsung-head-"));
    execFileSync("bash", ["-c",
      `git -C ${JSON.stringify(ROOT)} archive HEAD | tar -x -C ${JSON.stringify(archiveDir)}`]);
    SRC = archiveDir;
  }
}

for (const d of DIRS) {
  const src = join(SRC, d);
  if (!existsSync(src)) { console.error(`✗ ไม่มีโฟลเดอร์ ${d}/`); process.exit(2); }
  for (const f of walk(src)) {
    /* 24/8/26 SKIP() เทียบด้วย "/" ทั้งชุด บนวินโดวส์ rel เป็น "work\the-bed\_contrast.js"
       กฎ (^|/)_contrast จึงไม่จับ ของที่ตั้งใจไม่ให้ขึ้นเว็บเลยถูกอัปขึ้นจริง (เช็คแล้วได้ 200) */
    const rel = f.slice(SRC.length + 1).split(sep).join("/");
    if (SKIP(rel)) continue;
    cp(f, join(dist, rel));
  }
}
for (const f of FILES) {
  const src = join(SRC, f);
  if (existsSync(src)) cp(src, join(dist, f));
  else console.log(`! ข้าม ${f} (ไม่มีไฟล์)`);
}

/* ---- ตรวจก่อนปล่อย ------------------------------------------------------- */
let bad = 0;
for (const f of copied) {
  const rel = REL(f);
  for (const b of BANNED) {
    if (!b.where.test(rel)) continue;
    const body = readFileSync(f, "utf8");
    // นับเฉพาะที่อยู่นอกคอมเมนต์ HTML — คอมเมนต์ที่เขียนเหตุผลกำกับไว้ไม่ใช่ของที่เบราว์เซอร์โหลด
    const live = body.replace(/<!--[\s\S]*?-->/g, "");
    if (b.pat.test(live)) { console.error(`✗ ${rel} — ${b.why}`); bad++; }
  }
}
/* ---- ด่าน ?v= : คู่กับ _headers ------------------------------------------
   ตั้งแต่ 20/8/26 เว็บส่ง Cache-Control: immutable หนึ่งปี ให้ /css /js /assets
   ของนิ่งจึงถูกเบราว์เซอร์เก็บไว้ยาว และ "เลขรุ่นท้าย URL" กลายเป็นทางเดียวที่
   ทำให้คนที่เคยเข้าเว็บได้ของใหม่ ลืมบวกเลข = เขาค้างกับของเก่าทั้งปี ไม่ใช่
   รอบเดียว — จึงต้องเป็นด่านที่รันได้ ไม่ใช่ข้อตกลงที่จำกันเอง */
// เฉพาะหน้าที่อยู่ระดับบนสุด: หน้าเดโมใน work/<slug>/ มี css/js ของตัวเอง ซึ่ง
// อยู่คนละพาธกับกฎใน _headers (/css /js) จึงไม่ได้ถูกแคชยาว และไม่ต้องมีเลขรุ่น
for (const f of copied.filter((f) => extname(f) === ".html" && !REL(f).includes("/"))) {
  const rel = REL(f);
  const live = readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  for (const m of live.matchAll(/(?:href|src)="((?:\.\.\/)*(?:css|js)\/[^"]+\.(?:css|js))(\?[^"]*)?"/g)) {
    if (!/[?&]v=/.test(m[2] || "")) { console.error(`✗ ${rel} — ${m[1]} ไม่มี ?v= (แคชหนึ่งปี: คนเก่าจะไม่ได้ของใหม่)`); bad++; }
  }
  /* รูปกับคลิปอยู่ใต้ /assets ซึ่ง _headers แคชไว้หนึ่งปีเท่ากับ css/js เป๊ะ — กฎเดียวกัน
     ต้องคุมของทั้งสามชนิด ไม่ใช่คุมแค่สองชนิดที่เคยพังให้เห็น (21/8/26: ถ่ายภาพราย
     ช่วงใหม่ทั้ง 12 ใบ แล้วเกือบปล่อยขึ้นเว็บโดยที่ URL ไม่มีเลขรุ่นสักใบ) */
  for (const m of live.matchAll(/(?:href|src)="((?:\.\.\/)*assets\/[^"]+\.(?:webp|png|jpg|jpeg|svg|ico|mp4|webm))(\?[^"]*)?"/g)) {
    if (!/[?&]v=/.test(m[2] || "")) { console.error(`✗ ${rel} — ${m[1]} ไม่มี ?v= (แคชหนึ่งปี: คนเก่าจะไม่ได้ของใหม่)`); bad++; }
  }
  /* คลิป hover ไม่ได้อยู่ใน src= แต่อยู่ใน data-reel ซึ่งสองหน้าเขียนคนละแบบ
     หน้าแรก = พาธเต็มพร้อม ?v= · หน้าอ้างอิง = ชื่อฐาน + data-reel-v ต้องมีทั้งคู่ */
  for (const m of live.matchAll(/data-reel="([^"]+)"(?:\s+data-reel-v="(\d+)")?/g)) {
    const hasVer = /[?&]v=/.test(m[1]) || m[2];
    if (!hasVer) { console.error(`✗ ${rel} — data-reel="${m[1]}" ไม่มีเลขรุ่น (?v= หรือ data-reel-v)`); bad++; }
  }
}

/* ---- ด่าน "แก้ไฟล์แล้วลืมบวกเลขรุ่น" -------------------------------------
   ด่านข้างบนถามแค่ว่า "มี ?v= ไหม" ซึ่งผ่านตลอดแม้ไฟล์จะเปลี่ยนไปคนละเรื่อง
   21/8/26: js/peek.js ถูกเขียนใหม่สองรอบโดยเลขยังเป็น v=3 ทั้งคู่ ผลคือ jek เปิด
   เว็บแล้วเห็นหน้าต่างแบบเก่าอยู่หลายชั่วโมงและคิดว่างานยังไม่ขึ้น ทั้งที่ไฟล์บน
   เซิร์ฟเวอร์ใหม่แล้ว — เบราว์เซอร์ของเขาถือ v=3 ที่แคชไว้หนึ่งปีตาม _headers
   ด่านนี้จึงจำ "ลายนิ้วมือของไฟล์ต่อเลขรุ่น" ไว้ ถ้าไฟล์เปลี่ยนแต่เลขไม่ขยับ = ตก */
const manifestPath = join(ROOT, "playbook", "asset-versions.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const nextManifest = { ...manifest };
for (const f of copied.filter((f) => extname(f) === ".html" && !REL(f).includes("/"))) {
  const live = readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  /* ต้องอ่านให้ตรงกับ bump-assets.mjs เป๊ะ ไม่งั้นด่านนี้กับตัวที่บวกเลขให้ "เห็นของ
     คนละชุด" — 21/8/26 เจอมาแล้ว: คลิปทุกใบถูกอ้างด้วย data-reel ไม่ใช่ href/src
     ทั้งสองไฟล์จึงมองไม่เห็นคลิปเลยสักใบ ถ่ายคลิปใหม่กี่รอบก็ไม่ถึงคนที่เคยเข้าเว็บ
     เพราะ _headers ส่ง assets ด้วย immutable หนึ่งปี */
  const hits = [];
  for (const m of live.matchAll(/(?:href|src|data-reel)="((?:css|js|assets)\/[^"?]+\.(?:css|js|webp|png|jpg|jpeg|svg|ico|mp4|webm))\?v=(\d+)"/g)) hits.push([m[1], m[2]]);
  // หน้าอ้างอิงแยกเลขรุ่นไปอีกแอตทริบิวต์ (data-reel="ชื่อ" data-reel-v="เลข")
  for (const m of live.matchAll(/data-reel="([\w.-]+)"\s+data-reel-v="(\d+)"/g)) hits.push([`assets/work/reel/${m[1]}.mp4`, m[2]]);
  for (const [asset, ver] of hits) {
    const onDisk = join(dist, asset);
    if (!existsSync(onDisk)) continue;
    const hash = createHash("md5").update(readFileSync(onDisk)).digest("hex").slice(0, 12);
    const seen = manifest[asset];
    if (seen && seen.v === Number(ver) && seen.hash !== hash) {
      console.error(`✗ ${asset} เปลี่ยนไปแล้วแต่ยังเป็น ?v=${ver} — คนที่เคยเข้าเว็บจะยังได้ของเก่า (บวกเลขรุ่นในหน้า HTML ทุกไฟล์)`);
      bad++;
    }
    nextManifest[asset] = { v: Number(ver), hash };
  }
}

/* การ์ดวงโค้ง hero ไม่ได้อยู่ในหน้า HTML — ลิสต์อยู่ใน js/main.js และเขียนเลขรุ่นเป็น
   shot: N / reel: N ด่านข้างบนจึงมองไม่เห็นมันเลย เป็นรูเดียวกับที่เคยทำให้คลิปที่ถ่ายใหม่
   ไม่ถึงคนที่เคยเข้าเว็บ ต้องอ่านให้ตรงกับ bump-assets.mjs (ทรง 3) เป๊ะเช่นเดิม */
const mainJs = join(dist, "js", "main.js");
if (existsSync(mainJs)) {
  for (const line of readFileSync(mainJs, "utf8").split("\n")) {
    const img = line.match(/\{\s*img:\s*"([\w.-]+)"/)?.[1];
    if (!img) continue;
    for (const [key, asset] of [["shot", `assets/work/${img}.webp`], ["reel", `assets/work/reel/${img}.mp4`]]) {
      const ver = line.match(new RegExp(`${key}:\\s*(\\d+)`))?.[1];
      const onDisk = join(dist, asset);
      if (!existsSync(onDisk)) continue;
      const hash = createHash("md5").update(readFileSync(onDisk)).digest("hex").slice(0, 12);
      if (!ver) {
        // ไม่เขียนคีย์ = การ์ดใบนี้ไม่ได้ใช้ไฟล์นั้น (ตั้งใจ) · เขียน true = ไม่มีเลขให้แคชแยก
        if (new RegExp(`${key}:\\s*true`).test(line) && manifest[asset] && manifest[asset].v > 1) {
          console.error(`✗ การ์ด hero "${img}" เขียน ${key}: true ทั้งที่ ${asset} ถึง v${manifest[asset].v} แล้ว — คนที่เคยเข้าเว็บจะยังได้ของเก่า`);
          bad++;
        }
        continue;
      }
      const seen = manifest[asset];
      if (seen && seen.v === Number(ver) && seen.hash !== hash) {
        console.error(`✗ ${asset} เปลี่ยนไปแล้วแต่การ์ด hero ยังเป็น ${key}: ${ver} — บวกเลขในลิสต์ที่ js/main.js`);
        bad++;
      }
      nextManifest[asset] = { v: Number(ver), hash };
    }
  }
}

/* ---- คู่แฝดของคลิป: .webm ต้องไม่เก่ากว่า .mp4 ของตัวเอง -------------------
   หน้าเว็บเสิร์ฟ .webm ก่อนแล้วค่อยตก .mp4 และทั้งคู่ใช้เลข ?v เดียวกัน (มาจาก
   การถ่ายรอบเดียวกัน — shoot-reel.mjs ทำทั้งสองไฟล์ติดกัน) ถ้าวันไหนมีคนถ่าย
   .mp4 ใหม่แล้ว .webm ค้างรุ่นเก่าไว้ คนดูจะได้ภาพเก่าทั้งที่เลขรุ่นเปลี่ยนแล้ว
   และไม่มีอะไรฟ้องเลย เพราะไฟล์ก็ยังโหลดได้ปกติ — ด่านนี้จับกรณีนั้น */
for (const f of copied.filter((f) => f.endsWith(".mp4") && f.includes("/reel/"))) {
  /* เทียบเวลาจาก "ไฟล์ต้นทางในรีโป" ไม่ใช่สำเนาใน dist — สำเนาถูกเขียนพร้อมกัน
     ทั้งคู่ตอนประกอบ เวลาแก้ไขจึงเท่ากันเสมอและด่านนี้จะไม่มีวันจับอะไรได้เลย
     (เจอตอนใช้งานจริงรอบแรก 21/8/26: มีคนถ่าย .mp4 ใหม่ทับ ด่านเงียบสนิท) */
  const src = join(ROOT, REL(f));
  const twin = src.replace(/\.mp4$/, ".webm");
  if (!existsSync(twin)) continue;                      // ยังไม่มีคู่แฝด = ตก mp4 ตามปกติ
  if (statSync(twin).mtimeMs < statSync(src).mtimeMs - 1000) {
    bad++;
    console.error(`✗ ${twin.slice(ROOT.length + 1)} เก่ากว่า .mp4 ของตัวเอง — ถ่ายใหม่แล้วลืมทำ WebM (รัน playbook/shoot-reel.mjs ใหม่ หรือลบไฟล์ .webm ทิ้งเพื่อให้ตกไปใช้ .mp4)`);
  }
}

/* ---- ด่าน TS_PAGES_V: ภาพหน้าจอในการ์ดผลงาน --------------------------------
   ภาพใน assets/work/pages/ ไม่ได้ต่อเลขรุ่นรายไฟล์ แต่ใช้ตัวแปรตัวเดียวคุมทั้งโฟลเดอร์
   (window.TS_PAGES_V ใน js/loader.js) ด่านข้างล่างจึงมองไม่เห็นมันเลย เพราะมันไล่จาก
   "?v= ที่เขียนใน HTML" 21/8/26 เจอจริง: ถ่าย ijek-3 ใหม่ให้อวตารโลมาเต็มตัว แล้ว
   bump-assets ตอบว่า "ไม่มีอะไรต้องบวก" ทั้งที่คนที่เคยเปิดการ์ดจะเห็นภาพเก่าไปทั้งปี
   (_headers ส่ง assets แบบ immutable) — กลไกเลขรุ่นชุดที่สี่ที่ไม่มีใครเฝ้า
   ด่านนี้จำ "ลายนิ้วมือรวมของทั้งโฟลเดอร์" ไว้กับเลข ถ้าเนื้อในเปลี่ยนแต่เลขไม่ขยับ = ตก */
{
  const pagesDir = join(dist, "assets", "work", "pages");
  const loader = join(dist, "js", "loader.js");
  if (existsSync(pagesDir) && existsSync(loader)) {
    const ver = Number((readFileSync(loader, "utf8").match(/TS_PAGES_V\s*=\s*(\d+)/) || [])[1]);
    const h = createHash("md5");
    for (const f of readdirSync(pagesDir).sort()) h.update(f).update(readFileSync(join(pagesDir, f)));
    const hash = h.digest("hex").slice(0, 12);
    const seen = manifest["assets/work/pages/*"];
    if (!Number.isFinite(ver)) { console.error("✗ อ่าน TS_PAGES_V จาก js/loader.js ไม่ได้"); bad++; }
    else if (seen && seen.v === ver && seen.hash !== hash) {
      console.error(`✗ ภาพใน assets/work/pages/ เปลี่ยนไปแล้วแต่ TS_PAGES_V ยังเป็น ${ver} — คนที่เคยเปิดการ์ดจะยังได้ภาพเก่า (บวกเลขใน js/loader.js)`);
      bad++;
    } else if (Number.isFinite(ver)) nextManifest["assets/work/pages/*"] = { v: ver, hash };
  }
}

/* ---- ไวยากรณ์ของ CSS: วงเล็บต้องปิดครบ -----------------------------------
   22/8/26: commit หนึ่งติด } เกินมาหนึ่งตัวใน styles.css แล้วขึ้นเว็บจริงไปทั้งอย่างนั้น
   ผลคือกฎที่อยู่ถัดจากจุดนั้นไม่ถูกใช้ ฮีโร่ทั้งบล็อกแตกเป็นแผ่นดำกางเป็นพัด —
   ไม่มี error ใน console ให้เห็นเลยเพราะเบราว์เซอร์กลืน CSS ที่พังเงียบๆ
   ด่านนี้จึงต้องอยู่ฝั่ง deploy ไม่ใช่รอคนสังเกตเอง: นับวงเล็บนอกคอมเมนต์/สตริง
   ถ้าไม่บาลานซ์ = ปล่อยไม่ได้ */
for (const f of copied.filter((f) => extname(f) === ".css")) {
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  let depth = 0, line = 1, firstBad = 0;
  for (const ch of src) {
    if (ch === "\n") line++;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth < 0 && !firstBad) firstBad = line; }
  }
  if (depth !== 0 || firstBad) {
    console.error(`✗ ${REL(f)} วงเล็บปีกกาไม่บาลานซ์ (ต่างกัน ${depth}${firstBad ? ` · เกินตัวแรกราวบรรทัด ${firstBad}` : ""}) — กฎที่อยู่ถัดจากจุดนั้นจะไม่ถูกใช้ทั้งหมด`);
    bad++;
  }
}

const mb = (copied.reduce((n, f) => n + statSync(f).size, 0) / 1048576).toFixed(1);
console.log(`\nประกอบแล้ว ${copied.length} ไฟล์ · ${mb} MB · ตกด่าน ${bad} ข้อ`);
/* ---- ด่านป้ายเดโม: noindex + ป้ายชื่อเรา ต้องครบทุกหน้าใน work/ ------------
   23/8/26: พอร์ตเลิกฝังวิดีโอแล้วให้กดลิงก์เข้าเดโมจริงแทน คนนอกจึงเปิดหน้าเดโม
   ตรงๆ ได้ ตอนไล่ดูพบว่า noindex ถูกใส่ด้วยมือทีละใบ เดโมหน้าเดียวมีครบ แต่เดโม
   5 หน้าทั้งสามใบไม่มีเลยสักหน้า รวม 27 หน้าที่เปิดให้ Google เก็บอยู่โดยไม่รู้ตัว
   ด่านนี้ไม่ต้องใช้เซิร์ฟเวอร์ จึงเป็นด่านตายได้ — เดโมใบใหม่ที่ลืมใส่จะไม่ได้ปล่อย */
try {
  execFileSync("node", [join(ROOT, "playbook", "mark-demos.mjs")], { stdio: "inherit" });
} catch { console.error("✗ mark-demos: มีหน้าเดโมที่ขาด noindex หรือป้ายชื่อ — สั่ง node playbook/mark-demos.mjs --apply"); bad++; }

/* ---- ด่านหัวข้อหายของเดโมหลายหน้า -----------------------------------------
   22/8/26: build-multi.mjs เคยตัดหัวข้อผิดบล็อกจนที่อยู่กับเวลาเปิดของหน้า /contact
   หายทั้งก้อน แล้วหลุดขึ้นเว็บไปโดยผมไม่รู้ เพราะผมถ่ายภาพครบแต่เปิดดูแค่สองหน้า
   ด่านนี้อ่านทุกหน้าที่ประกอบเสร็จ ไม่ใช่ตัวอย่าง — ของที่ตั้งใจไม่มีหัวต้องเขียน
   เหตุผลกำกับใน ALLOW ของ audit-heads.mjs ข้อยกเว้นที่ไม่มีคำอธิบาย = บั๊ก */
if (existsSync(join(ROOT, "work", "the-terrace-multi"))) {
  try {
    execFileSync("node", [join(ROOT, "playbook", "audit-heads.mjs")], { stdio: "inherit" });
  } catch { console.error("✗ audit-heads: มีหน้าที่หัวข้อหาย — แก้ก่อนปล่อย"); bad++; }
  /* audit-multi ต้องมีเซิร์ฟเวอร์ที่ 8099 จึงไม่บังคับเป็นด่านตาย แต่เตือนให้เห็นว่ายังไม่ได้รัน
     (ครั้งที่มันจับของจริงได้: ลิงก์ภายในไม่มี / ท้าย 11 จุด ซึ่งเป็น 404 บนโฮสต์ทั่วไป) */
  try {
    execFileSync("curl", ["-sf", "-o", "/dev/null", "-m", "2", "http://localhost:8099/"], { stdio: "ignore" });
    execFileSync("node", [join(ROOT, "playbook", "audit-multi.mjs"),
      "the-terrace-multi", "the-bed-multi", "glow-clinic-multi"], { stdio: "inherit" });
  } catch (e) {
    if (String(e).includes("audit-multi")) { bad++; }
    else console.log("! ข้าม audit-multi (ไม่มีเซิร์ฟเวอร์ที่ :8099) — รันเองก่อนปล่อยของสำคัญ");
  }
}

/* ---- ด่าน "เลื่อนหน้าแล้วลื่นไหม" -------------------------------------------
   22/8/26 — เดโม velvet-leaf เลื่อนอยู่ที่ 20fps มาตลอด (เพื่อนบ้าน 60fps ทุกใบ)
   และด่านทั้งเจ็ดตัวขึ้นเขียวหมด เพราะไม่มีตัวไหนวัด "เวลา" เลยสักตัว: ของครบ
   หน้าตาถูก ลิงก์เดินได้ ก็ผ่านหมด ทั้งที่คนกดเข้าไปเลื่อนแล้วรู้สึกหนืดทันที
   เจ้าของเว็บเป็นคนจับได้เอง ซึ่งคือนิยามของ "กฎที่ไม่มีเครื่องจับ" ใน ENGINE.md
   ต้องมีเซิร์ฟเวอร์ที่ 8099 เหมือน audit-multi จึงไม่บล็อกถ้าไม่มี */
if (existsSync(join(ROOT, "playbook", "audit-scroll.mjs"))) {
  try {
    execFileSync("curl", ["-sf", "-o", "/dev/null", "-m", "2", "http://localhost:8099/"], { stdio: "ignore" });
    execFileSync("node", [join(ROOT, "playbook", "audit-scroll.mjs"), "--all"], { stdio: "inherit" });
  } catch (e) {
    if (String(e.status) === "1") { console.error("✗ audit-scroll: มีหน้าที่เลื่อนแล้วกระตุก — แก้ก่อนปล่อย"); bad++; }
    else console.log("! ข้าม audit-scroll (ไม่มีเซิร์ฟเวอร์ที่ :8099) — รัน node playbook/audit-scroll.mjs --all เองก่อนปล่อยของสำคัญ");
  }
}

/* ---- ด่าน "จอมือถือ" -------------------------------------------------------
   23/8/26 — เจ้าของเว็บเปิดหน้าแรกด้วยหน้าต่างที่ย่อลงมา แล้วเห็นการ์ดผลงานเหลือเป็น
   แถบบางๆ สูง 39px ทั้งที่การ์ดสูง 200px ด่านทั้งหกตัวขึ้นเขียวหมด เพราะไม่มีตัวไหน
   เปิดหน้าเว็บบนจอแคบเลย: visual เทียบภาพที่ 1440px, regress อ่าน DOM ซึ่งของยัง
   อยู่ครบ (แค่ถูกครอบไม่ให้เห็น), audit-scroll วัด fps ซึ่งไม่เกี่ยว
   audit-mobile.mjs มีอยู่ในโฟลเดอร์นี้มาตลอด แต่ไม่เคยถูกต่อเข้าสายด่าน — มีเครื่องมือ
   แล้วไม่ได้เสียบ มีค่าเท่ากับไม่มี ตัวมันเองบล็อกเฉพาะหมวด "กล่องยุบจนเฉือนเนื้อหา"
   ส่วนหมวดปุ่มเล็ก/ตัวหนังสือเล็กเป็นรายงานให้อ่าน ตั้งใจเฉือน = --allow-cut */
if (existsSync(join(ROOT, "playbook", "audit-mobile.mjs"))) {
  try {
    execFileSync("curl", ["-sf", "-o", "/dev/null", "-m", "2", "http://localhost:8099/"], { stdio: "ignore" });
    execFileSync("node", [join(ROOT, "playbook", "audit-mobile.mjs"),
      ...(process.argv.includes("--allow-cut") ? ["--allow-cut"] : [])],
      { stdio: "inherit", env: { ...process.env, AUDIT_BASE: "http://localhost:8099" } });
  } catch (e) {
    /* รหัส 2 = เจอกล่องเฉือนจริง · รหัสอื่น = ด่านรันไม่จบ (เซิร์ฟเวอร์ตายกลางทาง ฯลฯ)
       แยกสองอย่างนี้เพราะเคยรายงานปนกันแล้วส่งให้ไปตามหาบั๊กที่ไม่มีอยู่ (24/8/69) */
    if (String(e.status) === "2") { console.error("✗ audit-mobile: มีกล่องที่เฉือนเนื้อหาทิ้งบนจอเล็ก — แก้ก่อนปล่อย (ตั้งใจเฉือน ใส่ --allow-cut)"); bad++; }
    else if (String(e.status) === "1") { console.error("✗ audit-mobile: ด่านรันไม่จบ (เซิร์ฟเวอร์ล่มกลางทาง?) — ยังไม่ได้ตรวจจริง อย่าอ่านว่าผ่าน"); bad++; }
    else console.log("! ข้าม audit-mobile (ไม่มีเซิร์ฟเวอร์ที่ :8099) — รัน node playbook/audit-mobile.mjs เองก่อนปล่อยของสำคัญ");
  }
}

/* ---- ด่าน "ของหายจากมือคนแก้" ---------------------------------------------
   ด่านทุกตัวข้างบนถามว่า "ของที่จะปล่อยถูกต้องไหม" ไม่มีตัวไหนถามว่า "เทียบกับที่คน
   เห็นอยู่ตอนนี้ มีอะไรหายไปไหม" — 22/8/26 หน้าผลงานถูกปล่อยขึ้นเว็บทั้งที่การ์ด Ijek
   กับ ScoreUp เหลือแต่กรอบ และด่านทุกตัวขึ้นเขียวหมด เพราะหน้าที่เนื้อหาหายก็ยัง
   "ทำงานปกติ" อยู่ดี ตัวนี้เทียบกับเว็บจริงที่ปล่อยไปแล้ว ฟ้องเฉพาะของที่หาย
   ตั้งใจตัดของออกจริง = สั่ง --allow-loss แล้วเขียนเหตุผลใน commit
   (ไม่มีเน็ต/เว็บล่ม = เตือนแล้วไปต่อ ไม่บล็อกการปล่อย) */
if (!process.argv.includes("--allow-loss")) {
  try {
    execFileSync("node", [join(ROOT, "playbook", "regress.mjs"), "--live"], { stdio: "inherit" });
  } catch (e) {
    if (String(e.status) === "1") { console.error("✗ regress: ของบนเว็บจริงจะหายไป — ตรวจก่อนปล่อย (ตั้งใจตัดออก ใส่ --allow-loss)"); bad++; }
    else console.log("! ข้าม regress (เทียบกับเว็บจริงไม่ได้) — รัน node playbook/regress.mjs เองก่อนปล่อยของสำคัญ");
  }
}

/* ---- ด่าน "กดแล้วไปถึงจริงไหม" ---------------------------------------------
   ไม่มีด่านไหนเคยกดลิงก์ออกนอกเลยสักเส้นจนถึง 22/8/26 — ปุ่มทักไลน์ อีเมล เบอร์โทร
   คือทางเดียวที่ลูกค้าติดต่อเรา ตายหนึ่งเส้นแปลว่าคนที่สนใจแล้วหายไปโดยเราไม่รู้ตัว
   ตรวจตอน deploy รวมยิงเน็ตด้วย เพราะเป็นจังหวะเดียวที่ของกำลังจะไปถึงลูกค้าจริง */
if (!process.argv.includes("--allow-links")) {
  try {
    execFileSync("node", [join(ROOT, "playbook", "links.mjs"), "--net"], { stdio: "inherit" });
  } catch (e) {
    if (String(e.status) === "1") { console.error("✗ links: มีลิงก์ในหน้าของเรากดไม่ได้ — แก้ก่อนปล่อย"); bad++; }
    else console.log("! ข้าม links (รันไม่สำเร็จ) — รัน node playbook/links.mjs --net เองก่อนปล่อย");
  }
}

/* ---- ด่าน "ย่อจอแล้วกระตุก" -------------------------------------------------
   ด่านอื่นถ่ายภาพที่ความกว้างคงที่ทีละขนาด (visual 1440 · audit-mobile 390) ของที่พัง
   เฉพาะ "ระหว่างทาง" ตอนคนลากขอบหน้าต่างจึงไม่มีใครเห็น 24/8/26 เจ้าของทักเรื่องนี้
   สองรอบ (แผ่นภาพฮีโร่ 149px · แถวตัวเลข 145px) ทั้งคู่หลุดทุกด่านมาก่อน
   รันเต็ม ~3 นาที — ถ้ารีบและไม่ได้แตะเลย์เอาต์ ข้ามด้วย --allow-resize ได้ */
if (!process.argv.includes("--allow-resize")) {
  try {
    execFileSync("node", [join(ROOT, "playbook", "audit-resize.mjs"), "--all"], { stdio: "inherit" });
  } catch (e) {
    if (String(e.status) === "1") { console.error("✗ resize: มีของกระโดดกลางการลากขอบจอ — แก้ก่อนปล่อย (ตั้งใจ/ไม่เกี่ยว ใส่ --allow-resize)"); bad++; }
    else console.log("! ข้าม resize (รันไม่สำเร็จ) — รัน node playbook/audit-resize.mjs --all เองก่อนปล่อย");
  }
}

/* ---- ด่าน "หน้าตาเพี้ยน" ----------------------------------------------------
   regress.mjs อ่าน DOM จับได้แค่ของหาย ส่วนของที่อยู่ครบแต่แสดงผลผิด (โลโก้ไข่ดาว
   กลายเป็นก้อนดำเพราะ CSS ไม่ข้าม shadow tree) DOM ถูกทุกตัวอักษร ด่านทุกตัวจึงเขียว
   ตัวนี้เทียบภาพจริงทีละแถบกับเว็บที่คนเห็นอยู่ ค่าเริ่มต้นเทียบ 4 หน้าหลัก (~1.5 นาที)
   แตะของในเดโมเมื่อไหร่ ให้รัน node playbook/visual.mjs --all เองก่อนปล่อย
   หน้าตาเปลี่ยนเพราะตั้งใจ = --allow-visual แล้วเปิดภาพส่วนต่างดูก่อนว่าตรงที่ตั้งใจจริง */
if (!process.argv.includes("--allow-visual")) {
  try {
    execFileSync("node", [join(ROOT, "playbook", "visual.mjs")], { stdio: "inherit" });
  } catch (e) {
    if (String(e.status) === "1") { console.error("✗ visual: หน้าตาเปลี่ยนเกินปกติ — ดูภาพส่วนต่างก่อนปล่อย (ตั้งใจเปลี่ยน ใส่ --allow-visual)"); bad++; }
    else console.log("! ข้าม visual (เทียบกับเว็บจริงไม่ได้) — รัน node playbook/visual.mjs เองก่อนปล่อยของสำคัญ");
  }
}

if (bad) { console.error("\nยังปล่อยไม่ได้ — แก้ให้หมดก่อน (dist ทิ้งไว้ที่ " + dist + ")"); process.exit(1); }
if (DRY) { console.log("--dry: ไม่ปล่อยขึ้นเว็บ · dist อยู่ที่ " + dist); process.exit(0); }

console.log(`\nกำลังปล่อยขึ้น Cloudflare Pages (${PROJECT}) ...`);
/* 24/8/26 Node 22 บนวินโดวส์ไม่ยอม spawn ไฟล์ .cmd ตรงๆ (EINVAL) และไม่มี "npx" ที่ไม่ใช่ .cmd
   ให้เรียกผ่านเชลล์เฉพาะวินโดวส์ ส่วนแมคใช้ทางเดิม */
if (process.platform === "win32")
  execSync(`npx wrangler pages deploy "${dist}" --project-name=${PROJECT} --branch=main`,
    { stdio: "inherit", cwd: ROOT });
else
  execFileSync("npx", ["wrangler", "pages", "deploy", dist, "--project-name=" + PROJECT, "--branch=main"],
    { stdio: "inherit", cwd: ROOT });
writeFileSync(manifestPath, JSON.stringify(nextManifest, null, 2) + "\n");   // จำลายนิ้วมือของรอบนี้ไว้เทียบรอบหน้า
rmSync(dist, { recursive: true, force: true });
if (archiveDir) rmSync(archiveDir, { recursive: true, force: true });
console.log("\nเว็บจริง: https://tarmsung.pages.dev  (URL ที่ขึ้นต้นด้วยรหัสคือสแนปช็อตของ deploy นั้น อย่าส่งให้ลูกค้า)");
