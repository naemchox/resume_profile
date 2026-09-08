/* main.js — reveal + nav (เหมือนกันทุกเดโมของ playbook)
   กลไกเดียวใช้ซ้ำทุกงาน: เปลี่ยนที่นี่ = เปลี่ยนทุกหน้า */
(() => {
  const root = document.documentElement;

  /* ?reduce=1 = test hook ให้ headless ถ่ายส่วนล่างของหน้าได้ และให้เช็ค
     reduced-motion ได้โดยไม่ต้องไปตั้งค่าระบบ */
  const forced = new URLSearchParams(location.search).get("reduce") === "1";
  const still = forced || matchMedia("(prefers-reduced-motion: reduce)").matches;

  const items = [...document.querySelectorAll(".reveal")];
  const show = (el) => el.classList.add("in");

  if (still) { items.forEach(show); root.classList.add("still"); }
  else {
    /* rootMargin เป็น 0 ไม่ใช่ 25% — 21/8/26 jek: "ไถลงมาแล้วไม่เห็นอนิเมชันเลย"
       25% ของจอสูง 800 = ยิงตอนของยังอยู่ใต้ขอบจอ 200px ส่วนอนิเมชันยาว 1,100ms
       แปลว่าถ้าไถช้ากว่า 200/1.1 = 182px ต่อวินาที อนิเมชันวิ่งจบก่อนของโผล่พ้น
       ขอบจอทุกครั้ง คนอ่านจริงไถช้ากว่านั้นเกือบตลอด จึงไม่มีวันเห็น
       0 = เริ่มตอนขอบบนของบล็อกแตะขอบล่างจอพอดี อนิเมชันทั้งเส้นเล่นบนจอ
       ไม่เอาค่าติดลบ เพราะติดลบคือเริ่มตอนของเข้ามาในจอแล้ว = เห็นของกระตุกตอนเริ่ม */
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        /* ปล่อยทิ้งทันทีที่เผยแล้ว ไม่งั้นของจะย้อนกลับไปซ่อนตอนเลื่อนขึ้น */
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px 0px 0px", threshold: 0.01 });

    /* observer ไม่ยิงใน tab ที่ถูกซ่อน/prerender — ของที่อยู่ในจอตั้งแต่โหลด
       ต้องวัด rect เองก่อน ไม่งั้นหน้าแรกจะว่างเปล่า */
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) show(el);
      else io.observe(el);
    }
  }


  /* ---- ตัวเลขที่วิ่งมา -------------------------------------------------------
     วิ่งเฉพาะตอนตัวเลขนั้นเข้ามาในจอ และวิ่งครั้งเดียว ค่าปลายทางเขียนไว้ใน
     data-count เสมอ — ถ้า JS ไม่ทำงาน ตัวเลขจริงก็ยังพิมพ์อยู่ใน HTML แล้ว
     reduced-motion ข้ามการวิ่งทั้งหมด ไม่ใช่แค่ทำให้เร็วขึ้น */
  const nums = [...document.querySelectorAll(".num[data-count]")];
  const fmt = (v, dec) => dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US");
  const run = (el) => {
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.dec || "0", 10);
    const dur = 1100, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(target * eased, dec);
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = fmt(target, dec);
    };
    requestAnimationFrame(step);
  };
  if (nums.length && !still) {
    const nio = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        run(e.target); nio.unobserve(e.target);
      }
    }, { threshold: 0.6 });
    nums.forEach((n) => nio.observe(n));
  }

  /* ---- แถบนำทาง: หดตอนเลื่อน + ไฮไลต์หัวข้อที่กำลังอ่าน ----------------------
     กฎ website.md ข้อ 11.5 — แถบที่ไม่ตอบสนองการเลื่อนทำให้หน้ารู้สึกเป็นเอกสาร
     ทั้งสองอย่างเป็นการสลับคลาสอย่างเดียว ถ้า JS ไม่ทำงานแถบก็ยังเป็นแถบปกติ */
  const header = document.querySelector(".site-header");
  const readBar = document.querySelector("[data-read-bar]");
  const toTop = document.querySelector("[data-to-top]");
  const heroPhoto = document.querySelector(".hero-photo");

  if (toTop) {
    toTop.hidden = false;
    toTop.addEventListener("click", () => scrollTo({ top: 0, behavior: still ? "auto" : "smooth" }));
  }

  /* งานทุกอย่างที่ขึ้นกับตำแหน่งการเลื่อน อยู่ใน rAF ตัวเดียวและ listener ตัวเดียว
     — สามอย่างแยก listener กันคือการอ่าน scrollY สามรอบต่อเฟรม แต่ละรอบบังคับให้
     เบราว์เซอร์คิดเลย์เอาต์ใหม่ทั้งหน้า */
  let ticking = false;
  const sync = () => {
    ticking = false;
    const y = scrollY;

    if (header) header.classList.toggle("small", y > 64);   /* ชื่อคลาสกลางของทั้งกอง (26/8/26) */
    if (toTop) toTop.classList.toggle("show", y > 700);

    if (readBar) {
      /* ตัวหารคือ "ระยะที่เลื่อนได้จริง" ไม่ใช่ความสูงทั้งหน้า ไม่งั้นเส้นจะไม่มีวัน
         ยาวเต็มเพราะหนึ่งจอสุดท้ายไม่เคยถูกเลื่อนผ่าน */
      const max = document.documentElement.scrollHeight - innerHeight;
      readBar.style.setProperty("--read", max > 0 ? Math.min(1, y / max).toFixed(4) : "0");
    }

    /* ฮีโร่: รูปเลื่อนช้ากว่าหน้า 4 เท่า = ความรู้สึกว่ารูปอยู่ลึกกว่าตัวหนังสือ
       คิดเฉพาะตอนฮีโร่ยังอยู่ในจอ พ้นจอแล้วหยุดคำนวณ ไม่ใช่คำนวณทิ้งทั้งหน้า */
    if (heroPhoto && !still) {
      /* เพดาน 60px ไม่ใช่ปล่อยตามระยะเลื่อน — รูปถูกขยาย 1.14 เท่า เหลือเนื้อรูป
         ล้นกรอบด้านละ 7% (≈63px ที่จอสูง 900) เลื่อนเกินนั้นคือเห็นขอบว่าง */
      if (y < innerHeight) heroPhoto.style.transform =
        `translate3d(0, ${Math.min(y * 0.25, 60).toFixed(1)}px, 0) scale(1.14)`;
    }
  };
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(sync);
  }, { passive: true });
  sync();

  /* scroll-spy: หัวข้อที่ "กำลังอ่าน" คือหัวข้อที่คร่อมกลางจอ ไม่ใช่หัวข้อที่โผล่
     เข้ามาล่าสุด — rootMargin -45% บนล่างจึงเหลือแถบวัดบางๆ กลางจอเส้นเดียว */
  const spyLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const spyMap = new Map();
  for (const a of spyLinks) {
    const t = document.querySelector(a.getAttribute("href"));
    if (t) spyMap.set(t, a);
  }
  if (spyMap.size) {
    const sio = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        for (const a of spyLinks) a.classList.remove("is-active");
        spyMap.get(e.target)?.classList.add("is-active");
      }
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    for (const t of spyMap.keys()) sio.observe(t);
  }

  /* เมนูมือถือ */
  const nav = document.querySelector("[data-nav]");
  const burger = document.querySelector("[data-burger]");
  if (nav && burger) {
    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); }
    });
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
