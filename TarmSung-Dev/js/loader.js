/* เลขรุ่นของภาพหน้าเดโม (assets/work/pages/*.webp) — ประกาศที่เดียว ใช้ทั้ง
   js/main.js และ js/peek.js — อยู่ในไฟล์นี้เพราะเป็นสคริปต์เดียวที่ทั้งหน้าแรก
   และหน้าอ้างอิงโหลดเหมือนกัน (reference.html ไม่ได้โหลด main.js): URL ชุดนี้ถูกประกอบด้วย JS ไม่ได้เขียนใน HTML ด่านตรวจ
   ?v ของ playbook/deploy.mjs จึงมองไม่เห็น และ _headers ตั้ง /assets/* เป็น
   immutable หนึ่งปี — ถ่ายภาพใหม่แล้วไม่บวกเลขนี้ = คนที่เคยเปิดการ์ดค้างอยู่กับ
   ภาพเก่าทั้งปี บวกทุกครั้งที่รัน playbook/shoot-pages.mjs */
window.TS_PAGES_V = 28;   /* 28: โกลว์ คลินิก ฉบับหลายหน้า เปลี่ยนเป็นเดโม 14 หน้า ถ่ายภาพชุดใหม่ 6 ใบ · 27: เปลี่ยนชื่อเดโม playport → gamedock (ไฟล์ภาพเปลี่ยนชื่อด้วย) · 26: playport ถ่ายใหม่หลังปกเกมเปลี่ยนเป็นรูปถ่าย · 24: playport ถ่ายใหม่หลังเปลี่ยนเครื่องเกมเป็นรูปถ่ายจริง · 22: + chang-chat · 19: + glow-clinic-multi · 18: the-bed-multi · 17: the-terrace-multi (22/8/26) */
  /* 16 ลงไปดูคอมเมนต์เดิมข้างล่าง */   /* 5: ภาพการ์ด Ijek ถูกถ่ายใหม่เป็นจอแอปจริง ไม่ใช่หน้าเว็บขายของ (21/8/26)
     15: ถ่าย ijek-3 ใหม่ให้อวตารโลมาอยู่เต็มตัว — เลขนี้คุมภาพใน assets/work/pages/
     ทั้งโฟลเดอร์ ถ่ายใบไหนใหม่แล้วไม่ขยับเลขนี้ คนที่เคยเข้าเว็บจะเห็นภาพเก่าตลอดปี */

/* ===========================================================================
   ตามสั่ง — loading screen controller
   ---------------------------------------------------------------------------
   The head script decides WHETHER to show it (html.loading, written before the
   first paint so there is no flash of the page behind it). This file only ever
   decides WHEN to take it away, and it is deferred, so it cannot delay the very
   load it is measuring.

   Three rules it exists to keep:
     1. It never traps anyone. A hung font, a dead image, a script that throws —
        the cap fires anyway and the page is handed over.
     2. It is never so brief it flickers. Coming off a warm cache the load event
        can land in 80ms, and a screen that appears and vanishes inside a tenth
        of a second reads as a glitch, not as a greeting.
     3. It is cheap enough to run on every page load, which is what it now does
        (see the head script). Nothing is stored, nothing is remembered — the
        floor and the cap below are the whole cost.
   ======================================================================== */
(function () {
  var html = document.documentElement;
  if (!html.classList.contains("loading")) return;

  var el = document.getElementById("ld");
  if (!el) { html.classList.remove("loading"); return; }   // markup missing: never hold the page for a screen that isn't there

  // Someone who asked for less motion is also asking to get on with it.
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* A refresh is not an arrival. Someone who reloads (or comes back through
     history, or has already been served once in this tab) has seen the kitchen
     open — holding them behind it a second time reads as a delay, not a greeting.
     The screen still SHOWS on every load (jek's call, see the head script); only
     the floor changes, so a reload is a blink of the mark rather than a wait.
     Three ways to be a repeat, because no single one covers it:
       reload / back_forward  — the actual refresh, even in a brand-new tab
       ts-served in session   — second page of the same visit, or a tab restored
     Both reads are wrapped: Safari with "Block All Cookies" throws on
     sessionStorage rather than returning null, and the Navigation Timing entry
     is absent on old browsers. Either failure just means "treat it as new". */
  var repeat = false;
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    if (nav && (nav.type === "reload" || nav.type === "back_forward")) repeat = true;
  } catch (e) {}
  try {
    if (sessionStorage.getItem("ts-served")) repeat = true;
    sessionStorage.setItem("ts-served", "1");
  } catch (e) {}

  // 1200, not 950: the pan's loop runs just under two seconds, and the point of
  // putting it there is that someone sees it cook. Still the shortest floor that
  // does — anything past this is charging the visitor for our own animation.
  // 420 for a repeat: past the flicker threshold (rule 2 above), under the point
  // where it feels like waiting.
  var MIN = still ? 350 : (repeat ? 420 : 1200);   // floor: below this the screen is a flicker
  var CAP = repeat ? 2000 : 4000;                  // ceiling: past this nothing is worth waiting for
  var started = Date.now();
  var done = false;

  html.classList.add("ld-lock");   // see the note on .ld-lock in styles.css

  function finish() {
    if (done) return;
    done = true;
    html.classList.add("loaded");           // stamp lands, rail closes, sheet lifts
    // Released on the frame the sheet starts to lift, not the frame the stamp
    // lands: the entrances behind it take about a second, and starting them any
    // earlier means the hero has finished rising before the paper is out of the
    // way. LIFT is the transition-delay on html.loaded .ld in styles.css — the
    // two are one number and must move together.
    var LIFT = still ? 0 : 340;
    setTimeout(function () {
      document.dispatchEvent(new CustomEvent("ts:served"));
    }, LIFT);
    setTimeout(function () {
      html.classList.remove("loading", "loaded", "ld-lock");
      if (el.parentNode) el.parentNode.removeChild(el);
    }, still ? 400 : 820);
  }

  function ready() {
    setTimeout(finish, Math.max(0, MIN - (Date.now() - started)));
  }

  if (document.readyState === "complete") ready();
  else window.addEventListener("load", ready);
  setTimeout(finish, CAP);
})();
