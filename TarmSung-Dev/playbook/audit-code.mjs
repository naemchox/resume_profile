#!/usr/bin/env node
/* =============================================================================
   audit-code.mjs — ด่านตรวจ "โค้ดสะอาด" ของเว็บตามสั่ง
   ใช้: node playbook/audit-code.mjs           # รายงานทุกข้อ
        node playbook/audit-code.mjs --quiet   # ขึ้นเฉพาะข้อที่ตก (ไว้ใส่ CI)

   ต่างจาก playbook/deploy.mjs ตรงไหน: deploy คุม "ของที่กำลังจะขึ้นเว็บถูกต้องไหม"
   (เลขรุ่น ไฟล์ที่ต้องขึ้น) ไฟล์นี้คุม "ของในรีโปยังสะอาดอยู่ไหม" — ของตายที่ไม่มีใคร
   ใช้แล้ว คอมเมนต์ที่พูดถึงของที่ถูกลบไปแล้ว กลไกซ้ำสองชุด ฯลฯ ซึ่ง deploy ไม่สนใจ
   เพราะมันไม่ทำให้เว็บพัง แต่มันคือสิ่งที่ทำให้แก้ครั้งหน้าพลาด

   กติกาที่ยึด (จาก CLAUDE.md ของเจ้าของรีโป):
     · ของชนิดเดียวกันต้องใช้กลไกเดียวกัน — ตรวจ selector/กติกาที่แตกเป็นสองชุด
     · ข้อยกเว้นต้องมีเหตุผลกำกับ — คอมเมนต์ที่อ้างของที่ไม่มีอยู่แล้ว = หนี้
     · SKIP ≠ PASS — ทุกข้อที่ข้ามต้องบอกว่าข้ามเพราะอะไร
   ========================================================================== */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUIET = process.argv.includes("--quiet");

/* ---- อะไรคือ "ของที่ขึ้นเว็บ" -------------------------------------------
   ลิสต์เดียวกับ deploy.mjs โดยตั้งใจ: ถ้าสองไฟล์นี้มองคนละชุด ผลตรวจจะโกหก */
const PAGES = ["index.html", "reference.html", "privacy.html", "404.html"];
const CODE_DIRS = ["css", "js"];
const ASSET_DIRS = ["assets"];

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const walk = (dir, out = []) => {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    /* 24/8/26 join() บนวินโดวส์คืน "assetsemojix.webp" แต่ทุกกฎในไฟล์นี้เทียบกับพาธแบบ "/"
       ที่เขียนอยู่ในหน้าเว็บ ผลคือกฎ dead-asset ฟ้องไฟล์ที่ใช้งานอยู่ 206 ไฟล์รวด = ด่านที่ไม่มีใครอ่าน */
    const rel = join(dir, name).split(sep).join("/");
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};

const pages = PAGES.filter((p) => existsSync(join(ROOT, p)));
const codeFiles = CODE_DIRS.flatMap((d) => walk(d)).filter((f) => /\.(css|js)$/.test(f));
const assetFiles = ASSET_DIRS.flatMap((d) => walk(d));
const sources = [...pages, ...codeFiles];
const text = Object.fromEntries(sources.map((f) => [f, read(f)]));
const allText = sources.map((f) => text[f]).join("\n");

const findings = [];
const report = (level, rule, msg, items = []) => findings.push({ level, rule, msg, items });

/* ---- 1. ของตาย: ไฟล์ใน assets/ ที่ไม่มีใครอ้างถึง ------------------------
   อ้างถึงได้สองทาง: เขียนพาธตรงๆ ในมาร์กอัป/ซีเอสเอส หรือประกอบพาธด้วย js
   (เช่น "assets/work/pages/" + name + ".webp") ตัวที่สองจับด้วยการดูว่าโฟลเดอร์
   นั้นถูกประกอบในโค้ดไหม แล้วเช็คว่าชื่อไฟล์โผล่เป็นสตริงที่ไหนสักแห่งหรือเปล่า */
const jsBuiltDirs = [...allText.matchAll(/["'`](assets\/[\w/-]+\/)["'`]/g)].map((m) => m[1]);
/* ของที่ deploy.mjs กันไม่ให้ขึ้นเว็บอยู่แล้ว ไม่ใช่ "ของตายในเว็บ" — มันคือไฟล์
   งานออกแบบ/โฆษณาที่ตั้งใจเก็บไว้ในรีโป ตรวจแล้วจะกลายเป็นเสียงรบกวน */
const NOT_SHIPPED = [/^assets\/cover.*\.png$/, /^assets\/og-image\.png$/];
const deadAssets = assetFiles.filter((f) => {
  if (NOT_SHIPPED.some((re) => re.test(f))) return false;
  const base = f.split("/").pop();
  const stem = base.replace(/\.[a-z0-9]+$/i, "");
  if (allText.includes(f) || allText.includes(base)) return false;
  // ชื่อที่ js ประกอบเอง: ต้องอยู่ในโฟลเดอร์ที่ถูกประกอบ และมีชื่อฐานโผล่ในโค้ด
  const dir = f.slice(0, f.lastIndexOf("/") + 1);
  const family = stem.replace(/-\d+(-t)?$/, "").split("-")[0];   // ijek-3-t → ijek · 1f917-anim → 1f917
  if (jsBuiltDirs.some((d) => dir.startsWith(d)) && (allText.includes(stem.replace(/-\d+(-t)?$/, "")) || allText.includes(family))) return false;
  return true;
});
if (deadAssets.length) report("warn", "dead-asset", `ไฟล์ใน assets/ ที่ไม่มีหน้าไหนอ้างถึง (${deadAssets.length} ไฟล์)`, deadAssets);

/* ---- 2. เลขรุ่นหาย: URL ที่ประกอบใน js แล้วไม่มี ?v ----------------------
   _headers ตั้ง /assets/* เป็น immutable หนึ่งปี URL ที่ไม่มี ?v = ของเก่าค้าง
   ในเครื่องคนที่เคยเข้าเว็บ และด่านของ deploy.mjs มองไม่เห็นเพราะมันอ่าน HTML */
const unversioned = [];
for (const f of codeFiles) {
  for (const m of text[f].matchAll(/["'`](assets\/[\w/.-]+\.(?:webp|png|jpg|jpeg|svg|mp4|webm))["'`]/g)) {
    if (!m[1].includes("?v=")) unversioned.push(`${f}: ${m[1]}`);
  }
  // แบบต่อสตริง: "assets/..." + name + ".webp"  — ดูว่าบรรทัดนั้นมี ?v ไหม
  for (const line of text[f].split("\n")) {
    /* บรรทัดที่ต่อด้วยตัวแปรชื่อ query/ver/v ก็คือใส่เลขรุ่นแล้ว แค่ไม่ได้เขียนตรงๆ */
    const hasVersionVar = /\b(query|ver|version|_V)\b/.test(line);
    if (/["'`]assets\/[\w/-]+\/["'`]\s*\+/.test(line) && !/\?v=/.test(line) && !hasVersionVar)
      unversioned.push(`${f}: ${line.trim().slice(0, 90)}`);
  }
}
if (unversioned.length) report("fail", "asset-no-version", `URL ของไฟล์ static ที่ประกอบในโค้ดแล้วไม่มี ?v (${unversioned.length} จุด)`, unversioned);

/* ---- 3. คลาสที่มีสไตล์แต่ไม่มีใครใช้ -------------------------------------
   ดูเฉพาะคลาสที่ "เขียนเป็น selector ตรงๆ" ไม่รวมที่อยู่ในคอมเมนต์ */
const cssOnly = codeFiles.filter((f) => f.endsWith(".css"));
const markupAndJs = [...pages, ...codeFiles.filter((f) => f.endsWith(".js"))].map((f) => text[f]).join("\n");
const declared = new Set();
for (const f of cssOnly) {
  const body = text[f].replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of body.matchAll(/\.([a-zA-Z][\w-]{2,})(?=[^{}]*\{)/g)) declared.add(m[1]);
}
/* โทเคนที่ถูกใช้จริง = ทุกคำใน class="..." ของทุกหน้า + ทุกสตริงในโค้ด js
   (การ์ดกับหน้าต่างสร้างคลาสด้วย js เยอะ) เทียบด้วยเซ็ต ไม่ใช่ regex เดา ไม่งั้น
   ได้ผลบวกลวงจนไม่มีใครอ่านรายงาน */
const usedTokens = new Set();
for (const p of pages)
  for (const m of text[p].matchAll(/class="([^"]+)"/g))
    m[1].split(/\s+/).forEach((t) => usedTokens.add(t));
for (const f of codeFiles.filter((x) => x.endsWith(".js"))) {
  const body = text[f].replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of body.matchAll(/["'`]([\w -]{3,})["'`]/g))
    m[1].split(/\s+/).forEach((t) => usedTokens.add(t));
}
const unusedClasses = [...declared].filter((c) => !usedTokens.has(c));
if (unusedClasses.length) report("warn", "dead-css", `คลาสที่มีสไตล์แต่ไม่มีในมาร์กอัป/โค้ด (${unusedClasses.length} คลาส)`, unusedClasses);

/* ---- 4. คอมเมนต์ที่อ้างของที่ไม่มีอยู่แล้ว --------------------------------
   คอมเมนต์ในรีโปนี้คือเอกสารหลัก (ทุกกฎมีเหตุผลกำกับ) คอมเมนต์ที่พูดถึงคลาสหรือ
   ฟังก์ชันที่ถูกลบไปแล้ว = คนอ่านรอบหน้าจะไปตามหาของที่ไม่มี */
const stale = [];
for (const f of codeFiles) {
  const comments = [...text[f].matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
  for (const c of comments) {
    for (const m of c.matchAll(/[.#]([a-z][\w-]{4,})\b/g)) {
      const id = m[1];
      if (declared.has(id)) continue;
      const usedAnywhere = new RegExp(`[."'\`#]${id}\\b`).test(markupAndJs.replace(/\/\*[\s\S]*?\*\//g, ""));
      if (!usedAnywhere) stale.push(`${f}: .${id}`);
    }
  }
}
const staleUniq = [...new Set(stale)];
if (staleUniq.length) report("warn", "stale-comment", `คอมเมนต์อ้างถึงคลาส/ไอดีที่ไม่มีอยู่แล้ว (${staleUniq.length} จุด)`, staleUniq);

/* ---- 5. กลไกซ้ำ: selector เดียวกันถูกประกาศหลายที่ห่างกัน ----------------
   ประกาศซ้ำใกล้ๆ กัน (ต่อกันเป็นบล็อก) ถือว่าจงใจ แต่ถ้าห่างกันเกิน 200 บรรทัด
   แปลว่าคนละบล็อกความคิด = ของชนิดเดียวกันสองกลไก ซึ่งจะเพี้ยนจากกันวันหนึ่ง */
const dupes = [];
for (const f of cssOnly) {
  const lines = text[f].split("\n");
  const seen = new Map();
  lines.forEach((line, i) => {
    const m = line.match(/^([.#][\w-]+(?:\s*,\s*[.#][\w-]+)*)\s*\{/);
    if (!m) return;
    const key = m[1].trim();
    if (seen.has(key) && i - seen.get(key) > 200) dupes.push(`${f}: ${key} (บรรทัด ${seen.get(key) + 1} และ ${i + 1})`);
    seen.set(key, i);
  });
}
if (dupes.length) report("warn", "split-mechanism", `selector เดียวกันถูกประกาศห่างกันเกิน 200 บรรทัด (${dupes.length} จุด)`, dupes);

/* ---- 6. ของที่หลุดจากโต๊ะทำงาน ------------------------------------------- */
const debris = [];
for (const f of codeFiles) {
  text[f].split("\n").forEach((line, i) => {
    if (/^\s*(console\.(log|debug)|debugger\b)/.test(line)) debris.push(`${f}:${i + 1} ${line.trim().slice(0, 70)}`);
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line) && !line.includes("audit-code")) debris.push(`${f}:${i + 1} ${line.trim().slice(0, 70)}`);
  });
}
if (debris.length) report("warn", "debris", `console.log / debugger / TODO ที่ค้างในไฟล์ที่ขึ้นเว็บ (${debris.length} จุด)`, debris);

/* ---- 7. width/height ในมาร์กอัปต้องตรงกับไฟล์จริง ------------------------
   ผิด = เบราว์เซอร์จองที่ผิด หน้ากระตุกตอนรูปมาถึง (CLS) อ่านหัวไฟล์เอง ไม่พึ่ง
   เครื่องมือนอก: png / webp (VP8, VP8L, VP8X) / jpeg */
function imageSize(abs) {
  const b = readFileSync(abs);
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") {
    const tag = b.slice(12, 16).toString();
    if (tag === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (tag === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (tag === "VP8X") return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const marker = b[o + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
      o += 2 + b.readUInt16BE(o + 2);
    }
  }
  return null;
}
const sizeMismatch = [];
for (const p of pages) {
  for (const m of text[p].matchAll(/<img[^>]*?src="([^"]+)"[^>]*?width="(\d+)"[^>]*?height="(\d+)"[^>]*>/g)) {
    const src = m[1].split("?")[0];
    const abs = join(ROOT, src);
    if (!existsSync(abs)) { sizeMismatch.push(`${p}: ${src} — ไม่มีไฟล์นี้`); continue; }
    const real = imageSize(abs);
    if (!real) continue;
    const wantW = +m[2], wantH = +m[3];
    const ratioReal = real.w / real.h, ratioAttr = wantW / wantH;
    if (Math.abs(ratioReal - ratioAttr) > 0.02)
      sizeMismatch.push(`${p}: ${src} — มาร์กอัป ${wantW}x${wantH} แต่ไฟล์จริง ${real.w}x${real.h}`);
  }
}
if (sizeMismatch.length) report("fail", "img-size", `สัดส่วน width/height ในมาร์กอัปไม่ตรงกับไฟล์จริง (${sizeMismatch.length} จุด)`, sizeMismatch);

/* ---- 8. ไฟล์หนักผิดปกติที่จะขึ้นเว็บ ------------------------------------- */
const heavy = assetFiles
  .filter((f) => !NOT_SHIPPED.some((re) => re.test(f)))   /* ไฟล์ที่ deploy กันไว้ ไม่ได้กินเน็ตของใคร */
  .map((f) => ({ f, mb: statSync(join(ROOT, f)).size / 1048576 }))
  .filter((x) => x.mb > 3)
  .map((x) => `${x.f} — ${x.mb.toFixed(1)}MB`);
if (heavy.length) report("warn", "heavy-file", `ไฟล์ที่ขึ้นเว็บและหนักเกิน 3MB (${heavy.length} ไฟล์)`, heavy);

/* ---- 9. สคริปต์ทดลองที่ค้างอยู่ราก ---------------------------------------
   playbook/ คือที่ของสคริปต์ที่ "ใช้ซ้ำได้และมีคนดูแล" ส่วน _*.mjs ที่รากคือของ
   ที่เขียนใช้ครั้งเดียว — ค้างไว้แปลว่าอีกหกเดือนไม่มีใครรู้ว่าอันไหนยังใช้ได้ */
const scratch = readdirSync(ROOT).filter((f) => /^_.*\.(mjs|js|py)$/.test(f));
if (scratch.length) report("info", "scratch-script", `สคริปต์ทดลองค้างที่รากรีโป (${scratch.length} ไฟล์) — ย้ายเข้า playbook/ หรือลบ`, scratch);

/* ---- รายงาน -------------------------------------------------------------- */
const order = { fail: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.level] - order[b.level]);
const icon = { fail: "✗", warn: "▲", info: "·" };
let fails = 0;
for (const f of findings) {
  if (f.level === "fail") fails++;
  if (QUIET && f.level === "info") continue;
  console.log(`${icon[f.level]} [${f.rule}] ${f.msg}`);
  const show = QUIET ? f.items.slice(0, 5) : f.items.slice(0, 25);
  for (const it of show) console.log(`    ${it}`);
  if (f.items.length > show.length) console.log(`    … อีก ${f.items.length - show.length} รายการ`);
}
if (!findings.length) console.log("✓ สะอาด — ไม่พบข้อที่ต้องแก้");
else console.log(`\nสรุป: ตก ${fails} ข้อ · เตือน ${findings.filter((f) => f.level === "warn").length} ข้อ · ข้อสังเกต ${findings.filter((f) => f.level === "info").length} ข้อ`);
process.exitCode = fails ? 1 : 0;
