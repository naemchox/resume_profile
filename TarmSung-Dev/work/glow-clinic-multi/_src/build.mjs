/* ประกอบทุกหน้าจาก data.mjs — รัน: node work/glow-clinic-multi/_src/build.mjs
   เขียนเป็นตัวประกอบ ไม่ใช่ 11 ไฟล์มือ เพราะคลินิกจริงแก้ราคากับโปรโมชั่นบ่อย
   ถ้าตัวเลขกระจายอยู่ 11 ไฟล์จะแก้ไม่ครบแล้วเว็บขัดกันเอง */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { site, problems, programs, promos, promoImg, articles, articleImg, reviews, doctors, customers, machines } from "./data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const baht = (n) => n.toLocaleString("en-US");

const NAV = [
  ["", "หน้าแรก"], ["programs/", "โปรแกรม"], ["promotions/", "โปรโมชั่น"],
  ["knowledge/", "เครื่องมือ & ความรู้"], ["customers/", "คนหล่อสวย"], ["reviews/", "รีวิว"], ["doctor/", "แพทย์"], ["visit/", "ที่ตั้ง · นัดหมาย"],
];

/* เปลือกหน้า — ทุกหน้าใช้ตัวเดียวกัน ป้ายเดโม/noindex/canonical จึงไม่มีทางตกหล่นทีละหน้า */
function shell({ path, title, desc, body, jsonld }) {
  const up = path === "" ? "" : "../".repeat(path.split("/").filter(Boolean).length);
  const url = `${site.base}/${path}`;
  const nav = NAV.map(([p, t]) =>
    `<a href="${up}${p}"${p === path ? ' aria-current="page"' : ""}>${t}</a>`).join("\n        ");
  return `<!doctype html>
<html lang="th" class="no-js">
<head>
<meta charset="utf-8">
<!-- เดโมสาธิต ไม่ใช่ธุรกิจจริง: ห้ามให้เสิร์ชเอนจินเก็บเข้าดัชนี ไม่งั้นจะมีหน้าที่ดู
     เหมือนคลินิกจริง (มีชื่อ ราคา เบอร์โทร) ลอยอยู่บน Google ในโดเมนของเรา -->
<meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://tarmsung.pages.dev/assets/work/glow-clinic-multi.webp">
<meta name="twitter:card" content="summary_large_image">
${jsonld ? `<script type="application/ld+json">\n${JSON.stringify(jsonld, null, 2)}\n</script>` : ""}
<script>document.documentElement.classList.replace("no-js","js");</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Thai:wght@400;500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${up}css/glow.css">
</head>
<body>
<header class="top">
  <div class="wrap top__in">
    <a class="brand" href="${up}"><b>${site.name}</b><span>${site.en}</span></a>
    <nav class="nav" aria-label="เมนูหลัก">
        ${nav}
    </nav>
    <a class="btn" href="${up}visit/">นัดประเมินผิว</a>
  </div>
</header>
<main>
${body}
</main>
<footer class="foot">
  <div class="wrap grid3">
    <div><span class="lab">ที่ตั้ง</span>${site.addr}</div>
    <div><span class="lab">เวลาทำการ</span>${site.hours}</div>
    <div><span class="lab">ติดต่อ</span>
      <a href="tel:${site.phone.replace(/[^0-9]/g,"")}">โทร <span class="num">${site.phone}</span></a><br>
      <a href="${up}visit/#book">นัดผ่านแบบฟอร์ม</a>
      <div class="social">${site.social.map(([label]) => `<a href="${up}visit/#book" aria-label="${label} ของคลินิก">${label}</a>`).join("")}</div>
    </div>
  </div>
  <div class="wrap" style="margin-top:1.8rem;color:var(--ink-3);font-size:.85rem">
    ราคาที่แสดงเป็นราคาก่อนการประเมินโดยแพทย์ แผนจริงอาจต่างจากนี้ตามสภาพผิวของแต่ละคน
  </div>
</footer>
<script src="${up}js/nav-response.js" defer></script>
<script src="${up}../_demo-badge.js" defer></script>
<script>
/* เผยตอนเลื่อน — เบาเท่าที่จะเบาได้ เอกสารไม่ควรเต้น */
(function(){
  var els=[].slice.call(document.querySelectorAll('.rv'));
  if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in');});return;}
  var io=new IntersectionObserver(function(en){en.forEach(function(x){
    if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}});},{rootMargin:'0px 0px -8% 0px'});
  els.forEach(function(e){io.observe(e);});
})();
</script>
</body>
</html>
`;
}

function write(path, html) {
  const dir = join(ROOT, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
  return `${path || "/"}`;
}

/* รูปในเว็บนี้เล่นบทเดียว: ภาพประกอบเอกสาร — กรอบบาง + คำบรรยายที่บอกข้อเท็จจริง
   ไม่ใช่คำโฆษณา (คลินิกจริงที่นับมา 3 ใน 3 หน้าแรกนำด้วยภาพ ของเดิมมี 0 รูป) */
const SRCSET = (up, n) =>
  `${up}img/${n}-400.webp 400w, ${up}img/${n}-800.webp 800w, ${up}img/${n}-1400.webp 1400w`;

/* ทุกรูปในเว็บออกจากตัวนี้ตัวเดียว — ถ้ามีที่ไหนเขียน <img> เองจะหลุด srcset ทันที
   webp ก่อน jpg สำรอง (เบราว์เซอร์เก่ากว่า 2020) · sizes ต้องบอกความกว้างจริงที่แสดง
   ไม่งั้น srcset ไม่มีความหมาย เบราว์เซอร์จะเลือกไฟล์ใหญ่สุดเสมอ */
const pic = (up, name, alt, sizes, { w = 1400, h = 933, cap = "", cls = "", eager = false } = {}) =>
  `<figure class="${cls}">
    <picture>
      <source type="image/webp" srcset="${SRCSET(up, name)}" sizes="${sizes}">
      <img src="${up}img/${name}.jpg" alt="${esc(alt)}" width="${w}" height="${h}"
           ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
    </picture>
    ${cap ? `<figcaption>${esc(cap)}</figcaption>` : ""}
  </figure>`;

const SZ = {
  wide: "(max-width: 900px) 100vw, 1156px",
  field: "(max-width: 860px) 100vw, 366px",
  side:  "(max-width: 760px) 100vw, 240px",
};

const fig = (up, name, alt, cap, cls = "") =>
  pic(up, name, alt, cls === "figwide" ? SZ.wide : SZ.field, { cap, cls, eager: cls === "figwide" && up === "" });

const progRow = (p, up) => `<tr>
  <td class="thumbcell"><a href="${up}programs/${p.slug}/"><picture><source type="image/webp" srcset="${up}img/th-${p.slug}-200.webp"><img class="thumb" src="${up}img/th-${p.slug}.jpg" alt="" width="200" height="133" decoding="async"></picture><span>${esc(p.name)}</span></a></td>
  <td class="n">${p.rounds}</td><td class="r">${esc(p.down)}</td><td class="n">${baht(p.total)}</td></tr>`;

/* ---------- หน้าแรก: ตัวเลือกปัญหาคือฮีโร่ ไม่ใช่รูปสต็อก ------------------
   ทั้ง 5 คลินิกที่นับมาเปิดด้วยรูปสวยแล้วให้ไปทักไลน์ถามราคา ที่นี่เปิดด้วยคำถาม
   ที่คนไข้ถือมาในหัวจริงๆ แล้วตอบด้วยตัวเลขในหน้าเดียวกัน */
const problemData = JSON.stringify(problems.map(pb => ({
  id: pb.id, label: pb.label,
  rows: programs.filter(p => p.for.includes(pb.id)).map(p => ({
    slug:p.slug, name:p.name, rounds:p.rounds, down:p.down, total:p.total, gap:p.gap })),
})));

const home = shell({
  path: "", title: `${site.name} — เลือกจากปัญหาผิว ไม่ใช่จากชื่อเครื่อง`,
  desc: "คลินิกผิวพรรณทองหล่อ เลือกจากปัญหาผิวแล้วเห็นเลยว่าต้องทำกี่ครั้ง พักฟื้นกี่วัน รวมเท่าไหร่ ไม่ต้องทักไลน์ถามราคา ประเมินโดยแพทย์ก่อนทุกเคส",
  jsonld: { "@context":"https://schema.org", "@type":"MedicalClinic", name:site.name,
    description:"คลินิกผิวพรรณโดยแพทย์เฉพาะทาง ประเมินผิวก่อนเริ่มทุกโปรแกรม แจ้งจำนวนครั้งและราคารวมไว้ล่วงหน้า",
    url:`${site.base}/`, telephone:site.phone, inLanguage:"th",
    address:{ "@type":"PostalAddress", streetAddress:site.addr, addressCountry:"TH" } },
  body: `
<section class="hero-full" aria-labelledby="hero-title">
  <picture>
    <source type="image/webp" srcset="${SRCSET("", "hero")}" sizes="100vw">
    <img class="hero-full__photo" src="img/hero.jpg" alt="คนไข้กำลังรับทรีตเมนต์บำรุงผิวหน้าในห้องทรีตเมนต์ของคลินิก" width="1400" height="933" fetchpriority="high" decoding="async">
  </picture>
  <div class="wrap hero-full__copy">
    <p class="hero-full__rule">คลินิกผิวพรรณ<span class="hr" aria-hidden="true"></span>ทองหล่อ ซอย 13</p>
    <h1 id="hero-title">ผิวดีขึ้นได้<br>ตั้งแต่ครั้งแรก</h1>
    <p class="hero-full__lead">แพทย์เฉพาะทางดูแลทุกเคส ประเมินสภาพผิวฟรีก่อนเริ่มทุกโปรแกรม<br>เลือกจากปัญหาผิว แล้วเห็นเลยว่ากี่ครั้ง พักฟื้นกี่วัน รวมเท่าไหร่</p>
    <p class="hero-full__cta"><a class="btn" href="#picker">เลือกจากปัญหาผิว</a> <a class="btn btn--ghost btn--onphoto" href="promotions/">ดูโปรโมชั่นเดือนนี้</a></p>
    <p class="hero-full__chips"><span><b>แพทย์ผิวหนัง</b> ตรวจทุกเคส</span><span><b>ราคารวม</b> แจ้งก่อนเริ่ม</span><span><b>จอดรถฟรี</b> 2 ชม.</span></p>
  </div>
</section>

<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">ใบประเมินเบื้องต้น · กรอกเองได้ ไม่ต้องทัก</span>
    <h2>ปัญหาผิวของคุณคืออะไร</h2>
    <p>เลือกหนึ่งข้อ แล้วดูว่าต้องทำกี่ครั้ง พักฟื้นกี่วัน และรวมเท่าไหร่ — ตัวเลขจริงจากตารางราคาของคลินิก ไม่ใช่ราคาเริ่มต้นที่ยังไม่รวมอะไร</p>
  </div>


  <div class="picker" id="picker" role="group" aria-label="เลือกปัญหาผิว">
    ${problems.map((pb, i) => `<button type="button" class="pick" data-id="${pb.id}" aria-pressed="${i === 0}">
      <b>${esc(pb.label)}</b><small>${esc(pb.note)}</small></button>`).join("\n    ")}
  </div>

  <div class="result field" id="result" style="margin-top:2.4rem">
    <span class="lab">แผนที่เป็นไปได้</span>
    <p class="result__none" id="resultNone">ยังไม่ได้เลือกปัญหา — เลือกด้านบนหนึ่งข้อ</p>
    <div class="scroll-x" id="resultBox" hidden>
      <table class="tbl">
        <caption id="resultCap"></caption>
        <thead><tr><th>โปรแกรม</th><th class="n">ครั้ง</th><th class="r">ระยะห่าง</th><th class="r">พักฟื้น</th><th class="n">รวม (บาท)</th></tr></thead>
        <tbody id="resultBody"></tbody>
      </table>
    </div>
    <p style="margin-top:1.2rem;color:var(--ink-2);font-size:.9rem">
      ตัวเลขนี้คือกรอบที่ใช้คุยกัน แพทย์จะส่องผิวก่อนแล้วบอกว่าเคสของคุณอยู่ตรงไหนของกรอบนี้ ถ้าไม่ตรงเราจะบอกก่อนเริ่ม</p>
  </div>
</section>

<section class="sec wrap">
  <div class="sec__head rv">
    <span class="lab">สิ่งที่ต่างจากที่อื่น</span>
    <h2>แพทย์ตรวจก่อน แล้วค่อยตัดสินใจว่าจะทำหรือไม่ทำ</h2>
  </div>
  <div class="grid3">
    <div class="field rv"><span class="lab">01</span>
      ${fig("", "exam-tablet", "แพทย์ส่องผิวด้วยกล้องแล้วดูภาพขยายบนแท็บเล็ต", "")}
      <h3>คนที่คุยกับคุณคือแพทย์</h3>
      <p>ไม่มีขั้นตอนที่ต้องคุยกับที่ปรึกษาความงามก่อนพบแพทย์ ทุกเคสส่องผิวโดยแพทย์ผิวหนัง</p></div>
    <div class="field rv"><span class="lab">02</span>
      ${fig("", "exam-derm", "ภาพผิวขยายจากกล้องส่องผิวบนหน้าจอแท็บเล็ต", "")}
      <h3>ราคารวมแจ้งก่อนเริ่ม</h3>
      <p>จำนวนครั้งและยอดรวมเขียนไว้ในใบแผนตั้งแต่วันแรก ถ้าต้องทำเกินจากที่ตกลง เราไม่คิดเพิ่ม</p></div>
    <div class="field rv"><span class="lab">03</span>
      ${fig("", "treat-modern", "แพทย์สวมโคมไฟคาดศีรษะกำลังทำหัตถการให้คนไข้", "")}
      <h3>ประเมินแล้วไม่ทำก็ได้</h3>
      <p>ไม่มีค่าปรึกษา ไม่มีค่ามัดจำ และไม่มีการโทรตามหลังจากคุณกลับ</p></div>
  </div>
  <p style="margin-top:2rem"><span class="stamp">ประเมินฟรี · ไม่มีค่ามัดจำ</span></p>
</section>

<!-- ข้อมูล notfit มีอยู่ใน data.mjs อยู่แล้ว แต่ถูกฝังในหน้าโปรแกรมรายตัว —
     คนที่ยังไม่คลิกเข้าไปจึงไม่มีทางรู้ว่าตัวเองทำไม่ได้ ยกขึ้นหน้าแรกเป็นหัวข้อของตัวเอง
     ไม่มีคลินิกไหนเขียนไว้ที่หน้าแรก นั่นแหละคือเหตุผลที่ควรเขียน -->
<section class="sec wrap" id="notfit">
  <div class="sec__head rv">
    <span class="lab">อ่านก่อนจอง</span>
    <h2>ใครยังไม่ควรทำ</h2>
    <p>ถ้าคุณตรงกับข้อไหนข้อหนึ่ง อย่าเพิ่งจอง โทรมาคุยก่อน — เสียเวลาคุณน้อยกว่ามาถึงแล้วทำไม่ได้</p>
  </div>
  <div class="grid3">
  ${programs.map(p => `<div class="field rv"><span class="lab">ยังไม่ควรทำ ถ้า</span>
    <h3>${esc(p.short)}</h3>
    <p>${esc(p.notfit)}</p></div>`).join("\n  ")}
  </div>
  <p style="margin-top:2rem"><span class="stamp">ไม่แน่ใจว่าตรงข้อไหน โทรถามได้ ไม่มีค่าใช้จ่าย</span></p>
</section>

<section class="sec wrap">
  <div class="sec__head rv">
    <span class="lab">โปรโมชั่นเดือนนี้</span>
    <h2>ราคาช่วงนี้ · หมดอายุตามวันที่เขียนไว้</h2>
    <p>โปรกับเครื่องใหม่เปลี่ยนทุกเดือน หน้าโปรโมชั่นจึงแยกออกไปต่างหาก แก้ที่เดียวไม่ต้องรื้อทั้งเว็บ</p>
  </div>
  <div class="grid2">
    ${promos.slice(1,3).map((pr,i) => `<div class="row row--img rv">
      ${fig("", promoImg[i+1], "ภาพประกอบโปรโมชั่น: บรรยากาศการดูแลผิวในคลินิก", "")}
      <div><span class="lab">${esc(pr.tag)}</span>
        <h3>${esc(pr.title)}</h3>
        <p>${esc(pr.body)}</p></div>
    </div>`).join("\n    ")}
  </div>
  <p class="more-line"><a class="more" href="promotions/">ดูโปรโมชั่นทั้งหมดของเดือนนี้ →</a></p>
</section>

<section class="sec wrap">
  <div class="sec__head rv"><span class="lab">สามโปรแกรมที่คนถามถึงบ่อย</span><h2>เริ่มจากตรงนี้ได้</h2></div>
  <div class="cards rv">
  ${["pico","potenza","hifu"].map(sl => programs.find(x => x.slug === sl)).map(p => `<a class="card" href="programs/${p.slug}/">
    <div class="card__art">
      <picture><source type="image/webp" srcset="${SRCSET("", p.img)}" sizes="(max-width: 600px) 100vw, (max-width: 980px) 45vw, 366px">
        <img src="img/${p.img}.jpg" alt="${esc(p.imgAlt)}" width="1400" height="933" loading="lazy" decoding="async"></picture>
      <span class="card__price">${baht(p.total)}</span>
    </div>
    <div class="card__body"><b>${esc(p.name)}</b><span>${p.rounds} ครั้ง · พักฟื้น ${esc(p.down)}</span></div></a>`).join("\n  ")}
  </div>
</section>

<section class="sec wrap">
  <div class="sec__head rv"><span class="lab">ตารางราคาทั้งหมด</span><h2>โปรแกรมที่คลินิกทำ</h2></div>
  <div class="scroll-x rv">
    <table class="tbl">
      <thead><tr><th>โปรแกรม</th><th class="n">ครั้ง</th><th class="r">พักฟื้น</th><th class="n">รวม (บาท)</th></tr></thead>
      <tbody>${programs.map(p => progRow(p, "")).join("\n")}</tbody>
    </table>
  </div>
  <p style="margin-top:1.4rem"><a class="more" href="programs/">รายละเอียดแต่ละโปรแกรม →</a></p>
</section>

<section class="sec wrap">
  <div class="sec__head rv">
    <span class="lab">ผลลัพธ์ · คนที่มาประจำ</span>
    <h2>คนหล่อสวยของโกลว์</h2>
    <p>คนไข้ต่อเนื่องจากกว่าหนึ่งคอร์ส เขียนไว้ว่าทำอะไรและมานานแค่ไหน — ไม่ได้เลือกเฉพาะเคสที่ผลดีที่สุด</p>
  </div>
  <div class="face-row">
    ${customers.slice(0,4).map(c => `<figure class="face rv">
      <picture><source type="image/webp" srcset="${SRCSET("", c.img)}" sizes="(max-width:760px) 50vw, 260px">
      <img src="img/${c.img}.jpg" alt="ภาพประกอบคนไข้ที่มารับบริการต่อเนื่อง" width="1400" height="933" loading="lazy" decoding="async"></picture>
      <figcaption><b>คุณ${esc(c.name)}</b><span>${esc(c.prog)} · ${esc(c.since)}</span></figcaption>
    </figure>`).join("\n    ")}
  </div>
  <p class="more-line"><a class="more" href="customers/">ดูผลลัพธ์คนหล่อสวยทั้งหมด →</a></p>
</section>

<section class="sec wrap">
  <div class="sec__head rv"><span class="lab">รีวิว</span><h2>คนไข้เขียนไว้ว่าอะไร</h2></div>
  <div class="grid2">
    ${reviews.slice(0,2).map(r => `<div class="rev rv">
      <span class="rev__src">${esc(r.src)}</span> <span class="rev__who">${esc(r.who)} · ${esc(r.prog)}</span>
      <p>${esc(r.text)}</p></div>`).join("\n    ")}
  </div>
  <p style="margin-top:1.4rem"><a class="more" href="reviews/">อ่านรีวิวทั้งหมด →</a></p>
</section>

<section class="sec wrap">
  <div class="sec__head rv">
    <span class="lab">เครื่องมือ & ความรู้</span>
    <h2>เครื่องไหนใหม่ และมันทำงานยังไง</h2>
    <p>เครื่องในสายนี้เปลี่ยนรุ่นทุกปี หน้านี้เขียนไว้ว่าคลินิกใช้ตัวไหน เข้ามาเมื่อไหร่ และมันช่วยเรื่องอะไรได้จริง</p>
  </div>
  <div class="grid3">
    ${machines.slice(0,3).map(m => `<div class="card rv">
      <h3>${esc(m.name)}${m.isNew ? ' <span class="lab">เข้าใหม่</span>' : ''}</h3>
      <p class="mut">${esc(m.origin)} · ${esc(m.arrived)}</p>
      <p>${esc(m.spec)}</p>
      <p class="mut"><b>ใช้กับ</b> ${esc(m.use)}</p>
    </div>`).join("\n    ")}
  </div>
  <p class="more-line"><a class="more" href="knowledge/">อ่านเรื่องเครื่องมือและการดูแลทั้งหมด →</a></p>
</section>

<script>
/* ตัวเลือกปัญหา — ไม่มีไลบรารี ข้อมูลฝังมาตอนสร้างหน้า จึงไม่มีการรอเน็ตรอบสอง */
(function(){
  var DATA = ${problemData};
  var picker=document.getElementById('picker'), none=document.getElementById('resultNone'),
      box=document.getElementById('resultBox'), body=document.getElementById('resultBody'),
      cap=document.getElementById('resultCap');
  function money(n){return n.toLocaleString('en-US');}
  function show(b, fromClick){
    [].forEach.call(picker.querySelectorAll('.pick'), function(x){ x.setAttribute('aria-pressed', String(x===b)); });
    var d=DATA.filter(function(x){return x.id===b.dataset.id;})[0]; if(!d) return;
    if(!d.rows.length){ none.hidden=false; box.hidden=true;
      none.textContent='ปัญหานี้ต้องให้แพทย์ดูก่อนถึงจะวางแผนได้ นัดประเมินได้โดยไม่มีค่าใช้จ่าย'; return; }
    none.hidden=true; box.hidden=false;
    cap.textContent='สำหรับ "'+d.label+'" — '+d.rows.length+' แผนที่ใช้ได้ เรียงตามยอดรวม';
    /* บนมือถือ ตารางผลอยู่ต่ำกว่าขอบจอ กดแล้วดูเหมือนไม่มีอะไรเกิดขึ้น (qc วัด y≈1220 บนจอ 844)
       เลื่อนให้เห็นเองเฉพาะจอแคบ ส่วนจอกว้างเห็นอยู่แล้วจึงไม่ต้องขยับ */
    if (fromClick && window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(function(){ box.scrollIntoView({behavior:'smooth', block:'start'}); });
    }
    body.innerHTML=d.rows.slice().sort(function(a,c){return a.total-c.total;}).map(function(r){
      return '<tr><td><a href="programs/'+r.slug+'/">'+r.name+'</a></td>'+
             '<td class="n">'+r.rounds+'</td><td class="r">'+r.gap+'</td>'+
             '<td class="r">'+r.down+'</td><td class="n">'+money(r.total)+'</td></tr>';
    }).join('');
  }
  picker.addEventListener('click', function(e){
    var b=e.target.closest('.pick'); if(b) show(b, true);
  });
  /* เปิดหน้ามาต้องมีคำตอบอยู่แล้ว — ของเดิมโชว์ "ยังไม่ได้เลือกปัญหา" ตรงจุดที่ขายได้ที่สุดของหน้า
     (ตารางราคาที่คู่แข่งไม่กล้าเขียน) แล้วรอให้คนกดก่อนถึงจะเห็น */
  show(picker.querySelector('.pick'), false);
})();
</script>`,
});
const made = [write("", home)];

/* ---------- โปรแกรม: hub + รายตัว ---------------------------------------- */
made.push(write("programs", shell({
  path: "programs/", title: `โปรแกรมทั้งหมด — ${site.name}`,
  desc: "โปรแกรมผิวหนังและเลเซอร์ทั้งหมดของคลินิก พร้อมจำนวนครั้ง ระยะห่างแต่ละครั้ง วันพักฟื้น และราคารวมต่อคอร์ส",
  body: `
<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">ตารางเปรียบเทียบ</span>
    <h1>โปรแกรมทั้งหมด</h1>
    <p>เรียงตามยอดรวมต่อคอร์ส ทุกบรรทัดกดเข้าไปดูได้ว่าเครื่องทำงานยังไง เหมาะกับใคร และไม่เหมาะกับใคร</p>
  </div>
  <div class="cards">
  ${programs.slice().sort((a,b)=>a.total-b.total).map(p => `<a class="card" href="${p.slug}/">
    <div class="card__art">
      <picture><source type="image/webp" srcset="${SRCSET("../", p.img)}" sizes="(max-width: 600px) 100vw, (max-width: 980px) 45vw, 366px">
        <img src="../img/${p.img}.jpg" alt="${esc(p.imgAlt)}" width="1400" height="933" loading="lazy" decoding="async"></picture>
      <span class="card__price">${baht(p.total)}</span>
    </div>
    <div class="card__body"><b>${esc(p.name)}</b><span>${p.rounds} ครั้ง · พักฟื้น ${esc(p.down)}</span></div></a>`).join("\n  ")}
  </div>

  <div class="scroll-x" style="margin-top:2.8rem">
    <table class="tbl">
      <thead><tr><th>โปรแกรม</th><th>ใช้กับ</th><th class="n">ครั้ง</th><th class="r">พักฟื้น</th><th class="n">ต่อครั้ง</th><th class="n">รวม (บาท)</th></tr></thead>
      <tbody>
      ${programs.slice().sort((a,b)=>a.total-b.total).map(p => `<tr>
        <td><a href="${p.slug}/">${esc(p.name)}</a></td>
        <td>${p.for.map(f => esc(problems.find(x=>x.id===f).label)).join(" · ")}</td>
        <td class="n">${p.rounds}</td><td class="r">${esc(p.down)}</td>
        <td class="n">${baht(p.per)}</td><td class="n">${baht(p.total)}</td></tr>`).join("\n")}
      </tbody>
    </table>
  </div>
  <p style="margin-top:2rem"><span class="stamp">ราคารวมแล้ว ไม่มีค่าใช้จ่ายแฝง</span></p>
</section>`,
})));

for (const p of programs) {
  made.push(write(`programs/${p.slug}`, shell({
    path: `programs/${p.slug}/`, title: `${p.name} — ${site.name}`,
    desc: `${p.name} ทำ ${p.rounds} ครั้ง ${p.gap} พักฟื้น ${p.down} รวม ${baht(p.total)} บาท — เหมาะกับใครและไม่เหมาะกับใคร อธิบายโดยแพทย์ผิวหนัง`,
    jsonld: { "@context":"https://schema.org", "@type":"MedicalProcedure", name:p.name,
      description:p.what, howPerformed:p.what, preparation:p.anes, url:`${site.base}/programs/${p.slug}/` },
    body: `
<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">ใบแผนการรักษา</span>
    <h1>${esc(p.name)}</h1>
    <p>${esc(p.what)}</p>
  </div>
  ${fig("../../", p.img, p.imgAlt, `${p.name} — ${p.anes}`, "figwide")}
  <div class="scroll-x">
    <table class="tbl">
      <caption>ตัวเลขของคอร์สนี้</caption>
      <tbody>
        <tr><th>จำนวนครั้ง</th><td class="r"><span class="num">${p.rounds}</span> ครั้ง</td></tr>
        <tr><th>ระยะห่าง</th><td class="r">${esc(p.gap)}</td></tr>
        <tr><th>พักฟื้น</th><td class="r">${esc(p.down)}</td></tr>
        <tr><th>ยาชา</th><td class="r">${esc(p.anes)}</td></tr>
        <tr><th>ราคาต่อครั้ง</th><td class="r"><span class="num">${baht(p.per)}</span> บาท</td></tr>
        <tr><th>รวมทั้งคอร์ส</th><td class="r"><b class="num">${baht(p.total)}</b> บาท</td></tr>
        ${p.slug === "potenza" ? `<tr><th>ราคาช่วงโปรโมชั่น</th><td class="r"><b class="num" style="color:var(--stamp)">28,000</b> บาท · ถึง 30 ต.ค. 2569</td></tr>` : ""}
        ${p.slug === "pico" ? `<tr><th>ครั้งแรกสำหรับลูกค้าใหม่</th><td class="r"><b class="num" style="color:var(--stamp)">1,900</b> บาท · ถึง 30 ก.ย. 2569</td></tr>` : ""}
      </tbody>
    </table>
  </div>

  <div class="grid2" style="margin-top:2.4rem">
    <div class="field"><span class="lab">เหมาะกับ</span><p>${esc(p.fit)}</p></div>
    <div class="field"><span class="lab">ไม่เหมาะกับ</span><p>${esc(p.notfit)}</p></div>
  </div>

  <div class="field" style="margin-top:1.8rem"><span class="lab">หลังทำต้องรู้</span>
    <ul class="ticks">${p.after.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>

  <p style="margin-top:2rem"><a class="btn" href="../../visit/">นัดประเมินก่อนตัดสินใจ</a>
     <a class="btn btn--ghost" href="../">ดูโปรแกรมอื่น</a></p>
</section>`,
  })));
}

/* ---------- โปรโมชั่น — แยกหน้าเพราะเปลี่ยนคนละจังหวะกับหน้าอื่น ---------- */
made.push(write("promotions", shell({
  path: "promotions/", title: `โปรโมชั่นเดือนนี้ — ${site.name}`,
  desc: "โปรโมชั่นที่ใช้ได้จริงตอนนี้ พร้อมวันหมดอายุและเงื่อนไขเขียนครบ ไม่มีดอกจันซ่อนท้าย",
  body: `
<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">อัปเดต 23 ส.ค. 2569</span>
    <h1>โปรโมชั่นเดือนนี้</h1>
    <p>ทุกอันเขียนวันหมดอายุและเงื่อนไขไว้ครบในหน้านี้ ถ้าเงื่อนไขไม่ตรงกับที่แจ้งหน้าเคาน์เตอร์ ยึดตามหน้านี้</p>
  </div>
  <div class="rows">
  ${promos.map((pr, i) => `<div class="row row--img rv">
    ${pic("../", promoImg[i], "ภาพประกอบโปรโมชั่น: บรรยากาศการดูแลผิวในคลินิก", SZ.side)}
    <div><span class="lab">${esc(pr.tag)} · ถึง ${esc(pr.until)}</span>
    <h3>${esc(pr.title)}</h3>
    <p>${esc(pr.body)}</p>
    ${pr.was ? `<div class="meta"><span>ปกติ <b class="num">${baht(pr.was)}</b> บาท</span><span>ช่วงนี้ <b class="num">${baht(pr.now)}</b> บาท</span></div>` : ""}
    </div>
  </div>`).join("\n  ")}
  </div>
  <p style="margin-top:2rem"><span class="stamp">ราคานี้ถึง 31 ต.ค. 2569</span></p>
</section>`,
})));

/* ---------- ความรู้/เครื่องมือ — 5/5 ของตลาดมี ของเดิมไม่มีเลย ------------ */
made.push(write("knowledge", shell({
  path: "knowledge/", title: `เครื่องมือ & ความรู้ — ${site.name}`,
  desc: "อธิบายว่าเครื่องแต่ละตัวทำงานยังไง ต่างกันตรงไหน และเคสแบบไหนควรใช้ตัวไหน เขียนโดยแพทย์ผิวหนังของคลินิก",
  body: `
<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">เขียนโดยแพทย์ของคลินิก</span>
    <h1>เครื่องมือ &amp; ความรู้</h1>
    <p>เครื่องที่คลินิกใช้อยู่ตอนนี้ เข้ามาเมื่อไหร่ มาจากไหน และมันทำงานยังไง — ไม่ใช่หน้าขายเครื่อง แต่เป็นคำอธิบายว่าทำไมเคสหนึ่งถึงเหมาะกับเครื่องหนึ่ง เพื่อให้คุณถามหมอได้ตรงจุดขึ้นตอนมาถึง</p>
  </div>
  <div class="cards" style="margin-bottom:3rem">
  ${machines.map(m => `<div class="card card--mach rv">
    <b>${esc(m.name)} ${m.isNew ? '<i class="tagnew">เข้าใหม่</i>' : ""}</b>
    <span>${esc(m.origin)} · ${esc(m.arrived)}</span>
    <p style="font-size:.92rem;margin:.6rem 0 0">${esc(m.how)}</p>
    <div class="meta" style="margin-top:.8rem"><span>${esc(m.spec)}</span></div>
    <div class="meta"><b>ใช้กับ</b> <span>${esc(m.use)}</span></div>
  </div>`).join("\n  ")}
  </div>

  <h2 style="margin-bottom:1.4rem">อ่านก่อนตัดสินใจ</h2>
  <div class="rows">
  ${articles.map((a, i) => `<article class="row rv" id="${a.slug}">
    ${fig("../", articleImg[i], "ภาพประกอบบทความ: การทำหัตถการผิวหนังในคลินิก", "")}
    <h3>${esc(a.title)}</h3>
    <p style="color:var(--ink-2)">${esc(a.lead)}</p>
    ${a.body.map(b => `<p>${esc(b)}</p>`).join("\n    ")}
    <div class="meta"><span>${esc(a.fact)}</span></div>
  </article>`).join("\n  ")}
  </div>
</section>`,
})));

/* ---------- คนหล่อสวย: ลูกค้าที่มาใช้บริการจริง -----------------------------
   บล็อกที่ jek ชี้ว่าคลินิกไทยต้องมี — Timeless ให้พื้นที่หน้าแรกมากที่สุด
   ต่างจากหน้ารีวิวตรงที่รีวิวคือ "เขาพูดว่าอะไร" ส่วนหน้านี้คือ "ใครมาบ้าง มานานแค่ไหน" */
made.push(write("customers", shell({
  path: "customers/", title: `คนหล่อสวยที่ไว้ใจให้เราดูแล — ${site.name}`,
  desc: "ลูกค้าที่มาต่อเนื่อง พร้อมโปรแกรมที่ทำและระยะเวลาที่มาดูแลกับเรา",
  body: `
<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">ขอบคุณที่ไว้ใจให้เราดูแล</span>
    <h1>คนหล่อสวยของโกลว์</h1>
    <p>คนที่มาต่อเนื่องมากกว่าหนึ่งคอร์ส เขียนไว้ว่าทำอะไรและมานานแค่ไหน — ไม่ได้คัดเฉพาะเคสที่ผลดีที่สุด</p>
  </div>
  <div class="people">
  ${customers.map(c => `<figure class="person rv">
    <picture><source type="image/webp" srcset="${SRCSET("../", c.img)}" sizes="(max-width: 520px) 100vw, (max-width: 1000px) 45vw, 266px">
      <img src="../img/${c.img}.jpg" alt="ภาพลูกค้าของคลินิก คุณ${esc(c.name)}" width="700" height="933" loading="lazy" decoding="async"></picture>
    <figcaption><b>คุณ${esc(c.name)}</b><span>${esc(c.prog)} · ${esc(c.since)}</span><q>${esc(c.say)}</q></figcaption>
  </figure>`).join("\n  ")}
  </div>
  <p style="margin-top:2.4rem"><span class="stamp">งานสาธิต · ภาพประกอบ ไม่ใช่ลูกค้าจริง</span></p>
</section>`,
})));

/* ---------- รีวิว — เก็บที่มาไว้ให้เห็น เพราะแหล่งคือสิ่งที่ทำให้เชื่อ -------- */
made.push(write("reviews", shell({
  path: "reviews/", title: `รีวิวจากคนไข้ — ${site.name}`,
  desc: "รีวิวจากคนไข้จริงบน Google, Facebook และ Wongnai รวมทั้งรีวิวที่บอกว่าผลไม่ได้เป็นอย่างที่หวัง",
  body: `
<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">รวมจาก Google · Facebook · Wongnai</span>
    <h1>รีวิวจากคนไข้</h1>
    <p>เก็บมาทั้งอันที่ชมและอันที่บอกว่าผลไม่เป็นอย่างที่หวัง เพราะรีวิวที่ดีทุกอันคือรีวิวที่คัดมาแล้ว และคนอ่านออก</p>
  </div>
  ${fig("../", "care-facial", "เจ้าหน้าที่กำลังดูแลผิวหน้าให้คนไข้ในห้องทรีตเมนต์", "ห้องทรีตเมนต์ — คนไข้ที่รีวิวด้านล่างผ่านห้องนี้มาแล้วทั้งหมด", "figwide")}
  <div class="grid2">
  ${reviews.map(r => `<div class="rev rv">
    <span class="rev__src">${esc(r.src)}</span> <span class="rev__who">${esc(r.who)} · ${esc(r.when)} · ${esc(r.prog)}</span>
    <p>${esc(r.text)}</p></div>`).join("\n  ")}
  </div>
</section>`,
})));

/* ---------- แพทย์ — 2/5 ของตลาด แต่เป็นข้อโต้แย้งของร้านนี้ จึงเก็บ -------- */
made.push(write("doctor", shell({
  path: "doctor/", title: `แพทย์ผู้ตรวจ — ${site.name}`,
  desc: "แพทย์ผิวหนังที่ตรวจเองทุกเคส พร้อมวันที่ออกตรวจของแต่ละท่าน",
  body: `
<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">ผู้ที่จะส่องผิวให้คุณ</span>
    <h1>แพทย์ผู้ตรวจ</h1>
    <p>ทุกเคสประเมินโดยแพทย์ผิวหนัง ไม่มีขั้นตอนที่ต้องคุยกับที่ปรึกษาความงามก่อน</p>
  </div>
  ${fig("../", "exam-derm", "ภาพผิวขยายจากกล้องส่องผิวบนแท็บเล็ต", "ทุกเคสเริ่มที่การส่องผิวและเก็บภาพไว้เทียบรอบถัดไป", "figwide")}
  <div class="rows">
  ${doctors.map(d => `<div class="row row--img rv">
    ${pic("../", d.img, `ภาพเหมือน ${d.name} สวมเสื้อกาวน์`, SZ.side)}
    <div><h3>${esc(d.name)}</h3>
    <div class="meta"><b>${esc(d.role)}</b></div>
    <ul class="ticks" style="margin:1rem 0">${d.cred.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
    <p style="font-family:var(--serif);font-size:1.05rem">“${esc(d.say)}”</p>
    </div>
  </div>`).join("\n  ")}
  </div>
</section>`,
})));

/* ---------- ที่ตั้ง / นัดหมาย ---------------------------------------------- */
made.push(write("visit", shell({
  path: "visit/", title: `ที่ตั้งและการนัดหมาย — ${site.name}`,
  desc: `${site.addr} เปิด ${site.hours} นัดล่วงหน้าได้ 30 วัน ประเมินผิวโดยแพทย์ไม่มีค่าใช้จ่าย`,
  body: `
<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">มาถึงแล้วเจออะไร</span>
    <h1>ที่ตั้ง · นัดหมาย</h1>
  </div>
  <div class="mapbox" style="margin-bottom:2rem">
    <iframe title="แผนที่ที่ตั้งคลินิก" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
      src="https://www.google.com/maps?q=13.7318,100.5822&hl=th&z=16&output=embed"></iframe>
  </div>
  <p style="margin-bottom:2rem"><a class="btn btn--ghost" href="https://www.google.com/maps/dir/?api=1&destination=13.7318,100.5822" target="_blank" rel="noopener">เปิดเส้นทางใน Google Maps</a></p>

  ${pic("../", "room-clinic", "ห้องตรวจของคลินิก มีเตียงตรวจและเครื่องมือจัดไว้พร้อม", SZ.wide, { cap: "ห้องตรวจชั้น 2 — ส่องผิวและคุยแผนในห้องเดียวกัน ไม่มีการย้ายไปห้องขายคอร์ส", cls: "figwide" })}
  <div class="grid2">
    <div class="field"><span class="lab">ที่อยู่</span>
      <p>${esc(site.addr)}</p>
      <p style="color:var(--ink-2);font-size:.92rem">เดินจาก BTS ทองหล่อ ทางออก 3 ราว 6 นาที · จอดรถฟรี 2 ชั่วโมง</p></div>
    <div class="field"><span class="lab">เวลาทำการ</span>
      <p>${esc(site.hours)}</p>
      <p style="color:var(--ink-2);font-size:.92rem">นัดล่วงหน้าได้ 30 วัน เลือกวันให้พักฟื้นตรงกับวันหยุดได้</p></div>
  </div>

  <div class="field" style="margin-top:1.8rem"><span class="lab">ลำดับในวันที่มา</span>
    <div class="scroll-x"><table class="tbl">
      <tbody>
        <tr><th class="n">1</th><td>ลงทะเบียนและซักประวัติ — ราว 10 นาที</td></tr>
        <tr><th class="n">2</th><td>แพทย์ส่องผิวด้วยกล้องและถ่ายภาพแสงข้างไว้เทียบรอบถัดไป</td></tr>
        <tr><th class="n">3</th><td>คุยแผน จำนวนครั้ง วันพักฟื้น และยอดรวม เขียนลงใบแผนให้ถือกลับ</td></tr>
        <tr><th class="n">4</th><td>ตัดสินใจว่าจะทำวันนี้ กลับไปคิดก่อน หรือไม่ทำ — ทั้งสามทางไม่มีค่าใช้จ่าย</td></tr>
      </tbody></table></div></div>

  <p style="margin-top:2rem">
    <a class="btn" href="#book">นัดผ่านแบบฟอร์ม</a>
    <a class="btn btn--ghost" href="tel:${site.phone.replace(/[^0-9]/g,"")}">โทรหาคลินิก</a></p>
  <div class="field" id="book" style="margin-top:2.4rem"><span class="lab">แบบฟอร์มนัดหมาย</span>
    <p style="margin-bottom:1.2rem">กรอกแล้วเจ้าหน้าที่จะติดต่อกลับยืนยันคิวภายในวันทำการเดียวกัน — ยังไม่ถือเป็นการจอง จนกว่าจะได้รับการยืนยัน</p>
    <form class="bookform" id="bookform" novalidate>
      <label>ชื่อที่ให้เรียก<input name="name" type="text" autocomplete="name" required></label>
      <label>เบอร์ติดต่อกลับ<input name="tel" type="tel" inputmode="tel" autocomplete="tel" required></label>
      <label>ปัญหาที่อยากปรึกษา<select name="issue">
        ${problems.map(pb => `<option>${esc(pb.label)}</option>`).join("")}
        <option>ยังไม่แน่ใจ อยากให้แพทย์ดูก่อน</option></select></label>
      <label>ช่วงเวลาที่สะดวก<select name="slot">
        <option>วันธรรมดา ช่วงเช้า</option><option>วันธรรมดา ช่วงบ่าย</option>
        <option>วันธรรมดา หลังเลิกงาน</option><option>เสาร์–อาทิตย์</option></select></label>
      <label class="wide">อยากบอกอะไรเพิ่มเติมไหม<textarea name="note" rows="3"></textarea></label>
      <button class="btn" type="submit">ส่งเรื่องนัดหมาย</button>
      <p class="formnote" id="formnote" role="status"></p>
    </form>
  </div>

  <p style="margin-top:2rem"><span class="stamp">ประเมินโดยแพทย์ ไม่มีค่าใช้จ่าย</span></p>
</section>

<script>
/* เดโมไม่มีหลังบ้าน จึงตอบกลับในหน้าเลย และบอกตรงๆ ว่านี่คือหน้าสาธิต
   ไม่ปล่อยให้ฟอร์มยิงไปไหนแล้วเงียบ ซึ่งแย่กว่าไม่มีฟอร์ม */
(function(){
  var f=document.getElementById('bookform'), n=document.getElementById('formnote');
  if(!f) return;
  f.addEventListener('submit', function(e){
    e.preventDefault();
    var name=f.name.value.trim(), tel=f.tel.value.trim();
    if(!name||!tel){ n.className='formnote formnote--err'; n.textContent='กรอกชื่อกับเบอร์ติดต่อกลับก่อนนะครับ'; return; }
    n.className='formnote formnote--ok';
    n.textContent='รับเรื่องแล้ว คุณ'+name+' — หน้านี้เป็นงานสาธิต ระบบจริงจะส่งเข้าไลน์ของคลินิกและขึ้นในตารางคิวทันที';
    f.querySelector('button').disabled=true;
  });
})();
</script>`,
})));

/* 404 + sitemap — แพ็ก 2 ใน TIER-SPEC บังคับสองอย่างนี้ · ฉบับ 5 หน้าเดิมมีครบ
   ตัวใหม่เกือบหลุดเพราะ build.mjs เขียนเฉพาะหน้าที่อยู่ในลิสต์ (จับได้ตอน git บอกว่า 404.html หายไป) */
writeFileSync(join(ROOT, "404.html"), shell({
  path: "", title: `ไม่พบหน้านี้ — ${site.name}`, desc: "ไม่พบหน้าที่เรียก",
  body: `
<section class="sec wrap">
  <div class="sec__head">
    <span class="lab">404</span>
    <h1>ไม่พบหน้าที่คุณเรียก</h1>
    <p>ลิงก์อาจเก่าไปแล้ว หรือหน้านั้นถูกย้าย — เริ่มจากตรงนี้ได้เลย</p>
  </div>
  <ul class="mut" style="line-height:2.1">
    ${NAV.map(([h,t]) => `<li><a class="more" href="/work/glow-clinic-multi/${h}">${esc(t)} →</a></li>`).join("\n    ")}
  </ul>
</section>`,
}).replace("<head>", '<head>\n<meta name="robots" content="noindex,nofollow">'));

writeFileSync(join(ROOT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  made.map(u => `  <url><loc>${site.base}/${u === "/" ? "" : u}</loc></url>`).join("\n") +
  `\n</urlset>\n`);

console.log("สร้างแล้ว " + made.length + " หน้า + 404.html + sitemap.xml:\n  " + made.join("\n  "));
