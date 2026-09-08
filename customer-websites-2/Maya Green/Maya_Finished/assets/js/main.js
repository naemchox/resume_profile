/* ══════════════════════════════════════════════════════════════════
   MAYA GREEN — main.js
   No dependencies. Every feature degrades to working HTML without JS.
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var root = document.documentElement;

  /* Tell the inline watchdog in <head> that we booted, so it leaves the
     `js` class alone. If this file ever fails to load, the watchdog strips
     `js` and every .reveal falls back to plain visible content. */
  root.classList.add('js-ready');

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };


  /* ── Language toggle ─────────────────────────────────────────────
     TH is the HTML default, so the site reads correctly with JS off. */

  var LANGS = ['th', 'en'];

  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) lang = 'th';
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang);
    store.set('mg-lang', lang);

    document.querySelectorAll('[data-lang-set]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.langSet === lang));
    });
  }

  document.querySelectorAll('[data-lang-set]').forEach(function (btn) {
    btn.addEventListener('click', function () { setLang(btn.dataset.langSet); });
  });

  setLang(store.get('mg-lang') || 'th');


  /* ── Age gate (Thailand: 20+) ────────────────────────────────────
     Hidden in markup and only revealed by JS — so a crawler, or a
     visitor with JS off, is never locked out of the content. */

  /* Make everything outside an overlay unreachable — to the keyboard, to the
     screen reader, and to the pointer. `aria-modal` alone is a claim, not a
     mechanism: without this the page behind stays tabbable and announced.
     Unsupported in very old browsers, where it is simply a no-op. */
  function setInert(selectors, on) {
    selectors.forEach(function (sel) {
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        if (on) els[i].setAttribute('inert', '');
        else els[i].removeAttribute('inert');
      }
    });
  }

  /* Shared Tab trap. Unlike a button-only query this keeps working when the
     panel holds no controls at all — the "you are under 20" screen replaces
     the card with plain text, and the old trap gave up and let Tab walk out
     into the site it was there to protect. */
  var FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function trapTab(container, e) {
    if (e.key !== 'Tab') return;
    var f = container.querySelectorAll(FOCUSABLE);
    if (!f.length) {                 // nothing to land on — stay put
      e.preventDefault();
      container.focus();
      return;
    }
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  var gate = document.getElementById('gate');

  if (gate) {
    // Everything the gate has to seal off. The drawer is in here too: it sits
    // outside <main>, so it would otherwise stay reachable behind the gate.
    var GATE_BACKDROP = ['.nav', '.drawer', 'main', '.foot', '.warn'];
    // The answer lasts exactly one visit. It lives in sessionStorage, so it
    // carries across links within the site but dies with the tab — and a
    // reload wipes it explicitly, so refreshing always re-asks.
    //
    // Earlier builds wrote the same key to localStorage, which never expires.
    // Drop it, or anyone who answered before this change stays let in forever.
    var AGE_KEY = 'mg-age';
    try { localStorage.removeItem(AGE_KEY); } catch (e) {}

    var isReload = false;
    try {
      var navEntry = performance.getEntriesByType('navigation')[0];
      if (navEntry) isReload = navEntry.type === 'reload';
      else if (performance.navigation) isReload = performance.navigation.type === 1;
    } catch (e) { /* no Navigation Timing — treat as a normal navigation */ }

    var passed = false;
    try {
      if (isReload) sessionStorage.removeItem(AGE_KEY);
      else passed = sessionStorage.getItem(AGE_KEY) === 'ok';
    } catch (e) { /* private mode — fall through and ask */ }

    var card = gate.querySelector('.gate__card');
    var cardHTML = card ? card.innerHTML : '';

    // Focus has to be able to rest on the panel itself once the buttons go
    gate.setAttribute('tabindex', '-1');
    gate.addEventListener('keydown', function (e) { trapTab(gate, e); });

    function denied() {
      if (!card) return;
      // The heading keeps id="gate-h" so the dialog's aria-labelledby does not
      // end up pointing at a node this replaced. role="alert" on the message
      // is what makes the refusal audible — replacing innerHTML on its own
      // announces nothing at all.
      card.innerHTML =
        '<h2 class="h-md" id="gate-h">' +
          '<span lang="th">ขออภัย</span><span lang="en">Sorry</span>' +
        '</h2>' +
        '<p style="margin-top:.75rem" role="alert">' +
          '<span lang="th">เว็บไซต์นี้สงวนไว้สำหรับผู้ที่มีอายุ 20 ปีขึ้นไปเท่านั้น</span>' +
          '<span lang="en">This site is for visitors aged 20 and over only.</span>' +
        '</p>';
      gate.focus();          // the buttons that held focus no longer exist
    }

    function bindButtons() {
      var y = document.getElementById('gate-yes');
      var n = document.getElementById('gate-no');
      if (y) y.addEventListener('click', closeGate);
      if (n) n.addEventListener('click', denied);
      if (y) y.focus();
    }

    function openGate() {
      // Restore the question — a "no" answer rewrites the card, and a
      // back/forward restore can land here with that copy still in place.
      if (card && card.innerHTML !== cardHTML) card.innerHTML = cardHTML;
      gate.hidden = false;
      document.body.style.overflow = 'hidden';
      setInert(GATE_BACKDROP, true);
      bindButtons();
    }

    function closeGate() {
      try { sessionStorage.setItem(AGE_KEY, 'ok'); } catch (e) {}
      gate.hidden = true;
      document.body.style.overflow = '';
      setInert(GATE_BACKDROP, false);
    }

    // Back/forward can serve the page from the bfcache without re-running this
    // script. Re-check the flag rather than assuming: within a visit the answer
    // still stands, but if it was cleared the gate has to come back.
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      var ok = false;
      try { ok = sessionStorage.getItem(AGE_KEY) === 'ok'; } catch (err) {}
      if (!ok) openGate();
    });

    if (!passed) openGate();
  }


  /* ── Nav: shadow on scroll ───────────────────────────────────── */

  var nav = document.getElementById('nav');

  if (nav) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        nav.classList.toggle('is-stuck', window.scrollY > 24);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }


  /* ── Nav: which section am I in ──────────────────────────────────
     Three pages became three sections of one 20,000px scroll, and the
     per-page aria-current went with them. This puts it back: the link whose
     section currently owns the top of the viewport is marked, for the
     highlight and for anyone asking their screen reader where they are.

     Driven off the same rAF-throttled scroll as the shadow above rather than
     an IntersectionObserver — "the section crossing a line near the top of
     the viewport" is a position question, and observers answer a visibility
     question, which needs fighting to turn into this. */

  var spied = [].slice.call(document.querySelectorAll('.nav__links a[href^="#"]'))
    .map(function (a) {
      return { link: a, section: document.getElementById(a.getAttribute('href').slice(1)) };
    })
    .filter(function (s) { return s.section; });

  if (spied.length) {
    var updateCurrent = function () {
      var line = 120;                 // just below the 80px bar
      var active = null;
      spied.forEach(function (s) {
        if (s.section.getBoundingClientRect().top <= line) active = s;
      });
      // Past the last section the final link stays lit, which is right —
      // the footer belongs to whatever you were reading.
      spied.forEach(function (s) {
        if (s === active) s.link.setAttribute('aria-current', 'true');
        else s.link.removeAttribute('aria-current');
      });
    };

    var spyTicking = false;
    var markCurrent = function () {
      if (spyTicking) return;
      spyTicking = true;
      requestAnimationFrame(function () {
        updateCurrent();
        spyTicking = false;
      });
    };
    window.addEventListener('scroll', markCurrent, { passive: true });
    window.addEventListener('resize', markCurrent, { passive: true });
    // Run the first pass directly rather than through the throttle. A deferred
    // first pass leaves the nav unmarked until the visitor happens to scroll —
    // and if the page loads in a background tab, where rAF does not tick, the
    // in-flight flag would latch on and the spy would never run at all.
    updateCurrent();
  }


  /* ── Mobile drawer ───────────────────────────────────────────── */

  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');

  if (burger && drawer) {
    // The bar itself stays reachable — the burger is the way back out — so
    // only the page underneath is sealed off.
    var DRAWER_BACKDROP = ['main', '.foot', '.warn'];
    drawer.setAttribute('tabindex', '-1');

    var openDrawer = function () {
      drawer.classList.add('is-open');
      burger.setAttribute('aria-expanded', 'true');
      // Without this the page scrolls away underneath the open menu
      document.body.style.overflow = 'hidden';
      setInert(DRAWER_BACKDROP, true);
      // The panel carries a `visibility` transition, so it is still
      // `visibility: hidden` — and therefore unfocusable — for the rest of
      // this tick; the flip only happens once the transition starts. Try
      // immediately (which is all that is needed when motion is reduced and
      // the transition is off) and retry on the next frame otherwise.
      // Without this the keyboard lands nowhere and the menu is unusable.
      if (!focusFirstInDrawer()) requestAnimationFrame(focusFirstInDrawer);
    };

    function focusFirstInDrawer() {
      var first = drawer.querySelector(FOCUSABLE);
      if (first) first.focus();
      return drawer.contains(document.activeElement);
    }

    var closeDrawer = function (returnFocus) {
      if (!drawer.classList.contains('is-open')) return;
      drawer.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      setInert(DRAWER_BACKDROP, false);
      // Sending focus back to the control that opened it — otherwise focus is
      // orphaned on a hidden node and the next Tab restarts from the top
      if (returnFocus) burger.focus();
    };

    burger.addEventListener('click', function () {
      if (drawer.classList.contains('is-open')) closeDrawer(true);
      else openDrawer();
    });

    drawer.addEventListener('keydown', function (e) { trapTab(drawer, e); });

    drawer.querySelectorAll('a').forEach(function (a) {
      // Follows an in-page anchor, so do not steal focus back to the burger
      a.addEventListener('click', function () { closeDrawer(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer(true);
    });

    // Drawer is a mobile-only affordance — drop it if we grow past the
    // breakpoint, or the scroll lock and inert backdrop outlive it
    window.addEventListener('resize', function () {
      if (window.innerWidth > 860) closeDrawer(false);
    });
  }


  /* ── Scroll reveal ───────────────────────────────────────────── */

  var revealables = document.querySelectorAll('.reveal');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (still || !('IntersectionObserver' in window)) {
    // No animation wanted, or no support — just show everything
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);          // reveal once, then stop watching
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    /* Reveal whatever is already on screen straight away, before handing
       over to the observer. IntersectionObserver does not fire while the
       tab is hidden (background tab, prerender, restored session), but
       getBoundingClientRect still reports correctly — so without this the
       above-the-fold content can sit invisible until the tab is focused. */
    revealables.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0) {
        el.classList.add('is-in');
      } else {
        io.observe(el);
      }
    });
  }


  /* ── Copy to clipboard ───────────────────────────────────────────
     Any [data-copy] control puts its value on the clipboard and flips to
     a "copied" face for a moment. navigator.clipboard needs a secure
     context, so there is a hidden-textarea fallback for plain http:// and
     for files opened straight off disk. */

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);   // iOS wants the explicit range
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var timer;

    var flash = function (ok) {
      if (!ok) return;                          // nothing copied, say nothing
      btn.classList.add('is-copied');
      clearTimeout(timer);
      timer = setTimeout(function () { btn.classList.remove('is-copied'); }, 2000);
    };

    btn.addEventListener('click', function () {
      var text = btn.dataset.copy;

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
          function () { flash(true); },
          function () { flash(legacyCopy(text)); }
        );
      } else {
        flash(legacyCopy(text));
      }
    });
  });


  /* ── Ghost-button spotlight ───────────────────────────────────────
     Feeds the cursor position to the radial gradient on .btn--ghost as
     --mx/--my. Purely decorative: main.css falls back to a centred glow
     when this never runs, and skips the effect entirely under
     prefers-reduced-motion, so there is nothing to undo here.

     One delegated pointermove on the document rather than a listener per
     button — the count is small now but the footer and drawer both grow. */

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var spot = null;                    // button currently under the cursor
    var spotQueued = false;
    var spotX = 0, spotY = 0;

    document.addEventListener('pointermove', function (e) {
      var hit = e.target.closest ? e.target.closest('.btn--ghost') : null;

      // Left the previous button — clear its vars so it re-centres for
      // the next hover instead of keeping a stale corner position.
      if (spot && spot !== hit) {
        spot.style.removeProperty('--mx');
        spot.style.removeProperty('--my');
      }

      spot = hit;
      if (!spot) return;

      spotX = e.clientX;
      spotY = e.clientY;

      if (spotQueued) return;
      spotQueued = true;
      requestAnimationFrame(function () {
        spotQueued = false;
        if (!spot) return;
        var r = spot.getBoundingClientRect();
        spot.style.setProperty('--mx', ((spotX - r.left) / r.width  * 100) + '%');
        spot.style.setProperty('--my', ((spotY - r.top)  / r.height * 100) + '%');
      });
    }, { passive: true });
  }


  /* ── Footer year ─────────────────────────────────────────────── */

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

})();
