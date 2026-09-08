#!/usr/bin/env node
/* =============================================================================
   links.mjs — ด่าน "กดแล้วไปถึงจริงไหม" (22/8/26)
   ใช้:  node playbook/links.mjs            # ทุกหน้าที่จะขึ้นเว็บ (ไม่ยิงเน็ต)
        node playbook/links.mjs --net       # ยิงลิงก์ออกนอกจริงด้วย (ช้ากว่า)

   ทำไมต้องมี ทั้งที่มี audit-multi.mjs แล้ว
   audit-multi เดินลิงก์ภายในของ "เดโม 5 หน้า" สามใบเท่านั้น ตรวจแล้วมันไม่แตะลิงก์
   ออกนอกเลยสักเส้น แปลว่าปุ่มที่หาเงินให้เราจริงๆ — ทักไลน์ · อีเมล · เบอร์โทร ·
   ลิงก์ผลงานในหน้าแรก — ไม่เคยถูกกดโดยด่านไหนเลยตั้งแต่ทำเว็บมา
   ลิงก์ติดต่อตายหนึ่งเส้น = ลูกค้าที่สนใจแล้วหายไปเงียบๆ โดยไม่มีใครรู้ว่าเคยมี

   แยกสองชั้น เพราะสองชนิดหน้ามีมาตรฐานคนละอย่างจริงๆ (ไม่ใช่การยกเว้นให้พ้นๆ ไป)
   - หน้าเว็บของเราเอง (index/reference/privacy/404) = ของจริง ปุ่มตายหนึ่งปุ่มเสียเงินจริง
     ตรวจเข้ม ตกแล้วบล็อกการปล่อย
   - หน้าเดโมใน work/ = ร้านสมมติ เมนู "ตะกร้า/รับประกัน/ติดตามพัสดุ" เป็นฉากประกอบที่
     ตั้งใจไม่ต่อของจริง (จะต่อก็ไม่มีของให้ต่อ) จึงรายงานเป็นยอดรวมให้เห็น ไม่บล็อก
     แต่ลิงก์ที่ชี้ไปไฟล์ที่ไม่มีจริง = บล็อกทุกหน้าเท่ากัน เพราะนั่นคือ 404 ของจริง

   ตรวจสามชนิด ด้วยกลไกเดียวกันทุกหน้า:
   1. ลิงก์ภายใน — ไฟล์ปลายทางมีอยู่จริงใน "ชุดที่จะขึ้นเว็บ" ไหม (ไม่ใช่แค่มีในรีโป:
      work/parcela ยังอยู่ในรีโปแต่ถูกกันไม่ให้ขึ้นเว็บ ลิงก์ไปหามัน = 404 ให้ลูกค้า)
   2. #จุดยึดในหน้า — id ที่ชี้ไปมีจริงไหม (เมนูที่กดแล้วไม่ไปไหนคือเมนูพัง)
   3. ปุ่มตาย — href ว่าง, "#", javascript:void(0) ที่ไม่มีสคริปต์รับช่วง
   และตรวจ "ความสอดคล้องของช่องทางติดต่อ": อีเมล/เบอร์/ไลน์ ต้องเป็นชุดเดียวกันทั้งเว็บ
   เบอร์ผิดหนึ่งที่ในหน้าเดียว แย่กว่าลิงก์เสีย เพราะมันดูใช้ได้จนกว่าจะมีคนโทรไม่ติด
   ========================================================================== */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NET = process.argv.includes("--net");

/* 24/8/26 พาธบนวินโดวส์เป็น `workglow-clinicindex.html` ทั้ง OFF_SITE และ OURS เทียบด้วย "/"
   ทั้งคู่จึงพลาดบนเครื่องนี้: ไฟล์ _src ที่ไม่ได้ขึ้นเว็บถูกเอามาตรวจ และหน้าเดโมถูกนับเป็น
   หน้าของเราเอง ลิงก์แบรนด์สมมติที่ตายโดยตั้งใจเลยบล็อกการปล่อยเว็บ — ปรับพาธเป็น "/" ที่ต้นทาง */
const REL = (p) => relative(ROOT, p).split(sep).join("/");

/* ชุดหน้าที่ตรวจ = ทุก .html ที่ deploy.mjs จะอัปขึ้นเว็บ — กันเองไว้ให้ตรงกับ SKIP ของ deploy
   ถ้าสองลิสต์นี้หลุดจากกันเมื่อไหร่ ด่านจะตรวจของที่ไม่ได้ขึ้นเว็บ (หรือปล่อยของที่ขึ้น) */
const OFF_SITE = (rel) => /^work\/parcela(\/|$)/.test(rel) || /(^|\/)_/.test(rel);
const htmlFiles = (dir, out = []) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.name.startsWith(".") || f.name === "node_modules" || f.name === "_archive" || f.name === "design") continue;
    const p = join(dir, f.name);
    if (f.isDirectory()) htmlFiles(p, out);
    else if (extname(f.name) === ".html" && !OFF_SITE(REL(p))) out.push(p);
  }
  return out;
};

/* ตัดคอมเมนต์ "และ <script>" ออกก่อนหาลิงก์ — 24/8/69 ด่านนี้ฟ้องว่า glow-clinic
   มีลิงก์ตายชี้ไป programs/'+r.slug+'/ ซึ่งไม่ใช่ลิงก์จริง แต่เป็นสตริงใน JS ที่ประกอบ
   href ตอนรันไทม์ ตัวตรวจลิงก์แบบอ่านไฟล์มองไม่ออกว่าอันไหนเป็นโค้ด
   ของที่อยู่ใน <script> ไม่ใช่ลิงก์บนหน้า จึงไม่ควรถูกนับตั้งแต่แรก */
const strip = (html) => html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const attrs = (html, re) => [...strip(html).matchAll(re)].map((m) => m[1]);

/* ลิงก์ภายในชี้ไปไฟล์ที่ขึ้นเว็บจริงไหม — เลียนวิธีที่โฮสต์คลี่ URL:
   "x/" -> x/index.html · "x" -> x.html หรือ x/index.html */
const resolves = (fromFile, href) => {
  const clean = href.split("#")[0].split("?")[0];
  if (!clean) return true;
  const base = dirname(fromFile);
  const abs = clean.startsWith("/") ? join(ROOT, clean.slice(1)) : resolve(base, clean);
  const rel = REL(abs);
  if (rel.startsWith("..")) return true;                 // ออกนอกรีโป ไม่ใช่หน้าที่ของด่านนี้
  if (OFF_SITE(rel)) return false;                       // มีในรีโปแต่ไม่ขึ้นเว็บ = 404 สำหรับลูกค้า
  for (const c of [abs, abs + ".html", join(abs, "index.html")])
    if (existsSync(c) && statSync(c).isFile()) return true;
  return existsSync(abs) && statSync(abs).isDirectory() && existsSync(join(abs, "index.html"));
};

const OURS = (rel) => !rel.startsWith("work/");   // หน้าเว็บของเราเอง ไม่ใช่เดโมของลูกค้าสมมติ
const problems = [];
const demoNotes = { placeholder: 0, anchor: 0, emptyContact: 0, deadExternal: [], pages: new Set() };
const externals = new Map();      // url -> [หน้าที่อ้างถึง]
const contacts = { mail: new Map(), tel: new Map(), line: new Map() };

for (const file of htmlFiles(ROOT)) {
  const rel = REL(file);
  const html = readFileSync(file, "utf8");
  const ids = new Set(attrs(html, /\sid="([^"]+)"/g));
  const hrefs = attrs(html, /<a\b[^>]*\shref="([^"]*)"/g);

  for (const href of hrefs) {
    const h = href.trim();
    if (!h || h === "#" || /^javascript:/i.test(h)) {
      if (OURS(rel)) problems.push(`${rel} — ปุ่มที่ไม่พาไปไหน href="${h}"`);
      else { demoNotes.placeholder++; demoNotes.pages.add(rel); }
      continue;
    }
    if (h.startsWith("#")) {
      /* #top เป็นจุดยึดที่เบราว์เซอร์รู้จักเอง (กลับไปหัวหน้า) ไม่ต้องมี id จริง */
      if (h !== "#top" && !ids.has(h.slice(1))) {
        if (OURS(rel)) problems.push(`${rel} — ${h} ไม่มีจุดยึดนี้ในหน้า`);
        else { demoNotes.anchor++; demoNotes.pages.add(rel); }
      }
      continue;
    }
    /* ช่องทางติดต่อ: เทียบความสอดคล้องเฉพาะหน้าของเราเอง เพราะเบอร์/อีเมลในเดโมเป็นของ
       แบรนด์สมมติคนละแบรนด์ ย่อมไม่ตรงกันอยู่แล้ว แต่ "ว่างเปล่า" ผิดทุกหน้าเท่ากัน —
       ปุ่มโทรที่กดแล้วไม่มีเบอร์ ลูกค้าที่มาดูเดโมก็เจอ */
    if (/^mailto:/i.test(h)) {
      const v = h.slice(7).split("?")[0];
      if (!v) { OURS(rel) ? problems.push(`${rel} — mailto: ว่าง ไม่มีอีเมลปลายทาง`) : (demoNotes.emptyContact++, demoNotes.pages.add(rel)); }
      else if (OURS(rel)) contacts.mail.set(v, [...(contacts.mail.get(v) || []), rel]);
      continue;
    }
    if (/^tel:/i.test(h)) {
      const v = h.slice(4).replace(/[\s-]/g, "");
      if (!v) { OURS(rel) ? problems.push(`${rel} — tel: ว่าง ไม่มีเบอร์ปลายทาง`) : (demoNotes.emptyContact++, demoNotes.pages.add(rel)); }
      else if (OURS(rel)) contacts.tel.set(v, [...(contacts.tel.get(v) || []), rel]);
      continue;
    }
    if (/^https?:/i.test(h)) {
      if (/line\.me|lin\.ee/i.test(h) && OURS(rel)) contacts.line.set(h, [...(contacts.line.get(h) || []), rel]);
      externals.set(h, [...(externals.get(h) || []), rel]);
      continue;
    }
    if (!resolves(file, h)) problems.push(`${rel} — ลิงก์ภายในไปหาไฟล์ที่ไม่ได้ขึ้นเว็บ: ${h}`);
  }
}

/* ---- ช่องทางติดต่อต้องเป็นชุดเดียวกันทั้งเว็บ ------------------------------
   ไม่ตัดสินว่าอันไหน "ถูก" — ด่านไม่มีทางรู้ แต่ "มีมากกว่าหนึ่งชุด" คือของที่ต้องมีคนดู
   เสมอ เพราะแปลว่าลูกค้าคนละหน้าได้เบอร์คนละเบอร์ */
for (const [kind, label] of [["mail", "อีเมล"], ["tel", "เบอร์โทร"], ["line", "ลิงก์ไลน์"]]) {
  const m = contacts[kind];
  if (m.size > 1) problems.push(`${label}ในหน้าเว็บของเราไม่ตรงกัน ${m.size} ชุด — ` +
    [...m.entries()].map(([v, pages]) => `${v} (${pages.length} หน้า)`).join(" · "));
}

/* ---- ลิงก์ออกนอก ---------------------------------------------------------- */
let netNote = `ลิงก์ออกนอก ${externals.size} เส้น (ไม่ได้ยิงเช็ค — ใส่ --net ถ้าจะเช็คจริง)`;
if (NET) {
  /* ใส่ User-Agent ของเบราว์เซอร์จริง: เว็บใหญ่หลายเจ้า (pexels) ตอบ 403 ให้ทุก request
     ที่ไม่มี UA แล้วด่านจะฟ้องว่าลิงก์ตายทั้งที่คนกดแล้วเข้าได้ปกติ */
    const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };
  const results = await Promise.all([...externals.keys()].map(async (url) => {
    try {
      let r = await fetch(url, { method: "HEAD", redirect: "follow", headers: UA, signal: AbortSignal.timeout(12000) });
      // บางเซิร์ฟเวอร์ตอบ 405/403/404 ให้ HEAD แต่ปกติดีกับ GET — ถามซ้ำก่อนตัดสินว่าตาย
      if (!r.ok) r = await fetch(url, { method: "GET", redirect: "follow", headers: UA, signal: AbortSignal.timeout(12000) });
      return { url, ok: r.ok, status: r.status };
    } catch (e) { return { url, ok: false, status: e.name === "TimeoutError" ? "หมดเวลา" : "ต่อไม่ติด" }; }
  }));
  for (const r of results.filter((r) => !r.ok)) {
    const where = externals.get(r.url);
    /* 401/403/429 = เจ้าของเว็บกันบอท ไม่ใช่ลิงก์ตาย — รายงานว่า "ตรวจไม่ได้" ไม่ใช่ตก
       ด่านที่ฟ้องของที่คนกดแล้วเข้าได้ คือด่านที่สอนให้คนเลิกเชื่อผลของมัน */
    if ([401, 403, 429].includes(r.status)) { demoNotes.deadExternal.push(`ตรวจไม่ได้ (${r.status}) ${r.url}`); continue; }
    // ลิงก์ในเดโมเป็นของแบรนด์สมมติ (@baansuan.demo) ตายอยู่แล้วโดยตั้งใจ — นับไว้ ไม่บล็อก
    if (where.every((w) => !OURS(w))) { demoNotes.deadExternal.push(`${r.status} ${r.url}`); continue; }
    problems.push(`ลิงก์ออกนอกในหน้าของเรากดไม่ได้ (${r.status}): ${r.url} — อยู่ใน ${where.filter(OURS).slice(0, 3).join(", ")}`);
  }
  netNote = `ยิงเช็คลิงก์ออกนอกแล้ว ${externals.size} เส้น`;
}

console.log(netNote);
if (demoNotes.placeholder || demoNotes.anchor || demoNotes.emptyContact)
  console.log(`เดโม (แบรนด์สมมติ ไม่บล็อกการปล่อย): ปุ่มฉากประกอบ ${demoNotes.placeholder} · #จุดยึดที่ไม่มีจริง ${demoNotes.anchor}`
    + ` · ปุ่มติดต่อว่างเปล่า ${demoNotes.emptyContact} — ใน ${demoNotes.pages.size} หน้า`);
if (demoNotes.deadExternal.length)
  console.log(`ลิงก์ออกนอกที่ไม่บล็อก ${demoNotes.deadExternal.length} เส้น — ${demoNotes.deadExternal.slice(0, 3).join(" · ")}${demoNotes.deadExternal.length > 3 ? " …" : ""}`);
if (!problems.length) { console.log(`✅ ลิงก์กดได้ทุกเส้น — ตรวจ ${htmlFiles(ROOT).length} หน้า`); process.exit(0); }
console.log(`❌ ลิงก์มีปัญหา ${problems.length} จุด — ปุ่มที่กดไม่ได้คือลูกค้าที่หายไปเงียบๆ`);
problems.forEach((p) => console.log("   " + p));
process.exit(1);
