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

  /* ---- หัวเว็บที่เปลี่ยนพื้นเมื่อเลื่อนพ้นฮีโร่ ------------------------------
     เฉพาะหน้านี้ ไม่ใช่ของกลางของทุกเดโม: แบบร่างที่อนุมัติวางหัวเว็บลอยทับรูป
     โดยไม่มีพื้นเลย ซึ่งอ่านออกเพราะม่านบนรูปเข้ม — พอเลื่อนลงไปเจอพื้นครีม
     ตัวหนังสือสีขาวจะหายไปทั้งแถบ ตรงนี้จึงเติมพื้นให้เมื่อหลุดฮีโร่แล้วเท่านั้น
     ใช้ IntersectionObserver กับตัวฮีโร่ ไม่ใช่ scroll listener ที่ยิงทุกเฟรม */
  const header = document.querySelector("[data-header]");
  const hero = document.querySelector(".hero");
  if (header && hero) {
    const hio = new IntersectionObserver(
      ([e]) => header.classList.toggle("stuck", !e.isIntersecting),
      { rootMargin: "-76px 0px 0px 0px", threshold: 0 }
    );
    hio.observe(hero);
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
