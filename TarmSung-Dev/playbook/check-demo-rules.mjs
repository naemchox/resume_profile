/* check-demo-rules.mjs — ด่านตรวจกฎดีไซน์เดโม DEMO-SPEC S1.4 + S2.10-12 (playbook/DEMO-SPEC.md)
   (เดิมอ้าง website.md §11 — ตัวกฎย้ายมาที่ DEMO-SPEC เมื่อ 24 ส.ค. 2026 บันทึกที่มาอยู่ใน LOG-DEMO.md)
   ใช้: python3 -m http.server 8099   (ที่รากรีโป)
        node playbook/check-demo-rules.mjs work/<slug>/          # ตัวเดียว
        node playbook/check-demo-rules.mjs --all                 # ทุกเดโม

   ทำไมวัดพฤติกรรม ไม่วัดชื่อคลาส:
   ฉบับแรกของไฟล์นี้ตรวจด้วยชื่อคลาสของ gamedock (.sechead, [data-fx], .is-stuck)
   พอเอาไปวัด krua-baansuan ที่ใช้ .section-head + .reveal ก็ขึ้น FAIL ทั้งที่ของ
   มันทำงานอยู่ = ด่านที่ตรวจตัวอย่างไม่ได้ตรวจประเภท ฉบับนี้จึงวัดสิ่งที่กฎพูดถึงจริงๆ:
   หน้าตาที่ต่างกัน · ของที่ขยับตอนเลื่อน · หัวเว็บที่เตี้ยลง · ลิงก์ที่เปลี่ยนสี  */
import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://localhost:8099/";
/* ไล่โฟลเดอร์ใน work/ เอง ไม่พิมพ์ชื่อไว้ในลิสต์ (24/8/26) — ลิสต์ที่พิมพ์มือเคยตกหล่น
   เดโม 5 หน้าทั้งสามใบมาก่อน แล้วขึ้น "ผ่านหมด" ทั้งที่ไม่เคยเปิดสักหน้า และตัวลิสต์เองก็
   ไม่มีอะไรบังคับให้ใครกลับมาเติม · ท่าเดียวกับ audit-mobile / audit-height / audit-motion
   ซึ่งไล่โฟลเดอร์เองทั้งหมด — ของชนิดเดียวกันต้องใช้กลไกเดียวกัน
   ด่านที่ข้ามของบางชิ้นเงียบๆ อันตรายกว่าด่านที่ฟ้อง: ข้าม ไม่เท่ากับ ผ่าน */
const ALL = readdirSync(join(REPO, "work"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(REPO, "work", d.name, "index.html")))
  .map((d) => d.name).sort();
const args = process.argv.slice(2);
const targets = args.includes("--all") ? ALL.map((s) => `work/${s}/`) : [args[0] || "work/gamedock/"];

const b = await chromium.launch();

/* ผ่านด่านหน้าเว็บก่อนวัด (22/8/26)
   velvet-leaf มีด่านยืนยันอายุคลุมทั้งหน้าและไม่จำคำตอบไว้ใน localStorage ด่านนี้จึง
   ขึ้นทุกครั้งที่โหลด ผลคือสคริปต์วัด "หน้าด่าน" แทนที่จะวัดเว็บ แล้วรายงาน 2/6 ทั้งที่
   ยังไม่เคยเห็นเว็บเลยสักครั้ง — ตกเพราะวัดไม่ถึง ไม่ใช่ตกเพราะของไม่มี ซึ่งอ่านแยกกัน
   ไม่ออกจากผลลัพธ์ ทุกหน้าที่มีด่านต้องถูกกดผ่านด้วยกลไกเดียวกันก่อนวัดเสมอ
   กดเฉพาะปุ่มยืนยันในกล่องที่ประกาศตัวว่าเป็นด่าน (class/id มี age/gate) และข้อความ
   เป็นการตอบรับ — ไม่ไล่กดปุ่มทุกใบในหน้า */
const passGate = async (p) => {
  const gate = await p.evaluate(() => !!document.querySelector('[class*="age" i],[id*="age" i],[class*="gate" i],[id*="gate" i]'));
  if (!gate) return false;
  const yes = p.locator('button, a[role="button"]')
               .filter({ hasText: /^(yes|ใช่|ยืนยัน|เข้าสู่เว็บไซต์|enter|i am\b)/i }).first();
  if (!(await yes.count())) return false;
  await yes.click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(600);
  return true;
};

/* ขอบเขตที่ใช้วัด = <main> ถ้ามี ไม่มีก็ <body> (22/8/26)
   the-bed กับ lumen ไม่มี <main> เลย ทุกกฎที่เขียนว่า "main *" จึงวัดของ 0 ชิ้นมาตลอด
   ผลที่ออกมาอ่านไม่ออกว่าคืออะไร: ข้อ 3 ขึ้น FAIL "0 ชนิด" (ทั้งที่หน้ามีเอฟเฟกต์)
   ส่วนข้อ 1 ขึ้น PASS เพราะหัวข้อ 0 อัน = ไม่เกิน 3 ทรง — ไม่มีของให้วัด กลายเป็นผ่าน
   ซึ่งอันตรายกว่าตก ด่านต้องวัดให้ได้ก่อน แล้วค่อยตัดสิน */
const ROOT = () => document.querySelector("main") || document.body;

/* ลายเซ็นของ "ทรงหัวข้อ" = การจัดวางที่ตาเห็น ไม่ใช่ชื่อคลาส
   (จัดกึ่งกลางไหม · เป็นกี่คอลัมน์ · หัวข้อกับของข้างๆ เรียงแนวไหน) */
const headSignature = () => {
  const ROOT = () => document.querySelector("main") || document.body;
  // วัดจากตำแหน่งจริงบนจอ ไม่ใช่ชื่อคลาส เพราะสองเดโมอาจใช้ชื่อคลาสคนละชุด
  // แต่วางหัวข้อทรงเดียวกัน (หรือชื่อเดียวกันแต่วางคนละทรง)
  const heads = [...ROOT().querySelectorAll("h2")].filter((h) => h.offsetParent !== null);
  return heads.map((h) => {
    // หา "บล็อกหัวข้อ" = กล่องที่กว้างเต็มแถวและมีหัวข้อนี้อยู่ข้างใน
    let box = h.parentElement;
    while (box && box.getBoundingClientRect().width < h.getBoundingClientRect().width * 1.15
           && box.parentElement && box.tagName !== "SECTION") box = box.parentElement;
    const B = box.getBoundingClientRect(), H = h.getBoundingClientRect();
    const centered = Math.abs((H.left + H.right) / 2 - (B.left + B.right) / 2) < 12;
    // มีของวางอยู่ข้างขวาของหัวข้อในแถวเดียวกันไหม (หัวข้อคู่ลิงก์ / หัวข้อคู่คำอธิบาย)
    const beside = [...box.querySelectorAll(":scope > *, :scope > * > *")].some((el) => {
      if (el === h || h.contains(el) || el.contains(h)) return false;
      const R = el.getBoundingClientRect();
      return R.width > 40 && R.left >= H.right - 4 && R.top < H.bottom && R.bottom > H.top;
    });
    return [centered ? "กึ่งกลาง" : "ชิดซ้าย", beside ? "มีของข้างขวา" : "เต็มแถว"].join("/");
  });
};

/* "ส่วนที่มีเอฟเฟกต์เข้าฉาก" = ของที่ยังไม่ถูกเลื่อนไปถึงแล้วซ่อน/เลื่อน/ย่ออยู่
   นับชนิดจาก transition/animation ที่ใช้จริง — ต่างเทคนิค = ต่างชนิด */
const fxKinds = () => {
  const ROOT = () => document.querySelector("main") || document.body;
  const kinds = new Set();
  ROOT().querySelectorAll("*").forEach((el) => {
    const cs = getComputedStyle(el);
    const hidden = parseFloat(cs.opacity) < 0.9 || cs.transform !== "none" || cs.clipPath !== "none";
    if (!hidden) return;
    const moving = cs.transitionProperty !== "all" && cs.transitionProperty !== "none";
    const anim = cs.animationName !== "none";
    if (!moving && !anim) return;
    kinds.add(anim ? "anim:" + cs.animationName
      : "tr:" + cs.transitionProperty + "|" + (cs.transform !== "none" ? "move" : "") + (cs.clipPath !== "none" ? "clip" : ""));
  });
  return [...kinds];
};

const results = [];
for (const t of targets) {
  const url = BASE + t;
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const R = [];
  const add = (n, ok, why) => R.push({ n, ok, why });
  let gated = false;
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await p.waitForTimeout(1500);
    gated = await passGate(p);      // มีด่านหน้าเว็บ (เช่น ยืนยันอายุ) ต้องกดผ่านก่อนวัด

    const hasMain = await p.evaluate(() => !!document.querySelector("main"));
    add("0 มี <main> ให้เครื่องอ่านหน้าจอ/ด่านตรวจเกาะ", hasMain,
        hasMain ? "มี" : "ไม่มี — วัดจาก <body> แทน และเครื่องอ่านหน้าจอไม่มีจุดข้ามไปเนื้อหา");

    /* 1 — ทรงหัวข้อ */
    const heads = await p.evaluate(headSignature);
    const shapes = new Set(heads).size;
    const run = heads.reduce((m, c, i) => { let r = 1; while (heads[i - r] === c) r++; return Math.max(m, r); }, 0);
    add("1 ทรงหัวข้อ ≤3 แบบ · ห้ามซ้ำติดกันเกิน 2", shapes <= 3 && run <= 2,
        `${heads.length} หัวข้อ · ${shapes} ทรง · ซ้ำติดกันสูงสุด ${run}` +
        (process.env.PPV ? "\n      " + heads.map((s, i) => `${i + 1}. ${s}`).join("\n      ") : ""));

    /* 3 — เอฟเฟกต์เฉพาะส่วน (วัดก่อนเลื่อน ตอนของยังไม่เข้าฉาก) */
    const kinds = await p.evaluate(fxKinds);
    add("3 อย่างน้อย 3 ส่วนมีเอฟเฟกต์เฉพาะตัว", kinds.length >= 3,
        `${kinds.length} ชนิด${kinds.length ? " (" + kinds.slice(0, 4).map((k) => k.slice(0, 26)).join(" · ") + ")" : ""}`);

    /* 4 — พื้นหลัง */
    const bgs = await p.$$eval("body > *, main > *", (els) => els
      .filter((e) => e.offsetHeight > 80)
      .map((e) => getComputedStyle(e).backgroundColor + "|" + getComputedStyle(e).backgroundImage.slice(0, 50)));
    add("4 พื้นหลังเปลี่ยนอย่างน้อย 3 ครั้ง", new Set(bgs).size >= 3, `${new Set(bgs).size} แบบ`);

    /* 5 — หัวเว็บเตี้ยลงตอนเลื่อน (วัดความสูงจริง ไม่สนชื่อคลาส) */
    const hd = "header, .site-header, .nav, nav[class*=head]";
    const h0 = await p.$eval(hd, (e) => e.getBoundingClientRect().height).catch(() => null);
    const hdA = hd.split(",").map((s) => s.trim() + " a").join(", ");
    const navBefore = await p.$$eval(hdA, (as) => as.map((a) => getComputedStyle(a).color + getComputedStyle(a).borderBottomColor)).catch(() => []);
    await p.evaluate(() => scrollTo(0, Math.min(1600, document.body.scrollHeight / 2)));
    await p.waitForTimeout(800);
    const h1 = await p.$eval(hd, (e) => e.getBoundingClientRect().height).catch(() => null);
    const navAfter = await p.$$eval(hdA, (as) => as.map((a) => getComputedStyle(a).color + getComputedStyle(a).borderBottomColor)).catch(() => []);
    add("5 หัวเว็บตอบสนองการเลื่อน (เตี้ยลง)", h0 !== null && h1 !== null && h1 < h0 - 2,
        h0 === null ? "ไม่พบแถบนำทาง" : `สูง ${Math.round(h0)} → ${Math.round(h1)} px`);

    const changed = navBefore.filter((v, i) => navAfter[i] && navAfter[i] !== v).length;
    /* เจตนาของข้อนี้คือ "เมนูต้องบอกผู้อ่านว่าตอนนี้อยู่ตรงไหน" — scroll-spy เป็นวิธีของ
       เว็บหน้าเดียว ซึ่งเมนูชี้ไป #หัวข้อในหน้าเดียวกัน
       เว็บหลายหน้า (แพ็ก ฿7,500) เมนูชี้ไปคนละหน้า จึงไม่มี #หัวข้อให้ spy เลย และวิธีที่
       ตรงเจตนากว่าคือ aria-current="page" ซึ่งเป็นมาตรฐานจริงของเว็บหลายหน้า ไม่ใช่ของ
       ทดแทนแบบขอไปที — ด่านที่บังคับให้เว็บหลายหน้าไปทำ scroll-spy ปลอมๆ คือด่านที่
       บังคับให้ของเสียคุณภาพเพื่อผ่านด่าน (22/8/26)
       เงื่อนไขนี้ไม่ผ่อนให้เว็บหน้าเดียว: หน้าที่มีลิงก์ #หัวข้อในเมนูยังต้องผ่านแบบเดิม */
    const navMode = await p.evaluate((sel) => {
      const h = document.querySelector(sel.split(",")[0]) || document.querySelector("header");
      if (!h) return { anchors: 0, current: 0 };
      return {
        anchors: [...h.querySelectorAll('a[href^="#"]')].filter((a) => a.getAttribute("href").length > 1).length,
        current: h.querySelectorAll('[aria-current="page"]').length,
      };
    }, hd);
    const multiPageNav = navMode.anchors === 0 && navMode.current > 0;
    add("5b ไฮไลต์หัวข้อที่กำลังอ่าน (scroll-spy)", changed > 0 || multiPageNav,
        multiPageNav ? `เว็บหลายหน้า: เมนูบอกตำแหน่งด้วย aria-current="page" (${navMode.current} ลิงก์) ไม่มี #หัวข้อให้ spy`
                     : `ลิงก์ที่เปลี่ยนสถานะตอนเลื่อน ${changed} จาก ${navBefore.length}`);

    /* 6 — ปิดเมื่อผู้ใช้ขอลดการเคลื่อนไหว */
    const p2 = await b.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    await p2.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await p2.waitForTimeout(1200);
    await passGate(p2);                   // หน้าเดียวกัน ด่านเดียวกัน ต้องผ่านด้วยกลไกเดียวกัน
    /* นับเฉพาะ "เนื้อหาที่หายไป" ไม่ใช่ทุกอย่างที่จาง — 22/8/26 ด่านนี้ฟ้องผิดสองเคส:
       เดอะ เทอเรส มี <span class="hero-grain"> ที่ตั้งใจให้ opacity .1 เป็นผิวสัมผัส
       และ summit เป็นสไลด์โชว์ที่สไลด์ซึ่งยังไม่ถึงคิวต้องอยู่ที่ 0 อยู่แล้ว
       ทั้งสองอันไม่ใช่ start state ที่ค้าง — ด่านที่ฟ้องของที่ไม่ใช่ข้อผิด สอนให้คนเลิกอ่านผลของมัน */
    const stuck = await p2.evaluate(() => [...(document.querySelector("main") || document.body).querySelectorAll("*")].filter((e) => {
      if (e.offsetHeight <= 40) return false;
      if (parseFloat(getComputedStyle(e).opacity) >= 0.5) return false;
      if (!e.textContent.trim()) return false;              // ชั้นตกแต่งเปล่าๆ (เกรน/แสง) ไม่ใช่เนื้อหา
      if (e.closest('[aria-hidden="true"]')) return false;  /* ประกาศตัวเองว่าไม่ใช่เนื้อหา (22/8/26)
        lumen ซ้อนคำว่า LUMEN สี่ชั้นเป็นโลโก้แก้ว ชั้นฐานทึบ ส่วนชั้นปริซึม/สตรีคเป็นแสงที่
        ตั้งใจให้จาง .35 และมี aria-hidden ครบ ตัวกรอง "พี่น้อง className เดียวกัน" ไม่ช่วย
        เพราะสี่ชั้นตั้งชื่อคลาสไม่ซ้ำกัน — ของที่บอกว่าไม่ใช่เนื้อหา ไม่ควรถูกนับว่าเนื้อหาหาย */
      const sibs = [...(e.parentElement ? e.parentElement.children : [])]
        .filter((s) => s !== e && s.className === e.className);
      if (sibs.some((s) => parseFloat(getComputedStyle(s).opacity) >= 0.5)) return false;  // สไลด์โชว์
      return true;
    }).length);
    add("6 ปิดเอฟเฟกต์เมื่อตั้งค่าลดการเคลื่อนไหว", stuck === 0, `ของที่ยังจางค้าง ${stuck} ชิ้น`);
    await p2.close();
  } catch (e) {
    add("เปิดหน้าไม่ได้", false, e.message.split("\n")[0]);
  }
  await p.close();

  const pass = R.filter((r) => r.ok).length;
  results.push({ t, pass, total: R.length, R });
  // บอกไว้ในผลด้วยว่าหน้านี้ถูกกดผ่านด่านก่อนวัด ไม่งั้นอ่านผลแล้วไม่รู้ว่าวัดหน้าไหนอยู่
  console.log(`\n=== ${t} — ${pass}/${R.length} ผ่าน ===${gated ? " (กดผ่านด่านหน้าเว็บก่อนวัด)" : ""}`);
  R.forEach((r) => console.log(r.ok ? " PASS" : " FAIL", r.n, "—", r.why));
}

if (targets.length > 1) {
  console.log("\n--- สรุป ---");
  results.forEach((r) => console.log(`${r.pass}/${r.total}  ${r.t}`));
}
await b.close();
process.exit(results.every((r) => r.pass === r.total) ? 0 : 1);
