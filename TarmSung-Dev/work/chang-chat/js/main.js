/* main.js — reveal + ตัวเลขวิ่ง + เมนู + แถบลอยล่าง (กลไกกลางของ playbook)
   เปลี่ยนที่นี่ = เปลี่ยนทุกเดโม ห้ามใส่ของเฉพาะแบรนด์ลงไฟล์นี้
   (ของเฉพาะอู่ช่างชัดอยู่ที่ js/estimate.js) */
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
    /* rootMargin 0 ไม่ใช่ค่าลบและไม่ใช่ 25% — 21/8/26 jek: "ไถลงมาแล้วไม่เห็น
       อนิเมชันเลย" เพราะ 25% ของจอสูง 800 = ยิงตอนของยังอยู่ใต้ขอบจอ 200px
       ส่วนอนิเมชันยาว 1,100ms คนอ่านจริงไถช้ากว่า 182px/วินาที จึงวิ่งจบก่อนตาไปถึง
       0 = เริ่มตอนขอบบนของบล็อกแตะขอบล่างจอพอดี อนิเมชันทั้งเส้นเล่นบนจอ */
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
     ค่าปลายทางเขียนไว้ใน data-count และพิมพ์ไว้ใน HTML อยู่แล้ว — JS ไม่ทำงาน
     ตัวเลขจริงก็ยังอยู่ · reduced-motion ข้ามการวิ่งทั้งหมด ไม่ใช่แค่เร่งให้เร็ว */
  const nums = [...document.querySelectorAll(".num[data-count]")];
  const fmt = (v) => Math.round(v).toLocaleString("en-US");
  const run = (el) => {
    const target = parseFloat(el.dataset.count);
    const dur = 1100, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = fmt(target);
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

  /* ---- เมนูมือถือ ---------------------------------------------------------- */
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

  /* แถบนำทาง (หด + scroll-spy) ย้ายไปอยู่ js/nav-response.js แล้ว — เป็นกลไกกลาง
     ที่เดโมทุกใบใช้ไฟล์เดียวกัน ถ้าเก็บสำเนาไว้ที่นี่ด้วยจะกลายเป็นสองกลไกของกฎเดียว */

  /* ---- แถบลอยล่าง ---------------------------------------------------------
     โผล่เมื่อฮีโร่พ้นจอ และ "ซ่อนตัวเองเมื่อถึงฟอร์ม" — แถบที่ยังลอยอยู่ตอนคนกำลัง
     กรอกฟอร์มคือแถบที่บังสิ่งที่ตัวเองชี้ไป (ENGINE §4)
     ตัวนี้ใช้ rootMargin ติดลบอย่างถูกต้องตามหน้าที่ ไม่เกี่ยวกับ observer ของ reveal */
  const bar = document.querySelector("[data-orderbar]");
  const hero = document.getElementById("top");
  const book = document.getElementById("book");
  if (bar && hero && book) {
    bar.hidden = false;
    let pastHero = false, atForm = false;
    const sync = () => bar.classList.toggle("up", pastHero && !atForm);
    new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting; sync(); },
      { rootMargin: "-40% 0px 0px 0px" }).observe(hero);
    new IntersectionObserver(([e]) => { atForm = e.isIntersecting; sync(); },
      { rootMargin: "0px 0px -30% 0px" }).observe(book);
  }
})();
