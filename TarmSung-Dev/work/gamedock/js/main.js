/* GAMEDOCK — สคริปต์หน้าเว็บ
   เดโมนี้ยังไม่มีหลังบ้าน สคริปต์จึงทำแค่สองอย่างที่ต้องเห็นว่าทำงานจริง:
   นาฬิกาแฟลชเซล กับ ปุ่มกรองเครื่อง — ตอนต่อฐานข้อมูลจริงในเฟสถัดไป
   ปุ่มกรองชุดเดิมจะเปลี่ยนไปยิงคิวรี ไม่ต้องรื้อ markup */
(() => {
  'use strict';

  /* ---- นาฬิกานับถอยหลังแฟลชเซล ----
     ตั้งจากเวลาปัจจุบันของผู้ชม ไม่ใช่วันหมดอายุตายตัว เพื่อไม่ให้เดโมที่เปิดดู
     ปีหน้ากลายเป็น 00:00:00 ซึ่งทำให้ทั้งหน้าดูเป็นของที่ไม่มีคนดูแล */
  const clock = document.querySelector('[data-countdown]');
  if (clock) {
    const h = clock.querySelector('[data-h]');
    const m = clock.querySelector('[data-m]');
    const s = clock.querySelector('[data-s]');
    const pad = (n) => String(n).padStart(2, '0');
    // จบรอบตอนเที่ยงคืนของวันนี้ = "ลดราคาวันนี้" ที่เป็นจริงตามชื่อ
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      const left = Math.max(0, Math.floor((end - now) / 1000));
      h.textContent = pad(Math.floor(left / 3600));
      m.textContent = pad(Math.floor((left % 3600) / 60));
      s.textContent = pad(left % 60);
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---- ช่องเรียงลำดับบนหน้าแรก ----
     หน้าแรกโชว์สินค้าชุดที่เลือกไว้แล้ว การเรียงใหม่จึงต้องไปทำที่หน้าผลกรอง
     ซึ่งมีของครบทั้งคลัง ไม่ใช่เรียง 12 ใบที่บังเอิญอยู่บนหน้านี้ */
  const sorter = document.querySelector('[data-sort-go]');
  if (sorter) {
    sorter.addEventListener('change', () => { location.href = 'shop.html?sort=' + sorter.value; });
  }
})();

/* ---- ปุ่ม "ใส่ตะกร้า" ทุกจุดในหน้า ----
   ใช้ตัวจับเดียวที่ระดับ document แทนการผูกทีละปุ่ม เพราะการ์ดถูกสร้างจากข้อมูล
   ปุ่มจึงอาจเพิ่ม/หายได้ — ของชนิดเดียวกันใช้กลไกเดียวกันทั้งเว็บ */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add]');
  if (!btn || !window.Store) return;
  e.preventDefault();
  const r = Store.addToCart(btn.dataset.add, 1);
  const old = btn.textContent;
  btn.textContent = r.ok ? 'ใส่ตะกร้าแล้ว' : r.msg;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1500);
});

/* ---- เอนจิ้นเข้าฉาก + แถบนำทางตอบสนองการเลื่อน (กฎ §11 ข้อ 3 และ 5) ----
   ตัวจับตัวเดียวคุมทุกส่วน หน้าตาของเอฟเฟกต์อยู่ที่ CSS ตาม data-fx
   ไม่มีสคริปต์ที่สองที่ทำงานคล้ายกัน และหยุดทั้งหมดถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหว */
(() => {
  'use strict';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const groups = document.querySelectorAll('[data-fx]');
  if (groups.length) {
    if (still) {
      groups.forEach((g) => g.classList.add('in'));
    } else {
      // หน่วงไล่ทีละชิ้นในกลุ่ม ให้เข้าเป็นจังหวะ ไม่ใช่โผล่พร้อมกันทั้งแถว
      groups.forEach((g) => {
        [...g.children].forEach((el, i) => el.style.setProperty('--d', Math.min(i, 7) * 70 + 'ms'));
      });
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          io.unobserve(e.target);   // เข้าฉากครั้งเดียว ไม่ใช่เด้งซ้ำทุกครั้งที่เลื่อนผ่าน
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
      groups.forEach((g) => io.observe(g));
    }
  }

  const header = document.querySelector('.site-header');
  const spy = [...document.querySelectorAll('.pagenav a[href^="#"]')]
    .map((a) => ({ a, el: document.getElementById((a.getAttribute('href').split('#')[1] || '')) }))
    .filter((x) => x.el);

  if (header) {
    let ticking = false;
    const onScroll = () => {
      header.classList.toggle('small', scrollY > 90);   /* ชื่อคลาสกลางของทั้งกอง (26/8/26) */
      if (spy.length) {
        // หมวดที่ "กำลังอ่าน" = ส่วนสุดท้ายที่ขอบบนเลยกลางจอมาแล้ว
        const mid = scrollY + innerHeight * 0.4;
        let now = null;
        spy.forEach((s) => { if (s.el.offsetTop <= mid) now = s; });
        spy.forEach((s) => s.a.classList.toggle('is-here', s === now));
      }
      ticking = false;
    };
    addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(onScroll);
    }, { passive: true });
    onScroll();
  }
})();
/* ---- หัวเว็บต้องไม่กินที่ในสายเลย์เอาต์ (25/8/26) -----------------------------
   สำเนาตรงจาก js/nav-response.js — **สองไฟล์นี้ต้องเหมือนกันเสมอ** แก้ที่ไหนต้องแก้อีกที่
   ทำไมต้องมีสำเนา: ใบนี้ไม่ได้โหลด nav-response.js (มีสคริปต์ของตัวเอง) แต่เป็นบั๊ก
   ชนิดเดียวกัน — หัวเว็บ position:sticky ยังกินที่ในสายเลย์เอาต์ พอมันเตี้ยลงตอนเลื่อน
   ของข้างล่างทั้งหมดจึงเลื่อนขึ้นตาม (วัดได้ gamedock 46px · krua-baansuan 12px)

   ตัวนี้ **ไม่ผูกกับชื่อคลาสที่ใช้หด** โดยตั้งใจ — แต่ละใบตั้งชื่อเอง (.small · .is-small ·
   .is-stuck) ถ้าไปอิงชื่อจะพลาดใบที่ตั้งชื่ออื่นอีกในอนาคต ตัวนี้แค่ยกหัวเว็บออกนอก
   • **ยกเฉพาะหัวเว็บที่อยู่บนสุดของหน้าจริงๆ** — gamedock มี div.topbar สูง 35px วางอยู่
       เหนือหัวเว็บในสายเลย์เอาต์ ถ้ายกหัวเว็บไป top:0 มันจะไปทับ topbar = พังกว่าเดิม
       ใบแบบนั้นต้องแก้มือทีละใบ ด่านนี้จึงข้ามไปเงียบๆ ไม่ใช่ฝืนยก
   สายเลย์เอาต์ตั้งแต่ตอนโหลด แล้วจองที่ให้เท่าความสูงตอนยังไม่หด จากนั้นใครจะหดยังไงก็ได้ */
(() => {
  const h = document.querySelector("header");
  if (!h || h.dataset.lifted) return;
  let base = 0;
  const lift = () => {
    /* ยกได้เฉพาะหัวเว็บที่ไม่มีอะไร "ในสายเลย์เอาต์" วางอยู่เหนือมัน — ดูเหตุผลข้างบน
       เช็ค previousElementSibling ที่กินที่จริง ไม่ใช่เช็ค offsetTop > 0 เฉยๆ
       เพราะลิงก์ข้ามเมนู (a.skip) ของหลายใบเป็น absolute ซึ่งไม่กินที่แต่ทำให้ offsetTop
       ไม่เป็นศูนย์ — เช็คแบบหยาบทำให้ chang-chat กับ summit ถูกข้ามผิดไปหนึ่งรอบ */
    for (let s = h.previousElementSibling; s; s = s.previousElementSibling) {
      const p = getComputedStyle(s).position;
      if (s.offsetHeight > 0 && (p === "static" || p === "relative")) return;
    }
    if (getComputedStyle(h).position === "sticky") {
      h.style.position = "fixed"; h.style.left = "0"; h.style.right = "0"; h.style.top = "0";
      h.dataset.lifted = "1";
    }
    if (h.style.position !== "fixed") return;
    if (scrollY > 120) return;              /* ไม่ได้อยู่บนสุด = ความสูงตอนนี้คือค่าที่หดแล้ว */
    const b = h.offsetHeight;
    if (b && b !== base) { base = b; document.body.style.paddingTop = b + "px"; }
  };
  lift();
  addEventListener("scroll", lift, { passive: true });
  addEventListener("resize", lift, { passive: true });
})();

/* หมายเหตุเฉพาะใบนี้: gamedock **จะถูกด่านข้าม** เพราะมี div.topbar สูง 35px วางอยู่เหนือ
   หัวเว็บในสายเลย์เอาต์ (h.offsetTop > 0) โค้ดยังใส่ไว้เพื่อให้ทุกใบมีกลไกเดียวกัน และเผื่อวันที่
   โครง topbar เปลี่ยน มันจะทำงานเองทันที · อาการที่ยังค้างอยู่ของใบนี้คือเนื้อหาขยับ ~19px
   ตอนหัวเว็บหด ต้องแก้มือ: ย้าย topbar เข้าไปอยู่ใน <header> หรือยกทั้งคู่พร้อมกัน */

/* สำเนาตรงจาก js/nav-response.js — ใบนี้ไม่ได้โหลดไฟล์นั้น **สองที่ต้องเหมือนกันเสมอ** */
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
