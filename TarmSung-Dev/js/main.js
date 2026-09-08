/* =============================================================================
   ตามสั่ง (TarmSung) — interaction layer (tiny, progressive-enhancement)
   ========================================================================== */
(() => {
  "use strict";

  /* ---- Contact-form endpoint -------------------------------------------
     ยิงไปที่ /api/lead ซึ่งเป็นโค้ดฝั่งเซิร์ฟเวอร์ของเราเอง (functions/api/lead.js)
     แล้วตัวนั้นค่อยส่งต่อไป Google Apps Script — URL ของ Apps Script จึงไม่โผล่
     ในซอร์สหน้าเว็บอีก และเราอ่านคำตอบจริงได้ ไม่ต้องเดาว่าส่งถึงหรือเปล่า

     ด่านตรวจว่า "ตั้งค่าปลายทางแล้วหรือยัง" เดิมมองหาคำว่า /exec ในสตริงนี้ ซึ่ง
     ใช้ไม่ได้แล้วเมื่อปลายทางเป็นพาธของเราเอง — เกณฑ์ใหม่คือ "ไม่ใช่ค่าตัวอย่าง
     ที่ยังไม่ได้แทนที่" (วัดเจอตอนเทสจริง: ฟอร์มขึ้น "ระบบกำลังปรับปรุง" โดยไม่ยิง
     คำขอสักครั้ง เพราะด่านนี้ยังหา /exec อยู่) */
  const ENDPOINT = "/api/lead";
  const ENDPOINT_READY = ENDPOINT.length > 1 && ENDPOINT.indexOf("PASTE") === -1;

  /* ---- Theme toggle (persisted; respects OS default) -------------------- */
  const root = document.documentElement;
  // Guarded, and deliberately first: localStorage THROWS (not returns null) under
  // Safari's "Block All Cookies" and inside some in-app webviews. Unguarded on the
  // third line of this IIFE it took the whole script with it — and every .reveal
  // stays at opacity:0 without the script, so a blocked cookie jar blanked the
  // entire page. Nothing below here may assume storage exists either.
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: theme just won't persist */ } },
  };
  // Belt and braces behind the inline script in each page's <head>, and resolved
  // the SAME way: never leave the attribute off, because the CSS token sets are
  // keyed on it and nothing else. An unset attribute painted the page light while
  // the OS said dark, and the first click on the toggle then swapped light->light.
  const stored = store.get("ts-theme");
  root.setAttribute(
    "data-theme",
    stored === "light" || stored === "dark"
      ? stored
      : root.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );

  const toggle = document.querySelector(".theme-toggle");
  const themeNow = () => root.getAttribute("data-theme");
  const labelToggle = () =>
    toggle?.setAttribute("aria-label", themeNow() === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด");
  labelToggle();
  /* 26/8/26 (jek): "the website jitter when i change to dark mode (on pc)"
     hold = true แปลว่า "อย่าเพิ่งปลดฟรีซ ให้คนเรียกเป็นคนปลดเอง"
     ใช้ตอนสลับผ่าน view transition ซึ่งเป็นเส้นทางของเดสก์ท็อป */
  const applyTheme = (next, hold) => {
    // Freeze transitions across the swap, then release on the next frame. Without
    // this every element with a colour transition starts one at the same moment.
    root.classList.add("theme-switching");
    // Released on the next frame — with a timer behind it, because
    // requestAnimationFrame does not run in a background tab and leaving this
    // class on would kill every transition on the page permanently.
    root.setAttribute("data-theme", next);
    // Force the new colours to be computed and committed NOW, while transitions
    // are still switched off. Without this flush the browser batches the class and
    // the attribute into one recalc that happens after the class is gone, and
    // every colour transition on the page starts anyway — measured as the running
    // animation count going 19 to 104 on one click.
    void getComputedStyle(root).backgroundColor;
    // Held for the whole wipe, not just long enough to suppress the colour
    // transitions: it is also what keeps the ticker and the drifting light from
    // jumping when the snapshots are dropped. Cleared by the transition's own
    // promise where there is one, with a timer behind it either way.
    /* 26/8/26 แก้ต้นเหตุอาการกระตุกตอนสลับธีมบนพีซี ---------------------
       เดิมปลดฟรีซด้วย setTimeout(300) ที่ "เริ่มนับตั้งแต่ในคอลแบ็กของ
       startViewTransition" ซึ่งเป็นจังหวะ *ก่อน* วงกลมจะเริ่มวิ่ง
       ลำดับจริง: คอลแบ็กจบ → เบราว์เซอร์ถ่ายสแนปช็อตหน้าใหม่ (หน้านี้หนัก
       ใช้เวลาจริงหลักสิบถึงร้อย ms บนพีซี) → วงกลมค่อยเริ่มวิ่ง 300ms
       ตัวจับเวลาจึงหมดอายุ *ระหว่าง* วงกลมยังวิ่งอยู่ ผลคือ ณ วินาทีนั้น
         · transition สีทั้งหน้า (วัดได้ 60+ ตัว) ปล่อยพร้อมกัน
         · animation ที่ถูก pause ไว้ (rail-track ฯลฯ) กลับมาวิ่งพร้อมกัน
           และกระโดดไปข้างหน้าเท่าเวลาที่หยุดไป — ซึ่งคอมเมนต์ในไฟล์นี้
           เตือนไว้เองว่านั่นแหละคืออาการที่คนเห็นว่า "กระตุก"
       ทั้งหมดนี้แย่งเฟรมกับปลายวงกลมพอดี = จบด้วยการสะดุดทุกครั้ง
       ตอนนี้ผูกการปลดฟรีซกับ vt.finished (ดูตัวเรียกข้างล่าง) แทนตัวเลขคงที่
       เหลือ setTimeout ไว้เฉพาะทางที่ไม่มี view transition ซึ่งไม่มีวงกลม
       ให้รอ ใช้ตัวเลขได้ตามเดิม */
    if (!hold) setTimeout(() => root.classList.remove("theme-switching"), 300);
    store.set("ts-theme", next);
    labelToggle();
    toggle?.setAttribute("aria-checked", String(next === "dark"));
  };
  labelToggle();
  toggle?.setAttribute("aria-checked", String(themeNow() === "dark"));

  /* The new theme arrives as a circle growing out of the button the reader
     actually pressed — a wipe, not a crossfade, because a crossfade drags every
     piece of text through the same mid-grey on the way over (the measurement is
     in styles.css).

     The circle now reveals the REAL page in its new theme, because it is a view
     transition: the browser holds a snapshot of the old page and paints the new
     one on top, and all we do is clip that new one to a growing circle. What was
     here before was a plain <div> painted the new background colour, which meant
     the circle was a flat empty disc of paint sweeping over the page and the
     content only appeared when it had finished — "it shows only empty white or
     dark, then changes mode". A single element can never be anything but flat;
     two renderings of the page is exactly what a view transition is for.

     Everything else swaps instantly: reduced motion (a hard cut beats a fade),
     and any browser without view transitions. A flat disc is not worth keeping
     as a fallback — no animation reads better than an empty one. */
  const WIPE_MS = 300;
  /* ---- วงกลมกวาดตอนสลับธีม: ปิดไว้ 26/8/26 --------------------------------
     เจ้าของ: "the website jitter when i change to dark mode (on pc)" ... "ทั้งเว็บ"

     วัดจริงด้วย playwright เปิด Chromium จริง จอ 2x กด 5 รอบต่อทาง:
       view transition (วงกลม) : เฟรมยาว >25ms = 1 ครั้ง **ทุกรอบ 5/5** ยาว ~50ms
       สลับทันที + ฟรีซ        : 0 ครั้ง ทุกรอบ  เฟรมยาวสุด 18ms (= จังหวะปกติ)
       สลับดิบ ไม่ฟรีซ         : 0 ครั้ง ทุกรอบ  เฟรมยาวสุด 18ms
     ต้นทุนคือตอนเบราว์เซอร์ถ่ายภาพทั้งหน้าเก็บเป็นสแนปช็อตก่อนวงกลมจะเริ่มวิ่ง
     หน้านี้หนัก จึงค้างทีเดียว ~50ms = ตกไป 3 เฟรม ตรงจังหวะที่นิ้วเพิ่งกด
     คนอ่านว่า "ทั้งเว็บสะดุด" เพราะมันค้างทั้งหน้าจริงๆ ไม่ใช่ชิ้นใดชิ้นหนึ่ง

     ลองแก้แล้ว วัดแล้วไม่ช่วย ได้ ~50ms เท่าเดิมทั้งคู่ (ย้อนคืนหมดแล้ว):
       · ปิดชั้นเกรนตอนถ่ายภาพ
       · ฟรีซแอนิเมชันก่อนถ่ายภาพ แทนที่จะฟรีซหลัง
       · พักรีลในฮีโร่ตอนสลับธีม (0.4-0.6px -> 0.2-0.5px = อยู่ในระดับสัญญาณรบกวน)
     แปลว่าต้นทุนอยู่ที่การถ่ายภาพเอง ตราบใดที่ยังใช้ view transition มันจะค้างเสมอ

     เปลี่ยน WIPE เป็น true เพื่อเอาวงกลมกลับมา — โค้ดกับ CSS ของวงกลมยังอยู่ครบ
     ไม่ได้ลบทิ้ง เผื่อวันหนึ่งหน้าเบาลงจนถ่ายภาพทัน หรือเจ้าของอยากได้คืน */
  const WIPE = false;
  toggle?.addEventListener("click", () => {
    const next = themeNow() === "dark" ? "light" : "dark";
    if (!WIPE || reduce || !document.startViewTransition) { applyTheme(next); return; }

    const r = toggle.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    // Reach the farthest corner, or the old theme is left showing in one of them.
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    // The class scopes the wipe to THIS transition: the same two pseudo-elements
    // carry the cross-fade used for page navigation (@view-transition further up
    // styles.css), and without the scope every link would wipe as a circle too.
    root.style.setProperty("--vt-x", `${x}px`);
    root.style.setProperty("--vt-y", `${y}px`);
    root.style.setProperty("--vt-r", `${rad}px`);
    root.classList.add("vt-theme");

    const vt = document.startViewTransition(() => applyTheme(next, true));
    /* Belt and braces: .vt-theme drives the CSS animation, so a transition that
       never starts or never finishes cannot leave the class stuck on the root.
       26/8/26 ปลด theme-switching ที่นี่ด้วย = ฟรีซกินยาวคลุมวงกลมทั้งลูกจริงๆ
       ไม่ใช่แค่ 300ms ที่เริ่มนับก่อนวงกลมจะเริ่ม
       ตัวจับเวลาสำรองยังอยู่ เพราะถ้าแท็บถูกซ่อนอยู่ เบราว์เซอร์จะข้าม
       view transition ทิ้ง (วัดแล้ว: vt.ready ถูก reject) ถ้าไม่มีอะไรรับช่วง
       คลาสจะค้างบน root แล้ว transition ทั้งเว็บจะตายถาวร */
    const done = () => {
      root.classList.remove("vt-theme");
      root.classList.remove("theme-switching");
    };
    vt.finished.catch(() => {}).finally(done);
    setTimeout(done, WIPE_MS + 400);
  });

  /* ---- Sticky header shadow on scroll ----------------------------------- */
  const header = document.querySelector(".site-header");
  const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- Mobile menu ------------------------------------------------------ */
  const navToggle = document.querySelector(".nav-toggle");
  const mobileMenu = document.getElementById("mobile-menu");
  const setMenu = (open) => {
    mobileMenu?.classList.toggle("open", open);
    navToggle?.setAttribute("aria-expanded", String(open));
    navToggle?.setAttribute("aria-label", open ? "ปิดเมนู" : "เปิดเมนู");
    // The page behind an open drawer should not scroll under it.
    document.body.style.overflow = open ? "hidden" : "";
    // ...nor should Tab reach it. Without this, focus walks out of the drawer
    // into links that are covered up, and a keyboard user loses their place.
    document.getElementById("main")?.toggleAttribute("inert", open);
    document.querySelector(".site-footer")?.toggleAttribute("inert", open);
    // Read by the order bar, which stands down while the drawer is showing.
    root.classList.toggle("menu-open", open);
  };
  navToggle?.addEventListener("click", () => setMenu(!mobileMenu.classList.contains("open")));
  // Tapping the page behind the drawer closes it. It is the gesture every phone
  // user tries first, and before the scrim existed it did nothing at all.
  document.querySelector(".menu-scrim")?.addEventListener("click", () => setMenu(false));
  mobileMenu?.querySelectorAll("a, .btn").forEach((el) => el.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !mobileMenu?.classList.contains("open")) return;
    setMenu(false);
    navToggle?.focus();   // or focus is left orphaned on a now-hidden drawer
  });
  // Rotating a phone to landscape crosses the breakpoint that hides .nav-toggle.
  // The drawer stayed open over the content with its only close button gone.
  // 961px is the other side of the nav switch in styles.css ("max-width: 960px").
  // These two numbers are one decision written twice; move them together.
  const wideQuery = window.matchMedia("(min-width: 961px)");
  const closeIfWide = (e) => { if (e.matches) setMenu(false); };
  if (wideQuery.addEventListener) wideQuery.addEventListener("change", closeIfWide);
  else if (wideQuery.addListener) wideQuery.addListener(closeIfWide);   // Safari < 14

  /* ---- Section headings: a word at a time, over a rule that draws itself ---
     Layers 3a and 3b of the จืด recipe (playbook/PROMPT-JUED.md). Every section
     on this page opened the same way — eyebrow, heading, line — which is the
     flatness the recipe is about; the heading is the one place a section can
     have a voice of its own.

     Thai is why this is done here in script and not by hand in the HTML:
       · Thai does not put spaces between words, so a per-CHARACTER split would
         tear สระ and วรรณยุกต์ off the consonants they belong to. Splitting on
         the spaces that ARE written gives phrases — "เมนูครบ" / "จบในครัวเดียว" —
         which is the right unit to move anyway.
       · Elements already inside the heading (.nb, .grad) are moved whole, never
         entered, so the no-break spans that hold Thai words together survive.
       · The mask has padding above and below with matching negative margins. A
         bare overflow:hidden box cuts ไม้โท and สระอิ off the top of the line —
         Latin type does not notice this and Thai does immediately.
     The text stays real text in the DOM: selecting the heading and copying it
     gives the sentence back with its spaces, which a per-word <span> soup that
     drops whitespace does not. */
  const heads = [...document.querySelectorAll(".section-head h2")];
  if (heads.length) {
    const mask = (node) => {
      const w = document.createElement("span");
      w.className = "w";
      const inner = document.createElement("span");
      inner.appendChild(node.cloneNode(true));
      w.appendChild(inner);
      return w;
    };
    heads.forEach((h2) => {
      const parts = [];
      h2.childNodes.forEach((n) => {
        if (n.nodeType !== 3) { parts.push(mask(n)); return; }
        // Keep the whitespace as whitespace, outside the masks, or the copied
        // sentence comes back with its words jammed together.
        n.nodeValue.split(/(\s+)/).forEach((chunk) => {
          if (!chunk) return;
          if (/^\s+$/.test(chunk)) { parts.push(document.createTextNode(chunk)); return; }
          parts.push(mask(document.createTextNode(chunk)));
        });
      });
      h2.textContent = "";
      parts.forEach((p) => h2.appendChild(p));
      // The heading now animates itself, so it is taken off the shared .reveal
      // observer — two entrances on one element is the flicker, not the effect.
      h2.classList.remove("reveal", "d1", "d2", "d3");
      h2.classList.add("wordfx");

      /* The rule under it. Drawn, not declared: an SVG stroke whose dash offset
         runs to zero, so it arrives like a line pulled across an order pad
         rather than appearing as a border. The path is deliberately not
         straight — it is the same hand the dashed tear-offs are drawn by. */
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "head-rule");
      svg.setAttribute("viewBox", "0 0 200 8");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      svg.innerHTML = '<path d="M2 5.4 C 48 2.2, 96 6.6, 142 3.4 S 186 5.6, 198 4.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>';
      h2.insertAdjacentElement("afterend", svg);
    });

    const wordsIn = (h2) => {
      h2.classList.add("in");
      const rule = h2.nextElementSibling;
      if (rule && rule.classList.contains("head-rule")) rule.classList.add("in");
    };
    if (!("IntersectionObserver" in window) ||
        matchMedia("(prefers-reduced-motion: reduce)").matches) {
      heads.forEach(wordsIn);   // JS sets the end state itself — CSS alone cannot
    } else {
      const headIO = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          headIO.unobserve(e.target);
          wordsIn(e.target);
        });
      }, { threshold: 0.01, rootMargin: "0px 0px -12% 0px" });
      heads.forEach((h2) => {
        // Anything already on screen goes now, by measurement: an observer does
        // not fire in a hidden tab, and the top heading is often already in view.
        const r = h2.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.88 && r.bottom > 0) wordsIn(h2);
        else headIO.observe(h2);
      });
    }
  }

  /* ---- Scroll reveal (gated by reduced-motion) -------------------------- */
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reveals = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("in"));
  } else {
    // The head start is the whole trick, and it is what this page did not have.
    // A NEGATIVE bottom margin makes an element wait until it is already inside
    // the viewport before it starts — so at a normal scrolling speed you arrive
    // while it is still half transparent, which is what "not smooth" was. A
    // POSITIVE one expands the root downward, so a block begins revealing while it
    // is still a quarter of a screen BELOW the fold and the movement is over by
    // the time you get to it. Copied from the Zamil build, margin and threshold.
    //
    // Reveal once and stay revealed: unobserve, so nothing can undo it.
    // ONE trigger for the whole page. There were two — a head-start observer for
    // most of the page and a late one for the section that had to be seen — and
    // two triggers is two different feels, which is the opposite of the point.
    //
    // The head start was the older idea: begin the fade while the block is still
    // a quarter-screen below the fold so the movement is over by the time you get
    // there. It does read as smooth, but it also means you never SEE anything
    // arrive; you scroll to a block that is already finished. Every section then
    // looks static except the hero, which runs on load while you are looking at
    // it. So: a negative bottom margin instead. A block starts when its top has
    // crossed 82% of the viewport — far enough in to be watched, early enough
    // that it is never still moving when it reaches the middle of the screen.
    //
    // threshold is deliberately ~0, not a percentage of the element: a service
    // card is ~500px tall and 15% of it is 75px, so a tall card and a one-line
    // paragraph would start at completely different points on screen. Crossing a
    // line is the same rule for everything.
    // How far below the fold an .reveal--early element starts. Declared once so
    // the observer margin and the measured fallback line cannot drift apart.
    const EARLY_MARGIN = "55%";
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        reveal(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -18% 0px" });

    // The one exception to the line above, and it is a shape problem rather than
    // a taste one. The rule — start when your top crosses 82% of the viewport —
    // assumes there is page left below you to scroll through while you watch. The
    // wordmark is the LAST element in the document and it is ~370px of glyph
    // sitting flush on the bottom edge, so its top does not cross that line until
    // the scrollbar is already at the end: you have to drive the page into its own
    // floor to make the word come up, and the 1100ms wipe then runs after you have
    // stopped moving. A positive bottom margin extends the root below the fold
    // instead, so the plate is on its way up while the footer is still arriving and
    // has landed by the time you are looking at it. Marked in the HTML with
    // .reveal--early rather than hard-coded to .wordmark, so the exception is
    // visible where the element is written.
    const ioEarly = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        reveal(e.target);
        ioEarly.unobserve(e.target);
      });
    }, { threshold: 0, rootMargin: "0px 0px " + EARLY_MARGIN + " 0px" });

    // Anything already on screen is shown immediately by measurement rather than
    // by waiting for the observer, which never fires in a hidden tab, a prerender
    // or a restored session.
    const start = () => {
      reveals.forEach((el) => {
        const r = el.getBoundingClientRect();
        // The same two lines the observers use, measured rather than observed:
        // 0.82 of a screen for the page, one screen plus the early margin for a
        // .reveal--early element. EARLY_MARGIN is the single source for both.
        const early = el.classList.contains("reveal--early");
        const line = window.innerHeight * (early ? 1 + parseFloat(EARLY_MARGIN) / 100 : 0.82);
        if (r.top < line && r.bottom > 0) reveal(el);
        else (early ? ioEarly : io).observe(el);
      });
    };

    // Hover used to be switched off until the entrance had finished, because both
    // were written to transform and the entrance wins while it runs — a pointer
    // arriving mid-flight did nothing, then the lift landed in one frame. That gate
    // (.settled, set once Element.getAnimations() reported nothing running) is gone:
    // the hover lifts now live on the individual `translate` / `scale` properties,
    // which the browser composes with the entrance's transform instead of fighting
    // it. Nothing here has to wait for anything to finish any more — see the note by
    // `.js .reveal` in the CSS.
    const reveal = (el) => el.classList.add("in");

    /* ตาข่ายกันพลาด: ของทุกชิ้นในหน้านี้เริ่มที่ opacity 0 แล้วรอ IntersectionObserver
       มาเปิดให้ ถ้าออบเซิร์ฟเวอร์ไม่ยิง (Safari คืนหน้าจาก bfcache · รีเฟรชค้างกลางหน้า
       · แท็บถูกพักแล้วปลุก) ของที่อยู่ในจอจะค้างที่ opacity 0 ตลอด = การ์ดว่างเปล่า
       (jek รายงาน 21/8/26 ว่าบางใบขึ้นเป็นช่องว่างหลังรีเฟรช ทำซ้ำในเครื่องไม่ได้
        จึงกันไว้ที่ผลลัพธ์แทนการไล่หาเหตุ) — กวาดซ้ำหลังโหลด 2 วิ และทุกครั้งที่หน้า
       ถูกคืนจากแคช: อะไรที่ยังไม่ .in และอยู่ในจอแล้ว ให้เปิดเลย */
    const sweepReveals = () => {
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) reveal(el);
      });
    };
    setTimeout(sweepReveals, 2000);
    addEventListener("pageshow", (e) => { if (e.persisted) setTimeout(sweepReveals, 100); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(sweepReveals, 300); });
    // Wait for the webfonts before starting, and the refresh stops juddering.
    // The fonts load with display=swap, so the first paint uses a fallback and the
    // real Thai faces replace it a moment later — different metrics, so every line
    // re-wraps. On its own that is one small jump. Landing it in the middle of the
    // hero's 1100ms rise put a reflow and a transform on the same words at the same
    // time, which is what read as a stutter. Held until the faces are in, the
    // re-wrap happens while the text is still at opacity 0 and nobody sees it.
    // Raced against a timer: a font CDN that hangs must not leave the page blank.
    // ...and then held once more behind the loading screen, if one is up. The
    // hero's rise is the first thing the site says; running it while a ticket is
    // covering the page spends it on nobody, and you land on a finished, static
    // hero. window.tsCurtain is defined in the head of every page and calls
    // straight through when there is no screen to wait for.
    const begin = () => (window.tsCurtain ? window.tsCurtain(start) : start());
    if (document.fonts && document.fonts.status !== "loaded") {
      let started = false;
      const once = () => { if (!started) { started = true; begin(); } };
      document.fonts.ready.then(once);
      setTimeout(once, 900);
    } else {
      begin();
    }
  }

  /* ---- Work cards do not invite a click until the work is really out ----- */
  // The grid is a mix: some pieces are live on the internet, most are demos that
  // only exist as local files. A card that promises "ใช้งานได้จริง" and then
  // opens a localhost URL — or nothing — costs more trust than the click was
  // worth, and a visitor cannot tell which card is which before clicking. So
  // while the portfolio is not published, every card is a picture: no link, no
  // badge, no arrow, no hover lift. Flip this to true the day the demos ship and
  // the whole grid becomes clickable again — the markup already carries it all.
  /* เดิมตรงนี้มีสวิตช์ WORK_LINKS_LIVE ที่คอยถอด href/ป้าย/ลูกศรออกจากการ์ดตอนรัน
     ถ้าไม่อยากให้คนกดออกไปเว็บเดโม — 21/8/26 การ์ดทุกใบทั้งสองหน้าเลิกเป็นลิงก์ที่
     ตัวมาร์กอัปแล้ว (เป็น <div role="button"> ไม่มี href ให้ถอด) สวิตช์นี้จึงกลาย
     เป็นโค้ดที่ไม่มีวันทำงาน และ "กลไกสองอันสำหรับเรื่องเดียวกัน" คือของที่จะเพี้ยน
     จากกันวันหนึ่ง ถ้าจะเปิดลิงก์กลับ ให้แก้ที่มาร์กอัปที่เดียว
     (โค้ดเดิมอยู่ใน git history: ดู commit ที่ถอดลิงก์การ์ดออก) */

  /* ทั้งสองอย่างนี้ย้ายไปอยู่ที่ js/reel-video.js แล้ว (21/8/26) เพราะตรรกะชุดเดียวกัน
     เคยอยู่สามที่ (ไฟล์นี้ · js/peek.js · <script> ในตัว reference.html) แล้วเพี้ยน
     กันเงียบๆ — เหตุผลเต็มทั้งเรื่องลำดับ WebM/MP4 และเรื่องประตูบัฟเฟอร์+:hover
     อยู่ในไฟล์นั้น ที่นี่เหลือแค่ชื่อย่อไว้ให้โค้ดข้างล่างอ่านง่าย */
  const setReelSources = (v, raw) => window.reelVideo.attach(v, raw);
  const wireReel = (v, host) => window.reelVideo.wire(v, host);

  /* ---- Work cards preview themselves on hover --------------------------- */
  // Every card in the grid now answers a pointer the way the hero arc does, in
  // the form that suits what it is showing:
  //   data-reel  — a SITE, which is a thing you scroll: the recording of the
  //                real page being scrolled plays over the still.
  //   data-pages — an APP, which has screens you move BETWEEN, not a fold to
  //                scroll past: the screens crossfade on a beat instead, and
  //                Ijek's emoji (animated webp in the product, frozen in a
  //                screenshot) come alive under the pointer.
  // Both rules from the hero arc hold either way: nothing is fetched until a
  // pointer lands, and the still is never removed — so touch, reduced-motion,
  // a refused autoplay and a failed file all keep the picture the card has
  // always had.
  (() => {
    const cards = [...document.querySelectorAll(".card.work[data-pages], .card.work[data-reel]")];
    const flipOk = !matchMedia("(prefers-reduced-motion: reduce)").matches
                   && matchMedia("(hover: hover)").matches;
    if (!cards.length || !flipOk) return;

    const HOLD = 1600;   // ms a screen is held before the next takes over
    const FADE = 400;    // crossfade; mirrors --dur-slow in styles.css
    const state = new WeakMap();

    // The emoji belong to the screen under them, so they turn over with it, or
    // two foxes float on one card. Index 0 is the still.
    const showEmo = (card, i) => {
      card.querySelectorAll(".emo-layer").forEach((l) => {
        l.dataset.on = Number(l.dataset.f) === i ? "1" : "0";
      });
    };

    const build = (card) => {
      const thumb = card.querySelector(".thumb");
      return card.dataset.pages.split(",").filter(Boolean).map((name) => {
        const img = document.createElement("img");
        img.className = "shot-page";
        img.src = "assets/work/pages/" + name + ".webp?v=" + window.TS_PAGES_V;
        img.alt = "";
        img.decoding = "async";
        img.setAttribute("aria-hidden", "true");
        // A screen whose file never arrives drops out of the rotation rather
        // than flashing a broken frame — the still is a fine page 1.
        img.addEventListener("error", () => { img.dataset.dead = "1"; });
        thumb.appendChild(img);   // z-index, not source order, holds the stack
        return img;
      });
    };

    // A site card: the recording of the real page being scrolled rides over the
    // still. Built on the first hover and kept afterwards — a second pass
    // replays what is already in cache and costs nothing.
    /* แยก "สร้าง + เริ่มโหลด" ออกจาก "เล่น" เพื่อให้ warmNear เรียกครึ่งแรกได้
       โดยไม่เล่นและไม่โชว์ — ตัวเดียวกับที่ reference.html ใช้ กลไกเดียวทั้งเว็บ */
    const ensureReel = (card) => {
      let v = card.querySelector(".shot-reel");
      if (!v) {
        v = document.createElement("video");
        v.className = "shot-reel";
        setReelSources(v, card.dataset.reel);
        v.muted = true;        // property, not attribute: Safari reads this one
        v.loop = true;
        v.playsInline = true;  // else iPadOS hijacks it into the fullscreen player
        v.preload = "auto";
        v.tabIndex = -1;
        v.setAttribute("aria-hidden", "true");
        wireReel(v, card);   // ประตูเดียวกับสไลด์ในฮีโร่ ดูคอมเมนต์ที่ wireReel
        card.querySelector(".thumb").appendChild(v);   // z-index holds the stack
      }
      return v;
    };

    const playReel = (card) => {
      const v = ensureReel(card);
      window.reelVideo.hold(v);
      v.play().catch(() => { /* autoplay refused — the still stays, nothing breaks */ });
    };

    const stopReel = (card) => {
      const v = card.querySelector(".shot-reel");
      if (!v) return;
      card.dataset.reelOn = "0";
      v.pause();
      v.currentTime = 0;   // the next hover starts at the top of the page again
      window.reelVideo.release(v);   // คืนหน่วยความจำหลังเมาส์ออก — เหตุผลอยู่ในไฟล์นั้น
    };

    const play = (card) => {
      if (card.dataset.reel) return playReel(card);
      const st = state.get(card) || { id: 0, i: 0, frames: null };
      if (st.id) return;                       // re-entered without a leave
      if (!st.frames) st.frames = build(card);
      card.querySelectorAll(".emo[data-anim]").forEach((img) => { img.src = img.dataset.anim; });
      st.id = setInterval(() => {
        const live = st.frames.filter((f) => f.dataset.dead !== "1");
        if (!live.length) return;
        // Position 0 is the still, so it reads page 1 -> 2 -> ... -> front door.
        st.i = (st.i + 1) % (live.length + 1);
        live.forEach((f, k) => { f.dataset.on = k === st.i - 1 ? "1" : "0"; });
        showEmo(card, st.i);
      }, HOLD + FADE);
      state.set(card, st);
    };

    const stop = (card) => {
      if (card.dataset.reel) return stopReel(card);
      // Swapping src back restarts the loop from frame 1 on the next hover.
      card.querySelectorAll(".emo[data-still]").forEach((img) => { img.src = img.dataset.still; });
      const st = state.get(card);
      if (!st) return;
      clearInterval(st.id);
      st.id = 0;
      st.i = 0;
      card.querySelectorAll(".shot-page").forEach((f) => { f.dataset.on = "0"; });
      showEmo(card, 0);
    };

    cards.forEach((card) => {
      card.addEventListener("pointerenter", () => play(card));
      card.addEventListener("pointerleave", () => stop(card));
      /* คีย์บอร์ดก็ต้องได้พรีวิว — การ์ดเป็น role="button" tabindex="0" อยู่แล้ว คนที่
         แท็บมาถึงจึงควรเห็นของเดียวกับคนที่เอาเมาส์ชี้ 21/8/26: หน้าอ้างอิงผูก
         focus/blur ไว้ตั้งแต่แรก แต่หน้านี้ไม่เคยผูก = คนใช้คีย์บอร์ดเห็นแค่ภาพนิ่ง
         ทั้งที่มาร์กอัปทั้งสองหน้าเหมือนกันเป๊ะ (ประตูใน reel-video.js เช็ค :hover
         ซึ่งโฟกัสไม่ทำให้เป็นจริง — data-reel-on จึงถูกตั้งจากที่นี่โดยตรง) */
      card.addEventListener("focus", () => { play(card); if (card.dataset.reel) card.dataset.reelOn = "1"; });
      card.addEventListener("blur", () => stop(card));
    });

    /* การ์ดในกริดผลงานอยู่นิ่ง ไม่มีอะไรอุ่นคลิปให้เหมือนโค้งในฮีโร่ที่หมุนผ่านเมาส์เอง
       ผูกตัวอุ่นระยะใกล้ให้ — เหตุผลเต็มอยู่ที่ warmNear ใน js/reel-video.js */
    window.reelVideo.prefetchInView(cards, ensureReel);
  })();

  /* ---- Menu panels: fetch every shot before it is picked ----------------- */

  /* ---- Team emoji: still poster, animated only once it is on screen ------ */
  // The animated files are ~100 KB each; the still .webp is ~4 KB. Shipping the
  // still first means a visitor who never scrolls to the team pays nothing, and
  // the swap is invisible because both frames are the same drawing.
  // Scoped to the document as it stands: the reel's own emoji are written in
  // later and are deliberately NOT part of this — they play on hover and are
  // handled by buildReel (see playEmo).
  const animEmoji = [...document.querySelectorAll("img[data-anim]")];
  if (animEmoji.length && !reduce) {
    const play = (img) => { img.src = img.dataset.anim; };
    if (!("IntersectionObserver" in window)) {
      animEmoji.forEach(play);
    } else {
      const emojiIO = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          play(e.target);
          emojiIO.unobserve(e.target);
        });
      }, { threshold: 0.2, rootMargin: "0px 0px 20% 0px" });
      animEmoji.forEach((img) => emojiIO.observe(img));
    }
  }

  /* ---- Active nav link on scroll (scroll-spy) --------------------------- */
  // Both navs, one spy: the drawer marks the section you are in exactly as the
  // desktop bar does. Two observers would be two chances for them to disagree.
  const navLinks = [...document.querySelectorAll(".nav-links a, .mm-list a")];
  const spied = new Set(navLinks.map((a) => a.getAttribute("href")));
  const sections = [...document.querySelectorAll("main section[id]")]
    .filter((sec) => spied.has(`#${sec.id}`));
  if (sections.length && "IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        navLinks.forEach((a) => {
          if (a.getAttribute("href") === `#${id}`) a.setAttribute("aria-current", "page");
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => spy.observe(s));
  }

  /* ---- Contact form: validate on blur / submit, success state ----------- */
  const form = document.getElementById("contact-form");
  if (form) {
    const status = form.querySelector(".form-status");
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const validateField = (input) => {
      const field = input.closest(".field");
      let ok = true;
      if (input.required && !input.value.trim()) ok = false;
      if (ok && input.type === "email" && input.value && !emailRe.test(input.value)) ok = false;
      field?.classList.toggle("invalid", !ok);
      input.setAttribute("aria-invalid", String(!ok));
      return ok;
    };

    form.querySelectorAll("input, textarea, select").forEach((input) => {
      input.addEventListener("blur", () => {
        if (input.dataset.touched) validateField(input);
      });
      input.addEventListener("input", () => {
        input.dataset.touched = "1";
        if (input.closest(".field")?.classList.contains("invalid")) validateField(input);
      });
    });

    const val = (id) => form.querySelector("#" + id)?.value.trim() ?? "";

    // Whatever the customer last tried to send, kept so a failure can offer it back
    // as a ready-made message instead of asking them to type it all again.
    let lastPayload = null;

    const rescueText = (p) => [
      "สั่งงานผ่านเว็บตามสั่ง",
      `ชื่อ: ${p.name}`,
      `อีเมล: ${p.email}`,
      p.phone ? `เบอร์: ${p.phone}` : "",
      p.type ? `แพ็กเกจ: ${p.type}` : "",
      "",
      p.message,
    ].filter(Boolean).join("\n");

    const renderRescue = (p) => {
      const slot = status?.querySelector(".fs-rescue");
      if (!slot) return;
      if (!p) { slot.hidden = true; slot.innerHTML = ""; return; }
      const body = encodeURIComponent(rescueText(p));
      const subject = encodeURIComponent(`ใบสั่งงานจาก ${p.name || "เว็บตามสั่ง"}`);
      slot.hidden = false;
      slot.innerHTML =
        `<a class="btn btn--primary" href="mailto:tarmsungdev@gmail.com?subject=${subject}&body=${body}">` +
        `ส่งใบสั่งนี้ทางอีเมลแทน</a>` +
        `<button type="button" class="btn btn--secondary fs-copy">คัดลอกข้อความ</button>` +
        `<a class="btn btn--ghost" href="tel:0816547401">โทรเลย</a>`;
      slot.querySelector(".fs-copy")?.addEventListener("click", async (e) => {
        // Grab the button BEFORE awaiting: currentTarget is nulled once the event
        // finishes dispatching, so reading it after the await threw — and threw
        // again inside the catch, so the label never changed and the copy looked
        // broken even when it had worked.
        const btn = e.currentTarget;
        try {
          await navigator.clipboard.writeText(rescueText(p));
          btn.textContent = "คัดลอกแล้ว ✓";
        } catch {
          // Also the plain-http case: the clipboard API needs a secure context.
          btn.textContent = "คัดลอกไม่ได้ กรุณาเลือกข้อความเอง";
        }
      });
    };

    const showStatus = (ok, inputs, msg) => {
      const btn = form.querySelector('button[type="submit"]');
      btn.classList.remove("is-loading");
      btn.disabled = false;
      if (ok) {
        form.reset();
        inputs.forEach((i) => { delete i.dataset.touched; i.removeAttribute("aria-invalid"); i.closest(".field")?.classList.remove("invalid"); });
      }
      if (!status) return;
      status.className = "form-status " + (ok ? "success" : "error");
      renderRescue(ok ? null : lastPayload);
      // The stamp comes down on a real success only.
      const stampOk = status.querySelector(".stamp-ok");
      if (stampOk) {
        stampOk.hidden = !ok;
        stampOk.classList.remove("hit");
        if (ok) { void stampOk.offsetWidth; stampOk.classList.add("hit"); }
      }
      status.querySelector(".fs-msg").textContent = msg ?? (ok
        ? "ขอบคุณครับ! เราได้รับข้อความของคุณแล้ว ทีมงานจะติดต่อกลับภายใน 1 วันทำการ"
        : "ขออภัย ส่งไม่สำเร็จ — ใบสั่งของคุณถูกเตรียมไว้ให้แล้ว กดปุ่มด้านล่างส่งได้เลยครับ");
      status.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    };

    /* ---- โทเคนกันยิงถล่มฟอร์ม ---------------------------------------------
       /api/lead รับใบสั่งงานเฉพาะที่แนบโทเคนซึ่งขอมาก่อนอย่างน้อย 1.5 วินาที
       (ดู functions/api/lead.js) ขอไว้ตั้งแต่คนแตะช่องแรก คนจริงจึงไม่รู้สึกอะไร
       ส่วนสคริปต์ที่ยิง POST ตรงๆ ไม่มีโทเคน = ไม่ผ่านด่านและไม่กินโควตาปลายทาง */
    let leadToken = "";
    const warmToken = () =>
      leadToken ? Promise.resolve(leadToken)
        : fetch(ENDPOINT).then((r) => r.json())
            .then((o) => (leadToken = (o && o.token) || ""))
            .catch(() => "");
    form.addEventListener("focusin", warmToken, { once: true });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const inputs = [...form.querySelectorAll("input, textarea, select")];
      inputs.forEach((i) => (i.dataset.touched = "1"));
      const firstInvalid = inputs.find((i) => !validateField(i));
      if (firstInvalid) { firstInvalid.focus(); return; }

      const btn = form.querySelector('button[type="submit"]');
      if (status) status.className = "form-status"; // clear any previous banner
      btn.classList.add("is-loading");
      btn.disabled = true;

      const payload = {
        name: val("name"),
        email: val("email"),
        phone: val("phone"),
        type: form.querySelector("#type")?.value ?? "",
        message: val("message"),
        // Honeypot. NOT named "company": browser autofill knows that field and would
        // fill it for a real person, who then gets silently dropped as a bot.
        ts_note: form.querySelector('input[name="ts_note"]')?.value ?? "",
        page: location.href,
        ts_token: leadToken || (await warmToken()),
      };

      lastPayload = payload;

      // A bot tripped the honeypot: acknowledge without sending.
      if (payload.ts_note) {
        setTimeout(() => showStatus(true, inputs), 800);
        return;
      }

      // Endpoint not deployed yet. NEVER fake success here — a green banner with
      // no row in the sheet loses the lead silently. Point them at a channel that
      // works and keep what they typed so they can copy it.
      if (!ENDPOINT_READY) {
        showStatus(false, inputs, "ระบบฟอร์มกำลังปรับปรุงชั่วคราว — ใบสั่งของคุณถูกเตรียมไว้ให้แล้ว กดปุ่มด้านล่างส่งได้เลยครับ ข้อความที่พิมพ์ไว้ยังอยู่ครบ");
        return;
      }

      try {
        /* เดิมยิงตรงไป Apps Script ด้วย mode:"no-cors" ซึ่งอ่านคำตอบไม่ได้เลย
           ฟอร์มจึงขึ้น "ส่งสำเร็จ" ทุกครั้ง แม้ปลายทางจะพัง โควตาเต็ม หรือ deploy
           ถูกถอน — ใบสั่งงานหายเงียบโดยไม่มีใครรู้ (QC จับได้ 21/8/26)
           ตอนนี้ยิงไปที่ /api/lead ซึ่งเป็นโดเมนเดียวกัน จึงอ่านคำตอบได้จริง และ
           ปลายทางที่แท้จริงก็ไม่โผล่ในซอร์สหน้าเว็บอีก (ดู functions/api/lead.js) */
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const out = await res.json().catch(() => null);
        if (!res.ok || !out || out.result !== "success") {
          throw new Error(out && out.message ? out.message : "ปลายทางไม่ตอบรับ");
        }
        showStatus(true, inputs);
      } catch (err) {
        leadToken = "";        // ขอใหม่รอบหน้า โทเคนเดิมอาจหมดอายุหรือถูกใช้ไปแล้ว
        showStatus(false, inputs);
      }
    });
  }

  /* ---- Pricing / service CTA -> prefill the form ------------------------- */
  // The dropdown is the PACKAGE — that is what the price is quoted from — so a
  // pricing CTA fills it in. WHAT the customer wants built is a separate question,
  // so a service CTA writes that into the details box instead.
  const prefillLine = (label, value) => {
    const msg = document.getElementById("message");
    if (!msg) return;
    // Replace an earlier line rather than only filling a blank box — picking
    // "เว็บแอป" then switching to "โมบายแอป" used to send the first one.
    const line = label + ": " + value;
    const re = new RegExp("^" + label + ": .*$", "m");
    msg.value = re.test(msg.value)
      ? msg.value.replace(re, line)
      : (msg.value ? line + "\n" + msg.value : line + "\n");
  };

  document.querySelectorAll("[data-plan]").forEach((link) => {
    link.addEventListener("click", () => {
      const typeSel = document.getElementById("type");
      const wanted = link.dataset.plan;
      if (!typeSel || !wanted) return;
      const opt = [...typeSel.options].find((o) => o.text === wanted || o.value === wanted);
      if (opt) typeSel.value = opt.value || opt.text;
    });
  });

  /* ---- LINE button: copy the number on the way out ----------------------
     LINE has no add-a-friend-by-phone link, so the customer has to paste the
     number into LINE's search themselves. Copying it for them on the same tap
     that opens LINE is the whole difference between one step and three. The
     navigation is never blocked on the clipboard: if the write fails, or the
     browser has no clipboard API, the number is still printed on the button. */
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const num = btn.dataset.copy;
      navigator.clipboard?.writeText(num).then(
        () => {
          btn.classList.add("copied");
          setTimeout(() => btn.classList.remove("copied"), 4000);
        },
        () => {}
      );
    });
  });

  document.querySelectorAll("[data-need]").forEach((link) => {
    link.addEventListener("click", () => prefillLine("งานที่ต้องการ", link.dataset.need));
  });

  /* ---- Phone order bar --------------------------------------------------
     25/8/26 (jek สั่ง): แถบสั่งงานอยู่ค้างตลอดบนจอ ≤960px — ไม่ซ่อนตอนอยู่ที่ hero
     และไม่ซ่อนตอนถึงฟอร์มอีกแล้ว ของเดิมทำให้ปุ่ม "ดูราคา/สั่งผ่าน Fastwork"
     หายไปเองระหว่างเลื่อน ซึ่งเจ้าของบอกตรงๆ ว่าไม่เอา
     (กรณีเดียวที่ยังซ่อนคือตอนเปิดลิ้นชักเมนู — จัดการด้วย CSS :root.menu-open)
     ยังคง observer ของ hero ไว้ เพราะ .queue-stub ใช้คลาส .faded ตัวเดียวกันนี้ */
  const stub = document.querySelector(".queue-stub");
  const hero = document.querySelector(".hero");
  if (hero && "IntersectionObserver" in window) {
    /* 26/8/26 (jek สั่ง): "dont show this on hero page mobile" — แถบไม่ขึ้นตอน
       อยู่ที่ hero แล้วขึ้นเมื่อเลื่อนพ้น hero **และไม่ซ่อนอีกตลอดทั้งหน้า**
       ต่างจากของเดิมก่อน 25/8/26 ที่ซ่อนสองที่ (hero + ตอนถึงฟอร์ม) ซึ่งทำให้
       ปุ่ม "หายไปเอง" ระหว่างเลื่อนอ่าน — อันนั้นคือสิ่งที่เจ้าของสั่งให้เลิก
       รอบนี้ซ่อนที่เดียวคือ hero เท่านั้น
       เงื่อนไขเปลี่ยนจาก (stub && hero) เป็น (hero) เพราะตอนนี้ observer
       ตัวนี้รับผิดชอบสองอย่าง ถ้าหน้าไหนไม่มี .queue-stub แถบจะต้องยังทำงาน */
    new IntersectionObserver(([e]) => {
      if (stub) stub.classList.toggle("faded", !e.isIntersecting);
      document.documentElement.classList.toggle("at-hero", e.isIntersecting);
    }, { threshold: 0 }).observe(hero);
  } else {
    /* ไม่มี IntersectionObserver = ปลดคลาสทิ้ง ให้แถบขึ้นตามปกติ
       ปุ่มสั่งงานที่ขึ้นเกินความจำเป็น ดีกว่าปุ่มที่ไม่มีวันขึ้นเลย */
    document.documentElement.classList.remove("at-hero");
  }

  /* ---- Prices count up ---------------------------------------------------
     Layer 4 of the จืด recipe (playbook/PROMPT-JUED.md): a number you can prove
     should arrive, not sit there. These are the only three numbers on the page
     that qualify — they are the real prices, written in the HTML, and nothing
     here invents or rounds one: the target is READ from the text node it is
     about to animate, so with JS off (or before this runs) the correct price is
     already on screen and stays there.

     The comma format is rebuilt every frame from the same locale that produced
     it, so 3,500 never flickers through 3500. Tabular figures in the CSS stop
     the box from breathing as the digits change. */
  const amounts = [...document.querySelectorAll(".price .amount")];
  if (amounts.length && "IntersectionObserver" in window &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const runCount = (el) => {
      // The bare number sits between <span class="cur"> and <span class="plus">;
      // it is the one text node with a digit in it.
      const node = [...el.childNodes].find(
        (n) => n.nodeType === 3 && /\d/.test(n.nodeValue)
      );
      if (!node) return;
      const target = Number(node.nodeValue.replace(/[^\d]/g, ""));
      if (!target) return;
      const DUR = 900, t0 = performance.now();
      el.style.willChange = "contents";
      const step = (now) => {
        const p = Math.min(1, (now - t0) / DUR);
        // Same ease-out as --ease-out: fast in, settles on the real figure.
        const eased = 1 - Math.pow(1 - p, 3);
        node.nodeValue = Math.round(target * eased).toLocaleString("en-US");
        if (p < 1) { requestAnimationFrame(step); return; }
        node.nodeValue = target.toLocaleString("en-US");   // exact, never a rounding artefact
        el.style.willChange = "auto";
      };
      requestAnimationFrame(step);
    };
    const countIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        countIO.unobserve(e.target);   // once; a price that re-counts is a slot machine
        runCount(e.target);
      });
    }, { threshold: 0.6 });
    amounts.forEach((el) => countIO.observe(el));
  }

  /* ---- Queue ticker -----------------------------------------------------
     The stub is a kitchen order screen, and an order screen that has read 001
     since the page loaded is a picture of a shop with nobody in it. The number
     steps on a slow beat and the digits flip in from below (queueTick).

     Three things stop it, because a counter running to nobody is pure battery:
     reduced motion (it never starts), the hero being scrolled past — the stub is
     already .faded by the order-bar observer above, so the same class is the
     signal — and the tab being in the background, where timers are throttled and
     the flip would be skipped mid-animation anyway. */
  const qNum = document.querySelector(".queue-num");
  if (qNum && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const stubEl = qNum.closest(".queue-stub");
    let n = 1;
    setInterval(() => {
      if (document.hidden || stubEl?.classList.contains("faded")) return;
      // Small range on purpose: this is a motif, not a claim about a full order
      // book. It reads as a kitchen working through a morning, then coming round.
      n = n % 8 + 1;
      qNum.textContent = String(n).padStart(3, "0");
      // Restart the keyframe: removing the class alone does nothing until the
      // style has been recomputed, so the reflow read is load-bearing.
      qNum.classList.remove("tick");
      void qNum.offsetWidth;
      qNum.classList.add("tick");
    }, 4200);
  }

  /* ---- ADDITION 3: stamp the ticket -------------------------------------
     DESIGN-KITCHEN §1.11 already presses the button down on :active. This adds the
     other half of the gesture: a ring of ember ink spreading from the point that
     was actually touched, so committing to an order feels like a stamp coming down
     on a ticket rather than a Material ripple. Pointer coordinates are the only
     part CSS cannot do alone. */
  if (!reduce) {
    document.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest?.(".btn--primary");
      if (!btn || btn.disabled) return;
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--ink-x", `${((e.clientX - r.left) / r.width) * 100}%`);
      btn.style.setProperty("--ink-y", `${((e.clientY - r.top) / r.height) * 100}%`);
      btn.classList.remove("stamped");
      void btn.offsetWidth;            // restart the animation on a repeat press
      btn.classList.add("stamped");
    }, { passive: true });
    document.addEventListener("animationend", (e) => {
      if (e.animationName === "ts-stamp") e.target.classList?.remove("stamped");
    });
  }

  /* ---- Jumping to a section ----------------------------------------------
     Every call to action on this page is an in-page anchor: "สั่งงานกับเรา" goes to
     #contact, "ดูเมนูผลงาน" to #work. The browser's own smooth scroll handles
     these, but it is quick and close to linear, so it arrives at a stop instead of
     a settle. Easing it here puts the jump on the same curve as everything else,
     and matters most on this page because the distances are long — the contact
     form is eight screens down. */
  const EASE = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const headerOffset = () => (document.querySelector(".site-header")?.offsetHeight ?? 0) + 20;

  if (!reduce) {
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = e.target.closest?.('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href").slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();
      const from = window.scrollY;
      const to = Math.max(0, target.getBoundingClientRect().top + from - headerOffset());
      const dist = Math.abs(to - from);
      if (dist < 2) return;
      // Longer jumps get longer, but not proportionally — eight screens at a
      // constant speed would take all day. Clamped either side.
      const dur = Math.min(1100, Math.max(450, dist * 0.35));
      const t0 = performance.now();

      // A wheel or a touch means the reader has taken over; stop immediately
      // rather than fighting them for the scroll position.
      let cancelled = false;
      const stop = () => { cancelled = true; };
      addEventListener("wheel", stop, { passive: true, once: true });
      addEventListener("touchstart", stop, { passive: true, once: true });

      // The click has already been prevented, so if the animation never runs the
      // link would silently do nothing. requestAnimationFrame does not fire in a
      // background tab, a prerender or a restored session — land the jump anyway.
      let started = false;
      const backstop = setTimeout(() => {
        if (started || cancelled) return;
        cancelled = true;
        window.scrollTo(0, to);
        history.replaceState(null, "", `#${id}`);
        // Same as the animated path: a keyboard user must end up at the section,
        // not back where they started.
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }, 120);

      const step = (now) => {
        started = true;
        clearTimeout(backstop);
        if (cancelled) return;
        const p = Math.min(1, (now - t0) / dur);
        window.scrollTo(0, from + (to - from) * EASE(p));
        if (p < 1) requestAnimationFrame(step);
        else {
          removeEventListener("wheel", stop);
          removeEventListener("touchstart", stop);
          // Put the hash back so the address bar and the back button still work,
          // without letting the browser jump to it a second time.
          history.replaceState(null, "", `#${id}`);
          // Focus moves too, or a keyboard user is left where they started.
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        }
      };
      requestAnimationFrame(step);
    });
  }

  /* ---- Leaving the page --------------------------------------------------
     Chrome and Safari 18 animate this themselves via @view-transition; this is
     for everyone else. A link that is about to navigate gets a short fade out
     first, so the page leaves rather than being cut.

     Deliberately narrow: same origin only, no new tab, no modifier keys, no
     download, no hash link on this page — anything that is not a plain
     navigation is left completely alone, and a middle-click or a cmd-click still
     opens a background tab with nothing faded. */
  if (!reduce && !("startViewTransition" in document)) {
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.hash) return;   // in-page anchor
      e.preventDefault();
      document.body.classList.add("is-leaving");
      // Navigate when the fade finishes, with a timer as the backstop in case the
      // transition never fires (a hidden tab will not run it).
      let gone = false;
      const go = () => { if (!gone) { gone = true; location.href = a.href; } };
      document.body.addEventListener("transitionend", go, { once: true });
      setTimeout(go, 300);
    });
  }

  /* ---- Footer year ------------------------------------------------------ */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Hero reel: the work, riding an arc --------------------------------
     The cards are written in here rather than sitting in index.html, because
     each one's position is computed every frame — markup would only be a copy
     of the set to keep in sync. */
  /* ---- Line the reel's top edge up with the header ------------------------
     The frame clips, so its top edge is the line every card is cut on, and left
     to itself that line landed in open space between the header and the badge —
     a card climbing out of it read as a broken screenshot rather than as a card
     passing behind an edge. Sat on the underside of the header bar it becomes a
     line that is already drawn on the page.

     Measured rather than written into the stylesheet: the header's height is a
     line of Thai text plus its padding, so it moves with the font that actually
     loaded. Runs before the reel is built so the arc is laid out at the frame's
     final height, again on resize (synchronously — buildReel's own handler
     re-measures on the next frame and must see the new height), and once more
     when the webfonts land. */
  const alignReelToHeader = () => {
    const visual = document.querySelector(".hero-visual");
    const copy = document.querySelector(".hero-copy");
    const header = document.querySelector(".site-header");
    if (!visual || !copy || !header) return;
    // Measured from zero every time, or the second run would line the reel up
    // against a header it has already been pulled towards.
    visual.style.setProperty("--reel-top", "0px");
    // One column: the reel sits under the copy, nowhere near the header.
    if (visual.getBoundingClientRect().left < copy.getBoundingClientRect().right - 1) {
      visual.style.removeProperty("--reel-top");
      return;
    }
    // Walked with offsetTop, not measured with a rect: this runs while the hero
    // is still holding its entrance offset (.js .reveal sits 20px low until the
    // reveal lands), and a rect reports that transform while offsetTop reports
    // where the box actually is in layout. Reading the rect put the frame 20px
    // too high, and it stayed there, because nothing re-measures once the hero
    // has arrived.
    let top = 0;
    for (let el = visual; el; el = el.offsetParent) top += el.offsetTop;
    // Negative: the frame is pulled UP to the header, and .reel adds the same
    // amount back to its height, so the bottom edge does not move.
    visual.style.setProperty("--reel-top", Math.round(header.offsetHeight - top) + "px");

  };
  alignReelToHeader();
  addEventListener("resize", alignReelToHeader);
  document.fonts?.ready.then(alignReelToHeader);

  const reel = document.querySelector(".reel");
  if (reel) buildReel(reel);

  function buildReel(reel) {
    const WORK = [
      // `reel` = there is a recording of this one being scrolled in
      // assets/work/reel/<img>.mp4, played on hover. Ijek, ScoreUp and Gloss are
      // apps rather than pages — they have SCREENS, with nothing below the fold to
      // scroll to — so they stay stills (the first two flip through screens instead).
      // ลำดับในลิสต์นี้ = ลำดับที่การ์ดไต่ขึ้นบนวงโค้ง และจัด "เป็นกลุ่มตามหมวด" ไม่ใช่สลับ
      // หมวดไปมา: ธุรกิจไทย 4 ใบ → งานดีไซน์ 3 ใบ → แอป 3 ใบ คนที่ยืนดูจะได้เห็นของ
      // ประเภทเดียวกันไหลต่อกันเป็นชุด แทนที่จะกระโดดสลับประเภททุกใบจนอ่านไม่ออกว่ารับงานอะไรบ้าง
      // (ลิสต์ถูก emit สองรอบ ดูคอมเมนต์ท้ายลิสต์ — ใบสุดท้ายจึงวนไปต่อกับใบแรก คือแอป → ธุรกิจไทย
      // ซึ่งเป็นรอยต่อระหว่างกลุ่มพอดี) เพิ่ม/ถอดการ์ดแล้วต้องวางให้อยู่ในกลุ่มของมันทุกครั้ง
      //
      // ทุกใบในลิสต์นี้ต้องเป็นผลงานที่ "กดเข้าไปดูได้จริง" ชุดเดียวกับการ์ดผลงานข้างล่าง
      // ใน index.html เท่านั้น — 21/8/26 ถอด Flow / Aerion 01 (sample5) / SUMMIT ออก
      // เพราะ hero ยังโชว์อยู่ทั้งที่ Flow กับ Aerion ถูกลบจาก work/ ไปแล้ว และ SUMMIT
      // ถูกสั่งถอดจากเว็บ คนที่เห็นการ์ดแล้วเลื่อนลงไปหาจึงไม่เจอ ไฟล์ภาพ/คลิปของสามตัวนี้
      // ยังอยู่ใน assets/ ไม่ได้ลบ ถ้าจะเอากลับมาต้องเอา work/<slug>/ กลับมาด้วย
      // `shot` = a cache-buster for the still, same idea and same reason as the
      // one below: the plate is fetched by name, so re-shooting a card without
      // bumping this leaves every returning visitor looking at the old picture out
      // of their own cache. Only set it on a card whose still has been replaced.
      // true = ship the file as it stands. A NUMBER instead is a cache-buster for
      // a clip that has been re-shot since it first went out: the .mp4 keeps its
      // name, so without one a returning visitor keeps playing the old cut out of
      // their own cache and none of this reaches them. Bump it on every re-shoot.
      // How long each clip runs is set per page in playbook/shoot-reel.mjs, and
      // those numbers are deliberately NOT equal — see the note by REEL_RATE.
      /* กลุ่ม 1 — ธุรกิจไทย: เว็บที่ร้าน/ผู้รับเหมา/คลินิก/เวนิว เอาไปหาลูกค้าได้จริง
         ขึ้นก่อนเพราะเป็นกลุ่มที่คนเปิดหน้านี้ส่วนใหญ่กำลังมองหาของแบบเดียวกัน */
      /* สามใบที่ลงท้าย -multi คือเดโม 5 หน้า (แพ็ก ฿7,500) — 22/8/26 หน้าผลงานเลิกโชว์
         ฉบับหน้าเดียวของสามแบรนด์นี้แล้ว รีลในฮีโร่จึงต้องไถเว็บใบเดียวกับที่กดเข้าไปเจอ
         ไม่งั้นการ์ดกับปลายทางเป็นคนละเว็บ */
      { img: "krua-baansuan", tag: "เว็บร้านอาหาร",     name: "ครัวบ้านสวน",      sub: "เว็บร้านอาหารไทย จองโต๊ะ", shot: 7, reel: 16 },
      { img: "homecraft",     tag: "เว็บรับเหมา",       name: "Homecraft",      sub: "เว็บรับสร้าง/ต่อเติมบ้าน", shot: 5, reel: 16 },
      { img: "glow-clinic-multi", tag: "เว็บคลินิกหลายหน้า", name: "โกลว์ คลินิก", sub: "เว็บคลินิกผิวพรรณ จองคิว", shot: 1, reel: 3 },
      { img: "the-terrace-multi", tag: "เว็บเวนิว 5 หน้า",  name: "เดอะ เทอเรส",  sub: "เว็บเวนิวจัดงานแต่ง", shot: 1, reel: 3 },
      /* 22/8/26 (jek: "ทำไมยังมีการ์ดอู่ช่างชัดในฮีโร่ ลบออก") — อู่ช่างชัดถูกถอนออกจาก
         หน้าผลงานไปแล้วด้วยกฎใน styles.css (.card.work[aria-label*="อู่ช่างชัด"]
         { display:none }) แต่กฎนั้นเลือกด้วย .card.work ซึ่งไม่โดนการ์ดในรีล เพราะรีล
         สร้างจากลิสต์นี้เป็น .slide คนละคลาส = ถอนของชิ้นเดียวกันคนละกลไก ของจึงหาย
         ไปแค่ครึ่งเดียวโดยไม่มีใครรู้ ตอนนี้ถอดออกจากลิสต์ตรงนี้ด้วย
         ถ้าจะเอากลับ ต้องเอากลับพร้อมกันทั้งสองที่ ไม่ใช่ที่ใดที่หนึ่ง
         เหลือ 9 ใบ — คอมเมนต์ท้ายลิสต์เตือนไว้ว่าต่ำกว่า 8 ใบโค้งจะเริ่มมีช่องว่าง */
      /* กลุ่ม 2 — งานดีไซน์: โชว์ฝีมือหน้าตา/ภาพลักษณ์แบรนด์ ไม่ใช่ประเภทธุรกิจ */
      { img: "the-bed-multi",     tag: "เว็บที่พัก 5 หน้า", name: "The Bed",      sub: "เว็บที่พักหรู", shot: 1, reel: 1 },
      { img: "velvet-leaf",   tag: "เว็บร้านค้า",       name: "VELVET LEAF",    sub: "เว็บร้านไลฟ์สไตล์หน้าร้าน", shot: 7, reel: 16 },
      { img: "lumen",         tag: "เว็บ SaaS",        name: "Lumen",          sub: "เว็บซอฟต์แวร์ สมัครใช้ออนไลน์", shot: 5, reel: 18 },
      /* กลุ่ม 3 — แอป: PWA / แอปเดสก์ท็อป ปิดท้ายลิสต์ */
      // The real products, in the arc alongside the demos. The count matters as much
      // as the contents: demos kept being pulled from this list and nothing replaced
      // them, and at five the angular step was wider than the arc was drawn for, so
      // the cards stopped overlapping and floated with gaps between them. Back at ten
      // (21/8/26) they overlap again. Below eight, expect the gaps to return.
      // `pages` = this one is an app, not a page: it has SCREENS, and there is
      // nothing below the fold to scroll to. Hover steps through them instead.
      // Page 1 is the still already above (assets/work/<img>.webp); the names
      // here are the screens after it, in assets/work/pages/<name>.webp. A
      // screen whose file is missing drops itself out of the rotation, so this
      // list can run ahead of the screenshots without breaking a hover.
      // Ijek's still and its page are the SAME two-up composition — two phone
      // panels at identical rects on the same ground, only their contents change.
      // That is not a style choice, it is what makes the crossfade work: the first
      // pass put single full-frame screens against a two-up still, and because
      // nothing lined up, every fade read as a double exposure — a picture flashing
      // in and vanishing rather than one screen dissolving into the next. Both
      // frames are generated from the same panel rect, so a fade only ever moves
      // the contents. Anything added here has to be built the same way.
      //
      // `emoji` = this card is not a still. Ijek's avatar and its reaction faces
      // are Google's ANIMATED Noto emoji in the real app (it serves them off
      // fonts.gstatic.com as looping webp), so a flat screenshot of it is the one
      // thing that misrepresents the product — the fox blinks and the hands wave
      // in the app and sat frozen here. The two plates below are shot with those
      // emoji ERASED, and the animation is laid back over the hole: same artwork,
      // same box, now moving. One list per frame, index 0 being the still; x/y/s
      // are in the composition's own 1280x800 pixels, turned into percentages at
      // render so they ride the card at any size. Anything re-shot has to be
      // erased the same way or the still emoji shows through underneath.
      { img: "ijek",          tag: "เว็บแอป PWA",      name: "Ijek",           sub: "เว็บแอปฝึกวินัยตัวเอง", pages: ["ijek-avatar"],
        emoji: [
          // The still: JEK's fox and its reaction hug, mid-panel, plus the small
          // fox riding the day's progress card on the Schedule screen beside it.
          [{ cp: "1f98a", x: 312.7, y: 264.1, s: 64.5, shadow: true },
           { cp: "1f917", x: 384.4, y: 263.1, s: 64.5, shadow: true },
           { cp: "1f98a", x: 686.5, y: 223.0, s: 40.0 }],
          // The Avatar screen: the fox you are dressing up, at full size.
          [{ cp: "1f98a", x: 337.8, y: 302.8, s: 64.5 }],
        ] },
      // Now flips too. Captured off the app itself (scoreup_new) at 1280x800,
      // signed out, so every screen is the front door a visitor would meet. The
      // four are chosen to answer the card's own copy in order — lessons, the
      // question bank, the flashcards, the league — with the dashboard still as
      // page 1. The one-page ScoreUp landing site is a different product and is
      // deliberately not what these show.
      // reel: 3 กับ pages สามใบ = เลขและลิสต์ชุดเดียวกับการ์ด ScoreUp ใน index.html เป๊ะ
      // (เดิมเป็น reel: true จึงเสิร์ฟคลิปรุ่นแรกค้างให้คนที่เคยเข้าเว็บ และมี "scoreup-5"
      // ที่ไม่มีไฟล์อยู่จริง โค้ดดรอปทิ้งเงียบๆ)
      { img: "scoreup",       tag: "แอปติวสอบ PWA",    name: "ScoreUp",        sub: "แอปติว TOEIC", shot: 8, reel: 7, pages: ["scoreup-2", "scoreup-3", "scoreup-4"] },
      // No `pages`, deliberately. Gloss is a Mac app, so the screens have to come off
      // the running app rather than a URL — that part works (it is Electron, so it
      // opens to remote debugging and the UI even switches to Thai on demand). What
      // is missing is anything worth showing: this install has an empty vocabulary
      // and an empty Learn screen, and the one tab that does hold content is the
      // history, which is a log of whatever was last on the real screen — not
      // something to publish. Re-add the list once the app has data behind it.
      /* Gloss ถูกถอดออกจากวงโค้ง 21/8/26: มันโผล่ในฮีโร่ใบเดียวโดยไม่มีการ์ดในส่วน
         ผลงานและไม่มีในหน้าอ้างอิงเลย คนที่สะดุดตาแล้วเลื่อนไปหาจึงหาไม่เจอ (QC จับได้)
         ใส่กลับได้ทันทีที่แอปมีข้อมูลจริงให้ถ่าย — ปลดคอมเมนต์บรรทัดล่างแล้วเพิ่ม
         การ์ดใน index.html กับ reference.html พร้อมกัน อย่าใส่ที่เดียวอีก
      { img: "gloss",         tag: "แอปเดสก์ท็อป Mac", name: "Gloss",          sub: "แอปแปลเกมบนแมค" }, */
    ];

    /* One frame's worth of live emoji, laid over the hole left in the plate.
       Two files per face, the same pair the team portraits use: the ~5 KB still
       poster ships with the card and is what the card looks like at rest, and
       the ~100 KB animation is fetched on the first hover and swapped in for as
       long as the pointer stays — same promise as the recordings and the page
       flip, told the way THIS card is built. At rest the picture is exactly the
       still it has always been.

       Sizes are percentages of the card, because the card is sized from the
       frame at runtime: the composition is 1280x800 and the card's aspect
       matches it exactly (object-fit: cover between equal ratios crops
       nothing), so a percentage of the composition is a percentage of the
       card, at any size the arc scales it to. */
    const EMO_W = 1280, EMO_H = 800;
    const emoLayer = (list, i) =>
      `<span class="emo-layer" data-f="${i}" data-on="${i === 0 ? 1 : 0}" aria-hidden="true">` +
      list.map((e) =>
        `<img class="emo${e.shadow ? " emo--lift" : ""}" src="assets/emoji/${e.cp}.webp"
              data-still="assets/emoji/${e.cp}.webp" data-anim="assets/emoji/${e.cp}-anim.webp"
              alt="" width="128" height="128" decoding="async"
              style="left:${(e.x / EMO_W * 100).toFixed(3)}%;top:${(e.y / EMO_H * 100).toFixed(3)}%;width:${(e.s / EMO_W * 100).toFixed(3)}%" />`).join("") +
      `</span>`;

    const card = (w) =>
      `<article class="slide" aria-hidden="true"${w.reel ? ` data-reel="assets/work/reel/${w.img}.mp4${w.reel === true ? "" : `?v=${w.reel}`}"` : ""}${w.pages ? ` data-pages="${w.pages.join(",")}"` : ""}>
         <img class="shot" src="assets/work/${w.img}.webp${w.shot ? `?v=${w.shot}` : ""}" alt="" width="1280" height="800" decoding="async" />
         ${(w.emoji || []).map(emoLayer).join("")}
         <div class="plate">
           <span class="tag">${w.tag}</span>
           <h3>${w.name}<small>${w.sub}</small></h3>
         </div>
       </article>`;

    // The list is emitted TWICE — ten cards become twenty positions on the arc.
    // With only one set the angular step spreads the cards further apart than they
    // are tall and they float instead of overlapping. The loop stays modular: each card holds
    // its own u, u wraps at 1, and the wrap happens off-frame. The clone set is
    // aria-hidden so a screen reader hears each piece of work once.
    const html = WORK.map(card).join("");
    /* เขียนลงแทร็ก ไม่ใช่ลง .reel โดยตรง — ป้ายกระดาษสามใบอยู่ใน .reel ระดับเดียวกับ
       แทร็ก (ต้องอยู่ในกรอบถึงจะแทรกกลางกองการ์ดได้) ถ้ายังล้าง innerHTML ของ .reel
       ป้ายจะหายไปทั้งสามใบทันทีที่รีลถูกสร้าง */
    const track = reel.querySelector(".reel__track") || reel;
    track.innerHTML = html + html;

    const slides = [...track.children];
    const N = slides.length;
    /* Which of the two sets a card belongs to. The clone set only exists so the
       arc's wrap happens off-frame; the phone strip hides it (styles.css,
       .reel--strip) because a strip that repeats itself halfway through reads as
       a bug rather than a loop. */
    slides.forEach((el, i) => { if (i >= WORK.length) el.dataset.dup = "1"; });

    const ARC_START = -110;  // degrees; theta 0 is the rightmost bulge, mid-frame
    const ARC_SPAN = 220;    // both ends sit outside the frame, so the wrap is never seen
    const ROT_K = 0.62;      // lean = theta * this, read against the visible slice of the arc
    const LAP = 68;          // seconds for one full lap
    const RAD = Math.PI / 180;

    // Measured from the REEL, not the window: this reel is a column inside the
    // hero, not a full-bleed stage, so window dimensions would put the arc's
    // centre and its wrap points in the wrong place entirely.
    let Rx = 0, Ry = 0, cx = 0;
    let RW = 0, RH = 0, SW = 0, SH = 0;   // กรอบและการ์ด — ใช้หาว่าการ์ดที่ยกขึ้นทับป้ายใบไหน
    const measure = () => {
      const w = reel.clientWidth || 1;
      const h = reel.clientHeight || 1;
      // Hand the frame's width to the stylesheet as an absolute length, so the
      // card can be sized from its container without a percentage (see the
      // --reel-w note in styles.css).
      // Width alone was the wrong input. The frame's height is clamped at 46rem,
      // so past about 1600px the card kept growing while the window it rides in
      // did not: at 2560 the card came out 722px wide against the same 736px
      // frame, filling it edge to edge with no room left for the arc, and eleven
      // of fourteen cards were clipped. Sizing from whichever dimension runs out
      // first keeps the card a sane fraction of the frame at any aspect.
      // 0.78 is deliberately loose. The value that holds the proportion exactly
      // constant is 0.696 — what w * 0.88 already resolves to at 1440 — but that
      // one starts binding on a 1440x900 laptop and shrinks the card on screens
      // where this composition was already approved. 0.78 only takes over past
      // roughly 1670px wide, which is where the clipping actually begins.
      const cardH0 = slides[0].offsetHeight || 0;
      Rx = w * 0.42;                 // sideways bow
      // The step between neighbours is about Ry * 0.24, and a step of ~0.96 of a
      // card's height leaves each card most of its own space. The max() still
      // guarantees a card clears the frame before it wraps.
      /* คงองศาโค้งเดิมไว้ที่ -0.78Rx ตามคอมโพสิชันที่ jek อนุมัติไว้แต่แรก
         (22/8/26 jek: "i want it to show exactly like the old version") —
         รอบก่อนผมดึงเป็น -0.94 เพื่อแลกให้การ์ดใหญ่ขึ้น ซึ่งเปลี่ยนหน้าตากอง
         ไม่ใช่แค่แก้บั๊ก ตอนนี้กลับมาที่เดิม แล้วให้ fitW ข้างล่างเป็นตัวคุมขนาด
         ไม่ให้ล้นแทน */
      cx = -Rx * 0.78;               // recentre the visible bow

      /* ขนาดการ์ดกลับไปเป็นสูตรเดิมทุกตัว (22/8/26) — รอบก่อนผมใส่เพดาน fitW เพื่อกัน
         การ์ดล้นกรอบ แต่ผลคือการ์ดเล็กลง 27% บนหน้าต่างเตี้ย ซึ่ง jek ไม่เอา
         ตอนนี้ปล่อยให้การ์ดใหญ่เท่าเดิมแล้วไปแก้ที่ "กรอบ" แทน: styles.css ให้ .reel
         เฉือนด้วย clip-path ที่เผื่อพื้นที่ด้านขวาไว้ ไม่ใช่ overflow:hidden ที่ขอบกล่อง
         (พื้นที่ที่เผื่อคือช่องว่างของหน้าที่ไม่มีอะไรอยู่แล้ว) */
      reel.style.setProperty("--reel-w", Math.min(w * 0.88, h * 0.78) + "px");
      const cardH = slides[0].offsetHeight || cardH0;
      Ry = Math.max((cardH * 0.96) / 0.24, h * 0.62 + cardH * 0.7);
      /* เก็บขนาดกรอบและขนาดการ์ดไว้ให้ลูปใช้ ลูปจะได้ไม่ต้องอ่าน offsetWidth ทุกเฟรม
         (การอ่านค่าเลย์เอาต์กลางลูป rAF = บังคับเบราว์เซอร์คำนวณเลย์เอาต์ใหม่เฟรมละครั้ง) */
      RW = w; RH = h;
      SW = slides[0].offsetWidth || 0; SH = cardH;
    };

    /* ---- ป้ายหลบเฉพาะใบที่ถูกทับ ------------------------------------------
       22/8/26 รอบสาม (jek): "อย่าให้ป้ายไปอยู่หลังการ์ดทั้งกอง — ให้ป้ายอยู่หน้า
       การ์ดใบอื่น แต่หลังใบที่กำลังถูกชี้"
       ทำด้วย z-index ตรงๆ ไม่ได้: .reel มี clip-path = stacking context ของตัวเอง
       z 400 ที่ลูปเขียนให้การ์ดจึงเทียบกับป้ายที่อยู่ "นอกกรอบ" ไม่ได้เลย ทั้งกอง
       ขึ้นหรือลงพร้อมกันเท่านั้น จะเทียบรายใบได้ต้องย้ายป้ายเข้าไปในกรอบ ซึ่งกรอบ
       จะเฉือนป้ายใบซ้าย (left:-4%) ขาดครึ่งใบ = เปลี่ยนคอมโพสิชันที่อนุมัติแล้ว
       ท่าที่ให้ผลตามที่สั่งโดยไม่ต้องขยับป้าย: กดลงเฉพาะป้ายที่การ์ดใบนั้นทับจริง
       ป้ายที่ไม่ถูกทับยังอยู่ที่ z 300 = ยังอยู่หน้าการ์ดใบอื่นทุกใบตามเดิม
       กล่องของป้ายวัดจาก offsetLeft/Top (ไม่รวม transform) ซึ่งพอ เพราะ ticketBob
       ขยับแค่ไม่กี่พิกเซล — เผื่อขอบไว้ PAD แล้ว */
    measure();
    let resizeRaf = 0;
    addEventListener("resize", () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        // One handler decides both, in this order: which arrangement the deck is
        // in, and — only if it is the arc — the radii it rides. A strip has
        // nothing to measure; CSS sizes the card off the strip itself.
        setStrip(ONE_COLUMN.matches);
        if (!strip) measure();
      });
    });

    // Hover/focus is eased per frame rather than transitioned: the transform is
    // rewritten every frame, so a CSS transition would fight it for the property.
    const lift = new Array(N).fill(0);
    const want = new Array(N).fill(0);
    const lastZ = new Array(N).fill(-1);
    const lastOp = new Array(N).fill("");
    slides.forEach((el, i) => {
      /* ป้ายกระดาษ (.hero-float + .queue-stub) หลบให้เฉพาะการ์ดที่ถูกชี้ — ท่าหลบ
         คำนวณจากพื้นที่ทับกันจริงในลูป (ดู "ป้ายหลบเฉพาะใบที่ถูกทับ" ข้างล่าง)
         ไม่ใช่สวิตช์เหมาเข่งอีกต่อไป */
      const up = () => { want[i] = 1; el.dataset.lift = "1"; playPreview(el); };
      const down = () => { want[i] = 0; el.dataset.lift = "0"; stopPreview(el); };
      el.addEventListener("pointerenter", up);
      el.addEventListener("pointerleave", down);
    });

    // Resolved once, not 18 times per frame.
    const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const POP = REDUCED ? 1 : 1.12;

    /* Pointing at a card plays that site being scrolled, the way a video
       thumbnail previews itself. Two rules hold it together:
       - nothing is fetched until a pointer lands on a card. Six recordings
         loaded up front would cost more than the rest of the page put together,
         and most visitors point at two or three of them.
       - the still under it is never removed, so a touch device (no hover to
         leave with), a reduced-motion visitor and a browser that refuses the
         autoplay all keep the picture they had. */
    const REELS_OK = !REDUCED && matchMedia("(hover: hover)").matches;
    /* The pace is baked into the recordings, NOT set here. playbackRate was the
       obvious lever and it is the wrong one: a player does not invent frames, it
       just holds each one longer, so 0.25x on a 24fps capture showed six unique
       frames a second and the scroll juddered like a slideshow. The recordings
       are re-shot instead — the real page steps down its own scroll and is shot
       at every stop — so every frame is a real one and the motion is smooth at 1x.
       Re-time by re-running playbook/shoot-reel.mjs, never by touching this.

       Equal LENGTH is not equal SPEED, which is what the first cut got wrong: all
       six ran 220 frames, but the pages are not equally tall and do not pin their
       sections equally, so the picture actually travelled 44px a frame on The Bed
       against 20px on Aerion — and the two fastest read as hurried next to their
       neighbours. The frame counts in shoot-reel.mjs are per page for that
       reason, and they are what to change if a clip feels off. */
    const REEL_RATE = 1;

    function playReel(el) {
      const src = el.dataset.reel;
      if (!REELS_OK || !src) return;
      let v = el.querySelector(".shot-reel");
      if (!v) {
        v = document.createElement("video");
        v.className = "shot-reel";
        setReelSources(v, src);
        v.muted = true;        // property, not attribute: Safari reads this one
        v.loop = true;
        v.playsInline = true;  // else iPadOS hijacks it into the fullscreen player
        v.preload = "auto";
        v.tabIndex = -1;
        v.setAttribute("aria-hidden", "true");
        wireReel(v, el);   // ประตูเดียวกับการ์ดผลงาน ดูคอมเมนต์ที่ wireReel
        // Before .plate, not appended: the label sits on top of the card and
        // has no z-index of its own, so a video after it would bury it.
        el.insertBefore(v, el.querySelector(".plate"));
      }
      // Set on every hover, not just at creation: a rate written before the
      // metadata lands is dropped by some browsers, and re-asserting is free.
      v.playbackRate = REEL_RATE;
      window.reelVideo.hold(v);   // กลับมาชี้ระหว่างนับถอยหลังปล่อยทิ้ง = ยกเลิกการถอด
      v.play().catch(() => { /* autoplay refused — the still stays, nothing breaks */ });
    }

    /* ---- The app cards flip pages instead ------------------------------
       A recording of a page being scrolled is the right preview for a site.
       It is the wrong one for an app: Ijek, Gloss and ScoreUp have no fold to
       scroll past, they have screens you move BETWEEN, and scrolling one of
       them would show a dashboard sliding up into whitespace. So a hover on
       one of these steps through its screens on a beat — the same promise
       ("there is more here than the still shows"), told the way the thing is
       actually used.

       Same two rules as the recordings: nothing is fetched until a pointer
       lands, and the still underneath is never removed, so a touch device, a
       reduced-motion visitor and a screenshot that fails to load all keep the
       picture they had. */
    const PAGE_HOLD = 1600;   // ms a screen is held before the next takes over
    const PAGE_FADE = 400;    // crossfade; mirrors --dur-slow in styles.css
    const flips = new WeakMap();   // slide -> { id, i } — the clone set flips independently

    function playPages(el) {
      const names = (el.dataset.pages || "").split(",").filter(Boolean);
      if (!REELS_OK || !names.length) return;

      let frames = [...el.querySelectorAll(".shot-page")];
      if (!frames.length) {
        frames = names.map((name) => {
          const img = document.createElement("img");
          img.className = "shot-page";
          img.src = `assets/work/pages/${name}.webp?v=${window.TS_PAGES_V}`;
          img.alt = "";
          img.decoding = "async";
          img.setAttribute("aria-hidden", "true");
          // A screen whose file never arrives drops out of the rotation rather
          // than flashing a broken frame. The still is a perfectly good page 1,
          // so a card with no screenshots yet simply behaves as it does today.
          img.addEventListener("error", () => { img.dataset.dead = "1"; });
          // Before .plate, for the same reason the video is: the label has no
          // z-index of its own and anything after it would bury it.
          el.insertBefore(img, el.querySelector(".plate"));
          return img;
        });
      }

      const state = flips.get(el) || { id: 0, i: 0 };
      if (state.id) return;                     // already running (re-entered without a leave)
      state.id = setInterval(() => {
        const live = frames.filter((f) => f.dataset.dead !== "1");
        if (!live.length) return;
        // Position 0 is the still itself, so the loop reads
        // page 1 -> 2 -> ... -> back to the front door.
        state.i = (state.i + 1) % (live.length + 1);
        live.forEach((f, k) => { f.dataset.on = k === state.i - 1 ? "1" : "0"; });
        showEmo(el, state.i);
      }, PAGE_HOLD + PAGE_FADE);
      flips.set(el, state);
    }

    /* ---- The emoji come alive under the pointer ------------------------
       Third kind of preview, same two rules as the other two: nothing is
       fetched until a pointer lands on the card, and the picture underneath is
       never removed — leave, and the poster is back, which IS the still the
       card has always shown. REELS_OK carries reduced-motion and touch with it,
       so neither ever loads the ~100 KB animations at all.

       Swapping src back on leave restarts the loop from frame 1 on the next
       hover, which is the same "back to the front door" the recordings and the
       page flip both do. */
    function playEmo(el) {
      if (!REELS_OK) return;
      el.querySelectorAll(".emo[data-anim]").forEach((img) => { img.src = img.dataset.anim; });
    }

    function stopEmo(el) {
      el.querySelectorAll(".emo[data-still]").forEach((img) => { img.src = img.dataset.still; });
    }

    /* The live emoji belong to the screen under them, so they turn over with it —
       the fox on the Main screen has to be gone by the time the Avatar screen has
       faded in over it, or two of them float on one card. Same index space as the
       flip: 0 is the still. A card with no emoji has no layers and this is a
       no-op. */
    function showEmo(el, i) {
      el.querySelectorAll(".emo-layer").forEach((l) => {
        l.dataset.on = Number(l.dataset.f) === i ? "1" : "0";
      });
    }

    function stopPages(el) {
      const state = flips.get(el);
      if (!state) return;
      clearInterval(state.id);
      state.id = 0;
      // Back to page 1, so the next hover starts where the still left off
      // rather than halfway through the app (same rule as the recordings).
      state.i = 0;
      el.querySelectorAll(".shot-page").forEach((f) => { f.dataset.on = "0"; });
      showEmo(el, 0);
    }

    // One pair for every kind of card. A card declares a recording or a set of
    // screens, never both, and a card with neither keeps its still. The emoji
    // ride along with whichever it is — only Ijek has any.
    function playPreview(el) { playReel(el); playPages(el); playEmo(el); }
    function stopPreview(el) { stopReel(el); stopPages(el); stopEmo(el); }

    function stopReel(el) {
      const v = el.querySelector(".shot-reel");
      if (!v) return;
      el.dataset.reelOn = "0";
      v.pause();
      // Back to the top, so the next hover starts at the site\'s front door
      // rather than halfway down its footer.
      v.currentTime = 0;
      /* 21/8/26: บล็อกนี้เคยไม่คืนหน่วยความจำเลย ทั้งที่การ์ดกริดคืนมาตั้งแต่รอบก่อน
         — กฎถูกเขียนไว้ที่เดียวแล้วไม่ได้ไล่มาถึงที่นี่ ซึ่งเป็นที่ที่หนักกว่าด้วยซ้ำ:
         วงโค้งมีสิบใบและคนชี้เล่นบ่อยกว่ากริด ชี้ครบทุกใบ = <video> ค้างสิบตัว */
      window.reelVideo.release(v);
    }

    const born = performance.now();
    let lastNow = born;

    function frame(t) {
      const now = performance.now();
      const dt = Math.min(100, now - lastNow);   // a backgrounded tab is not one giant step
      lastNow = now;
      const ease = 1 - Math.exp(-dt / 90);       // time-based, so it eases the same at any framerate

      const ip = Math.min(1, (now - born) / 800);
      const intro = 1 - (1 - ip) ** 3;


      for (let i = 0; i < N; i++) {
        const u = (i / N + t) % 1;               // this card's place on the arc
        const th = ARC_START + ARC_SPAN * u;
        const r = th * RAD;

        lift[i] += (want[i] - lift[i]) * ease;
        const h = lift[i];                       // 0 riding the arc, 1 popped forward

        const x = cx + Rx * Math.cos(r);
        const y = Ry * Math.sin(r);

        // Depth: cos(theta) is 1 at the bulge and falls toward the ends, so far
        // cards shrink and dim a little.
        const k = Math.max(0, Math.min(1, (Math.cos(r) - 0.62) / 0.38));
        const sc = ((0.92 + 0.08 * k) * (1 - h) + POP * h) * (0.9 + 0.1 * intro);
        const op = ((0.85 + 0.15 * k) * (1 - h) + h) * intro;
        const rot = th * ROT_K * (1 - h);        // hover unwinds the lean

        const el = slides[i];
        el.style.transform =
          `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${sc})`;
        const o2 = op.toFixed(3);
        if (o2 !== lastOp[i]) { lastOp[i] = o2; el.style.opacity = o2; }

        // Stack by screen position: the lower a card sits, the further in front
        // it is. Ordering by distance along the arc instead put the belly card in
        // front of BOTH neighbours, so the overlap flipped direction halfway down
        // the run. Hold the raised layer until the card is all the way home, or
        // it drops behind its neighbours while still visibly lifted.
        // 400 while hovered, which is ABOVE the 300 band that .hero-float and
        // .queue-stub sit in. That band exists so the paper furniture pinned onto
        // the reel is never sliced by a card travelling past — but the card under
        // the pointer is the one thing that outranks it: at 200 the neighbouring
        // cards cleared it and the two floating tickets still lay across its face.
        // Nothing else about the hover changed — it lifts where it stands.
        const z = h > 0.002 ? 400 : Math.round(u * 100);
        if (z !== lastZ[i]) { lastZ[i] = z; el.style.zIndex = z; }

      }

    }

    const still = REDUCED;

    // Place the deck before the first paint either way, so it never flashes as an
    // un-positioned pile and never sits invisible behind .slide's opacity:0.
    frame(still ? 0 : 1);

    let raf = 0;
    let travelled = 0;          // laps completed, kept across pauses so the run resumes
    let startedAt = 0;
    let lastTick = 0;
    const tick = (now) => {
      lastTick = now;
      const t = still ? 0 : 1 - (((travelled + (now - startedAt)) / (LAP * 1000)) % 1);
      frame(t);
      raf = requestAnimationFrame(tick);
    };
    const run = () => {
      if (raf) return;
      startedAt = lastTick = performance.now();
      slides.forEach((el) => { el.style.willChange = "transform, opacity"; });
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      if (!raf) return;
      travelled += performance.now() - startedAt;
      cancelAnimationFrame(raf);
      raf = 0;
      // Drop the composited layers while the reel is parked. Fourteen of them held
      // for the whole page is real memory on a phone.
      slides.forEach((el) => { el.style.willChange = "auto"; });
    };

    // Off-screen, the reel costs nothing. A visitor reading the pricing table five
    // sections down was paying for eighteen style writes a frame to animate
    // something nobody could see.
    // Two independent reasons to be parked — off-screen, and tab in the background.
    // Both must be clear before the loop runs, or coming back to a tab would restart
    // an animation five sections above the fold.
    /* ---- Phones get a strip, not an arc ------------------------------------
       The arc is drawn against a wide column: its centre sits off to the left of
       the frame so only the right-hand bow shows. In a 390px column that same
       geometry puts a third of every card off the left edge and leaves the
       frame's clamped height as empty paper under the buttons — which is exactly
       what the hero looked like on a phone. Below the breakpoint the loop parks
       and CSS lays the cards out as a strip you swipe instead.

       1024px, because that is where .hero-grid stops being two columns — the
       arc's whole premise is a column standing beside the copy. Picking a phone
       number instead would have left the tablet range running an arc inside a
       30rem cap: a 1480px-tall hero to show one bowed card.

       The switch is read off one matchMedia and thrown from the resize handler
       that already measures the arc — one handler, one order of operations. A
       `change` listener on the query would be a second mechanism deciding the
       same thing, and the two would race on the frame the breakpoint is crossed.
       setStrip is a no-op unless the answer actually changed. */
    const ONE_COLUMN = matchMedia("(max-width: 1024px)");
    let strip = false;

    /* ---- The strip runs too ------------------------------------------------
       A shelf that only moves when you push it shows one card and hides eight.
       The strip travels on its own, at the arc's own pace — LAP / N is 4.25s per
       card either way, so the two arrangements of the same deck read as one
       object moving at one speed, not as two features.

       It travels by scrollLeft rather than by a transform on a track, and that is
       the whole reason the swipe survives: the element stays a real scroll
       container, so a finger simply takes over mid-run and the run picks up from
       wherever the finger left it. A translated track would have had to be
       rebuilt as a fake carousel to answer a touch at all.

       The seam is the clone set, exactly as on the arc: one full set travelled is
       the same picture as zero travelled, so the jump back is invisible. */
    const SEC_PER_CARD = LAP / N;
    // A finger owns the deck while it is on it, and for a beat after — resuming
    // the instant a flick is released fights the flick for the same pixels.
    const HAND_OFF = 2400;
    let stripRaf = 0, stripLast = 0, stripHold = 0;
    // Our own position, because scrollLeft is the browser's: at 120Hz a frame's
    // travel is under a pixel, and browsers that round scrollLeft on write would
    // swallow every step and the strip would sit still. The reading below is what
    // keeps the two in agreement when a finger moves the deck instead.
    let stripPos = 0;
    const setSpan = () => {
      // Measured from the flow, not computed from --slide-w: the gap and the card
      // are both fluid, and the only number that matters is where the clone of
      // card 1 begins.
      const first = slides[0], clone = slides[WORK.length];
      return clone ? clone.offsetLeft - first.offsetLeft : 0;
    };
    const stripTick = (now) => {
      const dt = Math.min(100, now - stripLast);
      stripLast = now;
      const span = setSpan();
      // A finger, a wheel or a snap-back moved it: that position is the truth now.
      if (Math.abs(reel.scrollLeft - stripPos) > 1.5) stripPos = reel.scrollLeft;
      if (span > 0 && now >= stripHold) {
        stripPos += (span / WORK.length / SEC_PER_CARD) * (dt / 1000);
        if (stripPos >= span) stripPos -= span;
        reel.scrollLeft = stripPos;
      }
      stripRaf = requestAnimationFrame(stripTick);
    };
    const runStrip = () => {
      if (stripRaf) return;
      stripLast = performance.now();
      stripPos = reel.scrollLeft;
      stripRaf = requestAnimationFrame(stripTick);
    };
    const haltStrip = () => {
      if (!stripRaf) return;
      cancelAnimationFrame(stripRaf);
      stripRaf = 0;
    };
    const handOff = () => { stripHold = performance.now() + HAND_OFF; };
    /* ---- ใครคือ "นิ้วที่เป็นเจ้าของแถบ" (แก้ 26/8/26) -------------------------
       เจ้าของ: "why sometime the sliding card mobile version stop?"
       วัดด้วย WebKit จอ 390x844: ก่อนแตะแถบเดิน 128px/1.5วิ · แตะปุ๊บเหลือ 0px
       แล้ว 2px · พ้น 2.4 วิกลับมา 103px = หยุดเป๊ะตาม HAND_OFF ทุกครั้งที่แตะโดน

       เจตนาเดิมถูก (นิ้วปัดการ์ดอยู่ แถบไม่ควรวิ่งแย่ง) แต่เงื่อนไขกว้างเกินไป:
       ผูกกับ touchstart/pointerdown เฉยๆ แปลว่า **นิ้วที่ลงมาเพื่อเลื่อนหน้า
       แนวตั้ง แต่บังเอิญลงตรงแถบ ก็นับด้วย** บนมือถือแถบนี้กว้างเต็มจอ
       โอกาสลงโดนสูงมาก = แถบหยุดเองเป็นระยะโดยที่คนไม่ได้ตั้งใจแตะมัน

       เกณฑ์ใหม่: นับเฉพาะ "ปัดแนวนอนจริง" — ต้องเลื่อนเกิน 6px และเลื่อนแนวนอน
       มากกว่าแนวตั้ง จึงถือว่านิ้วเป็นเจ้าของแถบ แค่แตะหรือลากลงไม่นับ
       6px คือระยะที่แยก "แตะ" ออกจาก "เริ่มลาก" โดยไม่ไวจนนิ้วสั่นก็ติด

       ใช้ touch* กับ pointer* คนละเส้นทางโดยตั้งใจ: บน iOS พอการเลื่อนจริงเริ่ม
       เบราว์เซอร์จะยิง pointercancel แล้วหยุดส่ง pointermove แต่ touchmove ยังมาต่อ
       จึงให้ touch คุมนิ้ว ส่วน pointer คุมเมาส์/สไตลัส (กันนับซ้ำด้วย pointerType)
       wheel ก็เช็คทิศเหมือนกัน — สกรอลล์แนวตั้งบนแทร็กแพดไม่ควรหยุดแถบ */
    const OWN_PX = 6;
    let downX = 0, downY = 0, owning = false;
    const armFrom = (x, y) => { downX = x; downY = y; owning = false; };
    const decide = (x, y) => {
      if (owning) { handOff(); return; }
      const dx = Math.abs(x - downX), dy = Math.abs(y - downY);
      if (dx < OWN_PX || dx <= dy) return;
      owning = true;
      handOff();
    };
    reel.addEventListener("touchstart", (e) => {
      const t = e.touches[0]; if (t) armFrom(t.clientX, t.clientY);
    }, { passive: true });
    reel.addEventListener("touchmove", (e) => {
      const t = e.touches[0]; if (t) decide(t.clientX, t.clientY);
    }, { passive: true });
    // ปล่อยนิ้วแล้วยังมีแรงเหวี่ยงต่ออีกพัก จึงต่อเวลาให้ — แต่เฉพาะนิ้วที่ปัดแถบจริง
    // ถ้าแค่แตะแล้วปล่อย owning ยังเป็น false ตรงนี้จึงไม่ทำงาน
    reel.addEventListener("touchend", () => { if (owning) handOff(); }, { passive: true });
    reel.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") armFrom(e.clientX, e.clientY);
    });
    reel.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch" && e.buttons) decide(e.clientX, e.clientY);
    });
    reel.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) handOff();
    }, { passive: true });
    const setStrip = (on) => {
      if (on === strip) return;
      strip = on;
      reel.classList.toggle("reel--strip", on);
      if (on) {
        halt();
        // The loop writes transform, opacity and z-index inline every frame, and
        // an inline style outranks the stylesheet — so they have to be handed
        // back before the strip rules can place anything.
        slides.forEach((el) => { el.style.cssText = ""; });
        lastZ.fill(-1);
        lastOp.fill("");
        reel.scrollLeft = 0;
        stripPos = 0;
      } else {
        haltStrip();
        // Back to the arc: re-measure (the frame's width drives the card) and
        // place the deck before the next paint, so it never shows as a pile.
        measure();
        frame(still ? 0 : 1 - ((travelled / (LAP * 1000)) % 1));
      }
      sync();
    };

    let inView = !("IntersectionObserver" in window);
    // Two reasons for either arrangement to be parked: off-screen, and tab in the
    // background. Which loop is the live one is the third question, and it is the
    // arrangement that answers it — never both at once.
    const sync = () => {
      const awake = inView && !document.hidden;
      if (strip) {
        halt();
        // REDUCED holds the arc still; it holds the strip still for the same
        // reason, and the stylesheet hands that case its snap points back.
        awake && !REDUCED ? runStrip() : haltStrip();
      } else {
        haltStrip();
        awake ? run() : halt();
      }
    };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => entries.forEach((e) => { inView = e.isIntersecting; sync(); }),
        { rootMargin: "120px" }
      ).observe(reel);
    }
    // A hidden tab pauses rAF anyway; halting explicitly stops the resume from
    // booking the whole background stretch as travel and jumping the deck forward.
    document.addEventListener("visibilitychange", sync);
    setStrip(ONE_COLUMN.matches);
    sync();
  }
})();
