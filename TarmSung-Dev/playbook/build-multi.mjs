#!/usr/bin/env node
/* =============================================================================
   build-multi.mjs — เครื่องประกอบเว็บหลายหน้า (เดโมแพ็ก ฿7,500)
   ใช้:  node work/<เดโม>/_build.mjs      (ไฟล์นั้นเรียกตัวนี้อีกที)

   ทำไมเป็นของกลาง ไม่ใช่สคริปต์ในโฟลเดอร์เดโมแต่ละใบ:
   ตัวแรก (the-terrace-multi) เขียนไว้ในโฟลเดอร์ตัวเอง พอจะทำใบที่สองก็จะได้
   _build.mjs สองตัวที่ทำเรื่องเดียวกันคนละแบบ แล้ววันหนึ่งใบหนึ่งได้ canonical
   อีกใบไม่ได้ โดยไม่มีใครรู้ — ของชนิดเดียวกันต้องออกมาจากกลไกเดียวกัน
   ส่วนที่ต่างกันจริงของแต่ละแบรนด์ (เปลือก HTML · เมนู · หน้า · เนื้อหา) อยู่ใน
   work/<เดโม>/_src/ ทั้งหมด ไฟล์นี้ไม่รู้จักแบรนด์ไหนเลย

   สิ่งที่ไฟล์นี้รับประกันให้ทุกเดโม (นี่คือของที่แพ็ก ฿7,500 ขาย):
   - title / description / canonical / OG แยกต่อหน้า
   - เมนูชุดเดียวโผล่สามที่ (บนหัว · แถบมือถือ · ท้ายหน้า) และรู้ว่าอยู่หน้าไหน
   - breadcrumb · หน้า 404 · sitemap.xml ที่ตรงกับหน้าที่มีจริง
   - URL แบบโฟลเดอร์ (venue/index.html) ใช้ได้ทุกโฮสต์ ไม่พึ่งโฮสต์เติม .html ให้
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export async function build(demoDir) {
  const rd = (f) => readFileSync(join(demoDir, f), "utf8");
  const site = (await import(pathToFileURL(join(demoDir, "_src/site.mjs")).href)).default;

  const SHELL = rd("_src/shell.html");
  const INLINE = site.inline === false ? "" : rd("_src/inline.css.html");

  /* ---- เปลี่ยนหน้าแล้วไม่ "วาร์ป" -------------------------------------------
     เว็บหลายหน้ามีของที่เว็บหน้าเดียวไม่มี คือ "ช่องว่างระหว่างหน้า": กดเมนู →
     หน้าเก่าหายทันที → เบราว์เซอร์ทาสีขาว → หน้าใหม่โผล่ ตัดกึกเหมือนวาร์ป
     jek เจอเองบน The Bed 23/8/26 — และวัดแล้วว่าเดโมหลายหน้าทั้งสามใบไม่มี
     view transition สักใบ ทั้งที่เว็บ TarmSung เองมีมาตั้งแต่แรก (css/styles.css)

     ยกให้เบราว์เซอร์ทำ cross-document view transition = หน้าเก่ากับหน้าใหม่
     ครอสเฟดข้ามกัน เบราว์เซอร์ที่ยังไม่รองรับ (Firefox) ตกลงมาที่ตัวสำรอง JS
     ข้างล่างซึ่งเฟดหน้าเก่าออกก่อนค่อยเปลี่ยน — กลไกเดียวกับที่เว็บหลักใช้
     ไม่ใช่ของใหม่คนละแบบ (js/main.js "Leaving the page")

     วางที่ตัวประกอบ ไม่ใช่ในเปลือกของแต่ละแบรนด์ เพราะเดโมหลายหน้าทุกใบต้องได้
     เหมือนกันหมด — ใบไหนได้ ใบไหนไม่ได้ โดยไม่มีใครรู้ คือบั๊กที่รอเวลา */
  const PAGEFADE = `
<style>
  @view-transition { navigation: auto; }
  ::view-transition-old(root) { animation: pg-out 240ms cubic-bezier(.33,0,.3,1) both; }
  ::view-transition-new(root) { animation: pg-in  380ms cubic-bezier(.33,0,.3,1) both; }
  @keyframes pg-out { to   { opacity: 0; transform: translateY(-8px); } }
  @keyframes pg-in  { from { opacity: 0; transform: translateY(10px); } }
  /* ตัวสำรองของเบราว์เซอร์ที่ไม่มี view transition — เฟดด้วยคลาส */
  body.is-leaving {
    opacity: 0; transform: translateY(-8px);
    transition: opacity 240ms cubic-bezier(.33,0,.3,1), transform 240ms cubic-bezier(.33,0,.3,1);
  }
  @media (prefers-reduced-motion: reduce) {
    ::view-transition-old(root), ::view-transition-new(root) { animation: none; }
    body.is-leaving { opacity: 1; transform: none; transition: none; }
  }
</style>
<script>
(function () {
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || "startViewTransition" in document) return;   /* เบราว์เซอร์ทำเองแล้ว */
  /* แคบไว้ก่อน: เฉพาะคลิกซ้ายเปล่าๆ ลิงก์โดเมนเดียวกัน ไม่ใช่แท็บใหม่ ไม่ใช่ดาวน์โหลด
     ไม่ใช่จุดยึดในหน้าเดียวกัน — cmd-click / กลางคลิก ต้องเปิดแท็บหลังได้ตามปกติ */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.hash) return;
    e.preventDefault();
    document.body.classList.add("is-leaving");
    /* ตั้งเวลาสำรองไว้ด้วย: แท็บที่ถูกซ่อนอยู่จะไม่ยิง transitionend เลย */
    var gone = false, go = function () { if (!gone) { gone = true; location.href = a.href; } };
    document.body.addEventListener("transitionend", go, { once: true });
    setTimeout(go, 300);
  });
  /* กลับด้วยปุ่ม Back แล้วเจอหน้าจาง = หน้าถูกคืนจากแคช ทั้งที่ยังใส่คลาสค้างไว้ */
  addEventListener("pageshow", function () { document.body.classList.remove("is-leaving"); });
})();
</script>
`;

  /* "{{R}}" + "" = สตริงว่าง ซึ่งเบราว์เซอร์แปลว่า "หน้านี้เอง" ไม่ใช่หน้าแรก —
     ลิงก์หน้าแรกกับโลโก้จึงต้องผ่านตัวนี้ ไม่ใช่ต่อสตริงตรงๆ */
  const HREF = (url) => (url ? `{{R}}${url}` : "{{HOME}}");

  const navHtml = (cur, indent) => site.nav.map((n) =>
    `${indent}<a href="${HREF(n.url)}"${n.url === cur ? ' aria-current="page"' : ""}>${n.label}</a>`).join("\n");

  const crumb = (trail) => !trail ? "" : `
<nav class="crumb" aria-label="เส้นทางหน้าเว็บ">
  <div class="wrap">
    <ol>
${trail.map((t, i) => i === trail.length - 1
  ? `      <li aria-current="page">${t.label}</li>`
  : `      <li><a href="${HREF(t.url)}">${t.label}</a></li>`).join("\n")}
    </ol>
  </div>
</nav>
`;

  const pageHero = ([kicker, h1, p]) => `
  <section class="hero hero--page" aria-labelledby="page-title">
    <div class="wrap">
      <span class="kicker"><i aria-hidden="true"></i>${kicker}</span>
      <h1 id="page-title">${h1}</h1>
      <p>${p}</p>
    </div>
  </section>
`;

  /* หัวหน้าย่อยพูดชื่อหน้าไปแล้ว ถ้าบล็อกแรกมีหัวข้อเดียวกันซ้ำอีกรอบ ให้ตัดอันในบล็อกทิ้ง
     -----------------------------------------------------------------------------
     ฉบับแรกของฟังก์ชันนี้ตัด ".section-head อันแรกที่เจอในหน้า" ซึ่งผิด: หน้าที่บล็อกแรก
     ไม่มีหัวข้อ (เช่น ตารางคิดราคา หรือแถบที่อยู่) มันจะไปกินหัวของบล็อก "ถัดไป" แทน
     ผลคือ /contact ของเทอเรสเหลือปุ่มสองปุ่มลอยอยู่กลางที่ว่าง โดยที่อยู่กับเวลาเปิดหายไป
     ทั้งก้อน และ /visit ของคลินิกเสียหัว "ขั้นตอน" ไป — jek จับได้จากการเปิดดูเองใน Safari
     22/8/26 · ตัวตรวจอัตโนมัติของผมมองไม่เห็นเพราะบล็อกพวกนั้นยังมี <h3> ในการ์ดอยู่

     กติกาใหม่ ตัดต่อเมื่อครบทั้งสองข้อเท่านั้น:
       1. หัวนั้นอยู่ใน <section> "ตัวแรก" ของหน้าจริงๆ
       2. ข้อความใน <h2> ตรงกับ <h1> ของหัวหน้าย่อย (ตัดแท็ก/ช่องว่างออกแล้วเทียบ)
     ไม่ครบสองข้อ = ไม่แตะ ปล่อยให้ซ้ำดีกว่าทำเนื้อหาหาย */
  const norm = (t) => t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, "").trim();
  const dropHead = (html, heroH1) => {
    const start = html.indexOf("<section");
    if (start < 0) return html;
    const nextSec = html.indexOf("<section", start + 1);
    const first = html.slice(start, nextSec < 0 ? html.length : nextSec);
    const m = first.match(/\s*<div class="section-head reveal">[\s\S]*?<\/div>\n/);
    if (!m) return html;
    const h2 = (m[0].match(/<h2[^>]*>[\s\S]*?<\/h2>/) || [""])[0];
    if (!h2 || norm(h2) !== norm(heroH1)) return html;
    return html.slice(0, start) + first.replace(m[0], "\n") + html.slice(start + first.length);
  };



  const pages = site.pages(rd);
  /* ลิงก์ภายในต้องลงท้ายด้วย / เสมอ — "packages" (ไม่มี /) ใช้ได้เฉพาะโฮสต์ที่เดาให้
     ส่วนโฮสต์ธรรมดาตอบ 404 เพราะมันคือโฟลเดอร์ ไม่ใช่ไฟล์ เจอ 22/8/26 ตอนไล่ด่าน:
     เทอเรสมีลิงก์แบบนี้ตกหล่น 11 จุด (ปุ่ม "ขอใบเสนอราคา" บนหัวทุกหน้า · ปุ่มในฮีโร่ ·
     ชื่อห้องในการ์ด) ทั้งที่ลิงก์อื่นในไฟล์เดียวกันมี / ครบ
     บังคับที่ตัวประกอบ ไม่ใช่ที่ความจำ และเทียบกับ "หน้าที่มีอยู่จริง" ไม่ใช่เดาจากชื่อ */
  const known = new Set(pages.map((x) => x.url).filter(Boolean));
  const fixSlash = (html) => html.replace(/href="((?:\.\.\/)*)([a-z0-9\-/]+)"/g,
    (m, up, path) => known.has(path + "/") ? `href="${up}${path}/"` : m);

  let out = 0;
  for (const p of [...pages, ...(site.notFound ? [site.notFound(rd)] : [])]) {
    const R = "../".repeat(p.depth || 0);
    let html = SHELL
      .replace("{{INLINE}}", INLINE + PAGEFADE)
      .replace(/\{\{TITLE\}\}/g, p.title)
      .replace(/\{\{DESC\}\}/g, p.desc)
      .replace(/\{\{OG\}\}/g, p.og)
      .replace(/\{\{BASE\}\}/g, site.base)
      .replace(/\{\{URL\}\}/g, p.url)
      .replace("{{NAV}}", navHtml(p.url, "      "))
      .replace("{{NAVM}}", navHtml(p.url, "    "))
      .replace("{{NAVF}}", navHtml(p.url, "      "))
      .replace("{{CRUMB}}", crumb(p.crumb))
      .replace("{{HERO}}", p.hero ? pageHero(p.hero) : "")
      .replace("{{BODY}}", p.hero ? dropHead(p.body, p.hero[1]) : p.body)
      .replace("{{SCRIPTS}}", (p.scripts || []).map((s) => `<script src="{{R}}${s}"></script>`).join("\n"))
      .replace(/\{\{HOME\}\}/g, R || "./")
      .replace(/\{\{R\}\}/g, R);
    /* ซ่อม / ท้ายลิงก์ "ทั้งหน้า" ไม่ใช่แค่เนื้อหา — ปุ่มบนแถบหัว เมนู และ breadcrumb
       อยู่ในเปลือก ซึ่งเป็นจุดที่ตกหล่นจริง (ปุ่มขอใบเสนอราคาโผล่ทุกหน้า = พลาดจุดเดียว
       ผิดทั้งเว็บ) ทำหลังแทน {{R}} แล้ว เพราะตอนนั้นพาธเป็น ../ ของจริงแล้ว */
    html = fixSlash(html);
    const dest = join(demoDir, p.file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, html);
    out++;
  }

  /* เว็บหลายหน้าที่ไม่บอก Google ว่ามีหน้าอะไรบ้าง ก็เท่ากับมีหน้าเดียวอยู่ดี
     404 ไม่อยู่ในนี้โดยตั้งใจ — หน้าที่ไม่ควรถูกจัดทำดัชนี ไม่ควรถูกประกาศ */
  writeFileSync(join(demoDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map((p) => `  <url><loc>${site.base}${p.url}</loc></url>`).join("\n") + `\n</urlset>\n`);

  console.log(`${demoDir.split("/").pop()} → ประกอบ ${out} หน้า (รวม 404) + sitemap.xml`);
}
