/* main.js — reveal + nav (เหมือนกันทุกเดโมของ playbook)
   กลไกเดียวใช้ซ้ำทุกงาน: เปลี่ยนที่นี่ = เปลี่ยนทุกหน้า */
(() => {
  const root = document.documentElement;

  /* ?reduce=1 = test hook ให้ headless ถ่ายส่วนล่างของหน้าได้ และให้เช็ค
     reduced-motion ได้โดยไม่ต้องไปตั้งค่าระบบ */
  const forced = new URLSearchParams(location.search).get("reduce") === "1";
  const still = forced || matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* หัวข้อที่ขึ้นทีละคำ: ห่อคำก่อน แล้วค่อยให้ observer ตัวเดียวกันกับ .reveal
     เป็นคนสั่งเผย — ห่อทีหลังจะได้ start state ที่ผิดจังหวะ */
  for (const h of document.querySelectorAll(".rise")) {
    for (const node of [...h.childNodes]) {
      if (node.nodeType !== 3) continue;             /* <br>/<mark> ปล่อยไว้ */
      const frag = document.createDocumentFragment();
      for (const tok of node.nodeValue.split(/(\s+)/)) {
        if (!tok) continue;
        if (/^\s+$/.test(tok)) { frag.append(tok); continue; }
        const outer = document.createElement("span");
        outer.className = "w";
        const inner = document.createElement("span");
        inner.textContent = tok;
        outer.append(inner);
        frag.append(outer);
      }
      h.replaceChild(frag, node);
    }
    [...h.querySelectorAll(".w > span")].forEach((sp, i) => { sp.style.transitionDelay = i * 55 + "ms"; });
  }

  /* ความยาวจริงของเส้น ส่งเป็น px ไม่ใช่ % */
  for (const path of document.querySelectorAll(".route path, .stamp path")) {
    path.style.setProperty("--len", Math.ceil(path.getTotalLength()) + "px");
  }

  /* ตัวเลขนับขึ้นถึงค่าที่เขียนไว้ในแท็ก — ไม่นับตัวเลขที่หน้านี้ไม่ได้พูดถึง
     ค่าเริ่มต้นในแท็กคือค่าปลายทาง ปิด JS แล้วจึงอ่านได้ครบ ไม่ใช่เลข 0 ค้าง */
  const fmt = (n, dec) => n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const tally = (el) => {
    const to = parseFloat(el.dataset.count);
    const dec = Number(el.dataset.dec || 0);
    /* ท้ายเลข ("+") ต้องอยู่ใน element เดียวกับตัวเลข ไม่งั้นเบราว์เซอร์เลือกฟอนต์
       ให้คนละตัว แล้วขึ้นช่องว่างระหว่างเลขกับเครื่องหมายเอง */
    const suf = el.dataset.suffix || "";
    if (!isFinite(to)) return;
    if (still) { el.textContent = fmt(to, dec) + suf; return; }
    const dur = 1200;
    let t0 = null;
    el.classList.add("counting");
    const step = (t) => {
      if (t0 === null) t0 = t;
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)), dec) + suf;
      if (k < 1) requestAnimationFrame(step);
      else el.classList.remove("counting");
    };
    requestAnimationFrame(step);
  };

  const items = [...document.querySelectorAll(".reveal, .rise, .route, .stamp")];
  const show = (el) => {
    el.classList.add("in");
    el.querySelectorAll?.("[data-count]").forEach(tally);
  };

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

  /* นาฬิกาถอยหลังของดีลวันนี้
     นับถึงเที่ยงคืนของเครื่องคนดู ไม่ใช่เลขตายที่พิมพ์ค้างไว้ — ดีลที่ค้างอยู่ที่
     03:12:44 ทุกครั้งที่เปิดหน้า คือรายละเอียดที่ทำให้ทั้งหน้าดูเป็นของปลอม
     หยุดเองเมื่อแท็บอยู่เบื้องหลัง เพราะไม่มีใครดูอยู่ */
  const clock = document.querySelector("[data-countdown]");
  if (clock) {
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => {
      if (document.hidden) return;
      const now = new Date();
      const end = new Date(now); end.setHours(24, 0, 0, 0);
      const s = Math.max(0, Math.floor((end - now) / 1000));
      clock.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    };
    tick();
    setInterval(tick, 1000);
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
