/* nav-response.js — กลไกกลางของ playbook: หัวเว็บหดตอนเลื่อน + ไฮไลต์หัวข้อที่กำลังอ่าน
   website.md §11 ข้อ 5 เรียกสองอย่างนี้ว่า "มาตรฐานขั้นต่ำ ไม่ใช่ของแถม"

   ไฟล์นี้ต้องเหมือนกันทุกเดโม (ก๊อปทั้งไฟล์ ห้ามแก้รายชิ้น) — วัดด้วย
   check-demo-rules.mjs แล้วพบว่ารูนี้ตกเหมือนกัน 9 ใน 10 ชิ้น คือรูของ "ประเภท"
   ไม่ใช่ของรายชิ้น จึงต้องแก้ด้วยกลไกเดียว ค่าที่ต่างกันได้มีแค่ตัวเลขความสูงใน CSS

   ไม่ผูกกับชื่อคลาสของเดโมไหนเลย: หา <header> ตัวแรก แล้วอ่านลิงก์ #.. ในนั้น
   scroll-spy ไม่ปิดตาม reduced-motion เพราะเป็น "สถานะ" ไม่ใช่การเคลื่อนไหว */
(() => {
  const h = document.querySelector("header");
  if (!h) return;

  /* เอาเฉพาะ "ลิงก์สารบัญ" ไม่เอาปุ่ม CTA ที่บังเอิญชี้ไป #section ด้วย —
     ปุ่มทึบที่โดนย้อมสี accent ตอนเป็นหัวข้อปัจจุบัน = ตัวหนังสือสีเดียวกับพื้นปุ่ม
     แล้วข้อความหายทั้งปุ่ม (เจอจริงกับปุ่ม "ขอใบเสนอราคา" ของเดอะ เทอเรส 22/8/26)
     และในเชิงความหมาย ปุ่มลงมือทำก็ไม่ใช่ "หัวข้อที่กำลังอ่าน" อยู่แล้ว */
  const isPlainLink = (a) => {
    const bg = getComputedStyle(a).backgroundColor;
    return bg === "transparent" || /,\s*0\s*\)$/.test(bg);
  };
  const links = [...h.querySelectorAll('a[href^="#"]')]
    .filter((a) => a.getAttribute("href").length > 1 && isPlainLink(a));
  const targets = links
    .map((a) => { try { return document.querySelector(a.getAttribute("href")); } catch { return null; } })
    .filter(Boolean);

  /* หัวข้อที่ "กำลังอ่าน" = อันสุดท้ายที่ขอบบนของมันเลยเส้น 35% ของจอไปแล้ว
     เคยเขียนด้วย IntersectionObserver กรอบแคบกลางจอ แล้วเจอว่าถ้าจังหวะที่วัด
     ไม่มี section ไหนอยู่ในกรอบพอดี (เลื่อนค้างอยู่ในฮีโร่หรือในบล็อกที่สูงมาก)
     จะไม่มีลิงก์ไหนถูกไฮไลต์เลย — summit ตกด้วยเหตุนี้ทั้งที่กลไกทำงานอยู่
     วิธีนี้ตอบได้เสมอว่า "ตอนนี้อยู่ในหัวข้อไหน" ไม่มีช่องว่างระหว่างหัวข้อ */
  /* ---- หัวเว็บต้องไม่กินที่ในสายเลย์เอาต์ (25/8/26) ---------------------------
     อาการ: พอเริ่มเลื่อนแล้ว "ทั้งหน้า" ขยับขึ้นพร้อมกัน — วัดด้วย
     playbook/audit-firstpaint.mjs ได้ chang-chat 65px · gamedock 46px ·
     homecraft 33px · glow-clinic 28px · glow-clinic-multi 13px · krua-baansuan 12px
     สาเหตุ: หัวเว็บของใบพวกนี้เป็น position:sticky ซึ่ง **ยังกินที่ในสายเลย์เอาต์ปกติ**
     พอคลาส .small ทำให้มันเตี้ยลง ของข้างล่างทั้งหมดจึงเลื่อนขึ้นตามส่วนต่างนั้น
     และหลายใบมี transition: height ด้วย = เลื่อนทีละเฟรมตลอดช่วงทรานซิชัน
     ผิด DEMO-SPEC S2.3 (ห้ามอนิเมตของที่กระทบเลย์เอาต์)

     ทำไมแก้ที่นี่ ไม่ใช่ไล่แก้ CSS ทีละใบ: กลไกการหดของแต่ละใบไม่เหมือนกันเลย
     (บางใบ height !important · บางใบ min-height ของลูก · บางใบไม่มีในซีเอสเอส)
     แต่ทุกใบหดเพราะคลาส .small ที่ไฟล์นี้เป็นคนเติม — ไฟล์นี้จึงเป็นจุดเดียวที่
     คุมได้ครบทั้งชุด แก้ที่นี่ = ของชนิดเดียวกันใช้กลไกเดียวกันจริง

     วิธี: ยกหัวเว็บออกนอกสายเลย์เอาต์ (fixed) แล้วจองที่ให้เท่าความสูง "ตอนยังไม่หด"
     ด้วย padding-top ของ body — ภาพที่ออกมาเหมือนเดิมทุกประการ ต่างแค่ไม่มีอะไรขยับ
     • แตะเฉพาะใบที่ยังเป็น sticky — the-bed / the-terrace / lumen / the-bed-multi
       เป็น fixed อยู่แล้ว ข้ามไป ไม่ไปยุ่งกับของที่ไม่ได้พัง
     • วัดความสูงฐานตอนอยู่บนสุดเท่านั้น (scrollY <= 120 = ยังไม่ติด .small)
       จึงได้ค่าจริงเสมอโดยไม่ต้องถอดคลาสออกมาวัดกลางคัน (ซึ่งจะเห็นเป็นแถบกระพริบ)
     • ย่อจอแล้ววัดใหม่ให้เอง เพราะความสูงหัวเว็บของหลายใบมาจากเนื้อข้างใน ไม่ใช่ px ตายตัว
     • **ยกเฉพาะหัวเว็บที่อยู่บนสุดของหน้าจริงๆ** — gamedock มี div.topbar สูง 35px วางอยู่
       เหนือหัวเว็บในสายเลย์เอาต์ ถ้ายกหัวเว็บไป top:0 มันจะไปทับ topbar = พังกว่าเดิม
       ใบแบบนั้นต้องแก้มือทีละใบ ด่านนี้จึงข้ามไปเงียบๆ ไม่ใช่ฝืนยก
     • JS ไม่ทำงาน = ได้พฤติกรรมเดิม (sticky) ซึ่งอ่านได้ปกติ แค่มีอาการเลื่อนกลับมา */
  let hdBase = 0;
  const liftHeader = () => {
    /* ยกได้เฉพาะหัวเว็บที่ไม่มีอะไร "ในสายเลย์เอาต์" วางอยู่เหนือมัน — ดูเหตุผลข้างบน
       เช็ค previousElementSibling ที่กินที่จริง ไม่ใช่เช็ค offsetTop > 0 เฉยๆ
       เพราะลิงก์ข้ามเมนู (a.skip) ของหลายใบเป็น absolute ซึ่งไม่กินที่แต่ทำให้ offsetTop
       ไม่เป็นศูนย์ — เช็คแบบหยาบทำให้ chang-chat กับ summit ถูกข้ามผิดไปหนึ่งรอบ */
    for (let s = h.previousElementSibling; s; s = s.previousElementSibling) {
      const p = getComputedStyle(s).position;
      if (s.offsetHeight > 0 && (p === "static" || p === "relative")) return;
    }
    if (getComputedStyle(h).position === "sticky") {
      h.style.position = "fixed";
      h.style.left = "0"; h.style.right = "0"; h.style.top = "0";
    }
    if (h.style.position !== "fixed") return;          /* ใบที่ตั้ง fixed มาจาก CSS เองก็ข้าม */
    if (scrollY > 120) return;                          /* ไม่ได้อยู่บนสุด = ความสูงตอนนี้คือค่าที่หดแล้ว */
    const base = h.offsetHeight;
    if (base && base !== hdBase) { hdBase = base; document.body.style.paddingTop = base + "px"; }
  };

  const LINE = 0.35;
  let queued = false;
  const paint = () => {
    queued = false;
    liftHeader();
    h.classList.toggle("small", scrollY > 120);
    if (!targets.length) return;
    /* ยังอยู่บนสุดของหน้า = ยังไม่ได้ "อ่าน" หัวข้อไหน จึงไม่ไฮไลต์อะไรเลย
       (ใช้เกณฑ์เดียวกับตอนหดหัวเว็บ ไม่ตั้งเลขที่สองให้จำสองค่า) — ถ้าไฮไลต์
       หัวข้อแรกไว้ตั้งแต่ยังไม่เลื่อน ป้ายจะนิ่งค้างจนคนไม่รู้ว่ามันเดินตามการอ่าน */
    const line = innerHeight * LINE;
    let cur = null;
    if (scrollY > 120) for (const t of targets) if (t.getBoundingClientRect().top <= line) cur = t;
    for (const a of links) a.classList.toggle("on", !!cur && a.getAttribute("href") === "#" + cur.id);
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  paint();
})();

/* ---- ล็อกความกว้างตัวเลขนับ (25/8/26) ---------------------------------------
   อาการ: ตัวเลขที่นับขึ้น (0 → 480) ตัวหนังสือโตจาก 1 หลักเป็น n หลัก ความกว้างจึง
   เปลี่ยนทุกเฟรม ของที่อยู่ข้างๆ ถูกดันไปมา ~60 ครั้ง/วินาที = แถบตัวเลขกระตุก
   วัดได้: krua-baansuan 12px · homecraft 10px · glow-clinic 8px · the-bed 5px

   ลองมาแล้วห้าท่า พังสี่ท่าแรก บันทึกไว้กันทำซ้ำ:
   1 `min-width: Nch` — 1ch คือความกว้างตัวอักษร "0" ซึ่งไม่ตรงกับความกว้างตัวเลขจริง
   2 `font-variant-numeric: tabular-nums` — ไม่ทำงานถ้าฟอนต์ไม่มีฟีเจอร์นี้
     วัดบน Cinzel: "18" = 12.4px แต่ "00" = 16.5px ทั้งที่ computed style เขียว
   3 เติม U+2007 FIGURE SPACE — ฟอนต์ต้องมีตัวนี้ด้วย
     วัดบน Cinzel: U+2007+"0" = 12.1px ส่วน "00" = 16.5px
   4 `min-width` เป็น px **พร้อมสลับ display เป็น inline-block** (เพราะ min-width
     ไม่มีผลกับ inline) — **ตัวสลับ display นี่แหละคือตัวปัญหา** inline กับ inline-block
     คิดความสูงบรรทัดคนละแบบ กล่องจึงสูงขึ้น วัดได้ 16px บนแถบล่างของฮีโร่ the-bed
     และเพราะฮีโร่จัดชิดล่าง (items-end) ทุกอย่างเหนือมันถูกดันขึ้น 16px
     = "ตัวอักษรฮีโร่โผล่แล้วเลื่อนขึ้น" ที่เจ้าของฟ้อง — ผมสร้างเองกับมือ

   ท่าที่ใช้จริง: **ชดเชยด้วย padding-right ไม่แตะ display ไม่แตะ width**
   padding แนวนอนบนอีลิเมนต์ inline มีผลกับความกว้างอย่างเดียว ไม่แตะความสูงบรรทัดเลย
   จึงเป็นไปไม่ได้ที่จะไปดันอะไรในแนวตั้ง
   • ทุกเฟรมที่ตัวหนังสือเปลี่ยน วัดความกว้างตอนนี้ แล้วเติม padding ให้รวมได้เท่าค่าปลายทาง
   • ความกว้างของค่าปลายทางวัดครั้งเดียวแล้วจำไว้ ไม่ต้องวัดซ้ำทุกเฟรม
   • ปล่อยเมื่อถึงค่าปลายทาง หรืออย่างช้า 4 วินาที แล้ว padding กลับเป็นศูนย์
     กล่องจึงไม่มีอะไรค้างไว้เลยหลังนับจบ (ท่าที่ล็อกถาวรเคยทำ lumen ล้นจอ 56px) */
(() => {
  for (const el of document.querySelectorAll("[data-count], .num")) {
    const final = el.textContent;
    if (!final.trim()) continue;
    let timer = 0, wFinal = 0;
    const release = () => { clearTimeout(timer); timer = 0; el.style.paddingRight = ""; };
    const obs = new MutationObserver(() => {
      if (el.textContent === final) { if (timer) release(); return; }
      const cur = el.textContent;
      el.style.paddingRight = "0px";
      if (!wFinal) { el.textContent = final; wFinal = el.getBoundingClientRect().width; el.textContent = cur; }
      const now = el.getBoundingClientRect().width;
      const pad = wFinal - now;
      el.style.paddingRight = pad > 0 ? pad.toFixed(2) + "px" : "";
      if (!timer) timer = setTimeout(release, 4000);
    });
    obs.observe(el, { childList: true, characterData: true, subtree: true });
  }
})();
