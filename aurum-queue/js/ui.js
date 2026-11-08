/* ============================================================
   AURUM — ui.js  ·  THE APP SHELL
   Everything that must be true on EVERY page is bound here —
   never page-by-page. New pages get all of it by importing
   this one module and calling shell().

   Owns: brand/white-label · nav · toasts · modals · scroll
   reveals · the atmospheric layer · counters · micro-motion.
   ============================================================ */

import { getSettingsSync } from './store.js';

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    // `true` must become the string "true" — [aria-pressed="true"] selectors depend on it
    else n.setAttribute(k, v === true ? 'true' : v);
  }
  kids.flat().forEach(k => k != null && n.append(k.nodeType ? k : document.createTextNode(k)));
  return n;
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 1. BRAND / WHITE-LABEL (Phase 5) ----------
   One function, called on load and on every settings save,
   so re-branding is instant across the whole product.       */
export function applyBrand(s = getSettingsSync()) {
  const r = document.documentElement;
  r.style.setProperty('--h', s.hue);
  r.style.setProperty('--ca', s.chroma);
  r.dataset.field = s.field === 'cream' ? 'cream' : 'dark';
  $$('[data-brand="wordmark"]').forEach(n => n.textContent = s.wordmark || s.salonName);
  $$('[data-brand="tagline"]').forEach(n => n.textContent = s.tagline);
  $$('[data-brand="tagTh"]').forEach(n => n.textContent = s.tagTh);
  $$('[data-brand="phone"]').forEach(n => n.textContent = s.phone);
  $$('[data-brand="line"]').forEach(n => n.textContent = s.line);
  $$('[data-brand="address"]').forEach(n => n.textContent = s.address);
  const t = document.title.split('·').pop().trim();
  document.title = `${s.wordmark || s.salonName} · ${t}`;
  // favicon closes the loop — the motif, in the brand hue
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="oklch(${s.field === 'cream' ? '.97' : '.155'} .01 ${s.hue})"/><path d="M12 1.4C17.9 5.1 21.2 11 20.2 16.4c-.6 3.2-3.6 6-7.6 6.2-.4-2.6.8-4.2.8-6.4s-1.8-3.3-1.8-5.6c0-2.6 2.2-4 1.6-6.6-2.8 2.6-6.2 4.2-8.2 8-2 3.9-.8 8.1 1.6 10.6C2.6 21.4.9 17 1.7 12.6 2.9 6.4 8.2 3.6 12 1.4Z" fill="oklch(.8 ${s.chroma} ${s.hue})"/></svg>`;
  let link = $('link[rel="icon"]') || document.head.appendChild(el('link', { rel: 'icon' }));
  link.type = 'image/svg+xml';
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/* ---------- 2. TOASTS ---------- */
let toastHost;
export function toast(msg, kind = '', ms = 4200) {
  toastHost ||= document.body.appendChild(el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const t = el('div', { class: 'toast ' + kind },
    el('span', { class: 'motif', style: 'width:16px;height:16px;flex:none;background:currentColor;-webkit-mask:var(--motif-mask) center/contain no-repeat;mask:var(--motif-mask) center/contain no-repeat;margin-top:4px' }),
    el('span', { html: msg }));
  toastHost.append(t);
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  t.addEventListener('click', kill);
  setTimeout(kill, ms);
  return t;
}

/* ---------- 3. NAV ---------- */
function navHTML(active) {
  const s = getSettingsSync();
  const links = [
    ['index.html#problem', 'ปัญหาที่แก้', 'why'],
    ['index.html#choose', 'เลือกยังไง', 'choose'],
    ['index.html#pricing', 'ค่าบริการ', 'pricing'],
    ['manage.html', 'จัดการคิวของฉัน', 'manage'],
    ['admin.html', 'สำหรับร้าน', 'admin'],
  ];
  return `
  <a class="skip" href="#main">ข้ามไปเนื้อหาหลัก</a>
  <header class="nav" id="nav">
    <a class="brandmark" href="index.html" aria-label="กลับหน้าแรก">
      <span class="mk" aria-hidden="true"></span>
      <span><span class="wordmark" data-brand="wordmark">${esc(s.wordmark)}</span>
      <span class="sub" data-brand="tagline">${esc(s.tagline)}</span></span>
    </a>
    <button class="navtoggle" id="navtoggle" aria-expanded="false" aria-controls="navlinks" aria-label="เมนู">
      <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M0 1h18M0 6h18M0 11h18"/></svg>
    </button>
    <nav class="navlinks" id="navlinks" aria-label="เมนูหลัก">
      ${links.map(([h, t, k]) => `<a href="${h}"${k === active ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
      <a class="btn btn-gold btn-sm" href="book.html">จองคิว</a>
    </nav>
  </header>`;
}

/* ---------- 4. FOOTER ---------- */
function footerHTML() {
  const s = getSettingsSync();
  return `
  <footer class="field-sunken" style="border-top:1px solid var(--c-border);padding-block:var(--s8) var(--s6)">
    <div class="wrap">
      <div class="grid g4" style="gap:var(--s6)">
        <div>
          <div class="brandmark" style="margin-bottom:var(--s3)">
            <span class="mk" aria-hidden="true"></span>
            <span><span class="wordmark" data-brand="wordmark">${esc(s.wordmark)}</span>
            <span class="sub" data-brand="tagline">${esc(s.tagline)}</span></span>
          </div>
          <p class="hint" data-brand="tagTh">${esc(s.tagTh)}</p>
        </div>
        <div>
          <p class="lbl" style="margin-bottom:var(--s3)">ติดต่อ</p>
          <p class="hint" style="line-height:2">
            โทร <span class="num" data-brand="phone">${esc(s.phone)}</span><br>
            LINE <span data-brand="line">${esc(s.line)}</span><br>
            <span data-brand="address">${esc(s.address)}</span>
          </p>
        </div>
        <div>
          <p class="lbl" style="margin-bottom:var(--s3)">เวลาทำการ</p>
          <p class="hint" style="line-height:2">
            อังคาร–พฤหัสบดี 10:00–20:00<br>
            ศุกร์–เสาร์ 10:00–21:00<br>
            อาทิตย์ 11:00–19:00<br>
            <span style="color:var(--c-muted)">จันทร์ ปิดทำการ</span>
          </p>
        </div>
        <div>
          <p class="lbl" style="margin-bottom:var(--s3)">ลัด</p>
          <p class="hint" style="line-height:2">
            <a href="book.html" style="border-bottom:1px solid var(--c-border)">จองคิว</a><br>
            <a href="manage.html" style="border-bottom:1px solid var(--c-border)">ตรวจสอบ/ยกเลิกคิว</a><br>
            <a href="admin.html" style="border-bottom:1px solid var(--c-border)">เข้าระบบร้าน</a>
          </p>
        </div>
      </div>
      <div class="rule" style="margin-block:var(--s6)"></div>
      <p class="hint" style="display:flex;gap:var(--s4);flex-wrap:wrap">
        <span>© ${new Date().getFullYear()} <span data-brand="wordmark">${esc(s.wordmark)}</span></span>
        <span class="row-end">สร้างด้วยระบบจองคิว AURUM · เปลี่ยนโลโก้และสีได้เองในหน้าตั้งค่า</span>
      </p>
    </div>
  </footer>`;
}

/* ---------- 5. SCROLL REVEALS (varied by kind) ---------- */
let revealIO = null;
/* Safety net: IntersectionObserver callbacks are throttled (and sometimes never
   delivered) while a tab is backgrounded or being driven headlessly. A page whose
   content is stuck at opacity 0 is worse than a page with no animation, so we also
   sweep the viewport on load / visibility change / a short timer. */
function sweepReveals() {
  const h = innerHeight || 800;
  $$('[data-reveal]:not(.in)').forEach(n => {
    const r = n.getBoundingClientRect();
    if (r.top < h * 0.98 && r.bottom > -80) {
      n.classList.add('in');
      revealIO?.unobserve(n);
    }
  });
}
function bindReveals(root = document) {
  const nodes = $$('[data-reveal]', root).filter(n => !n.dataset.bound);
  if (!nodes.length) return;
  if (reduced()) { nodes.forEach(n => { n.classList.add('in'); n.dataset.bound = 1; }); return; }
  revealIO ||= new IntersectionObserver((ents) => {
    ents.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } });
  }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
  nodes.forEach(n => { n.dataset.bound = 1; revealIO.observe(n); });
  requestAnimationFrame(() => requestAnimationFrame(sweepReveals));
  setTimeout(sweepReveals, 900);
}

/* stagger children automatically: data-stagger on the parent */
function bindStagger(root = document) {
  $$('[data-stagger]', root).forEach(p => {
    [...p.children].forEach((c, i) => {
      if (!c.hasAttribute('data-reveal')) c.setAttribute('data-reveal', p.dataset.stagger || 'rise');
      c.style.setProperty('--d', (i % 6) * 70 + 'ms');
    });
  });
}

/* ---------- 6. ATMOSPHERE — gilded dust, paused off-screen ---------- */
export function atmosphere(host, count = 26) {
  if (!host || reduced()) return;
  const a = el('div', { class: 'atmo', 'aria-hidden': 'true' });
  a.append(el('div', { class: 'shaft' }));
  for (let i = 0; i < count; i++) {
    const sz = 1 + Math.random() * 2.6;
    a.append(el('i', {
      class: 'mote',
      style: `--i:${i};left:${(Math.random() * 104 - 2).toFixed(1)}%;top:${(20 + Math.random() * 80).toFixed(1)}%;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px`,
    }));
  }
  host.prepend(a);
  new IntersectionObserver(([e]) => a.classList.toggle('paused', !e.isIntersecting), { threshold: 0 }).observe(host);
}

/* ---------- 7. COUNTERS ---------- */
function bindCounters(root = document) {
  const ns = $$('[data-count]', root).filter(n => !n.dataset.bound);
  const run = (n) => {
    const to = parseFloat(n.dataset.count), dp = +(n.dataset.dp || 0), suf = n.dataset.suffix || '';
    if (reduced()) { n.textContent = to.toFixed(dp) + suf; return; }
    const t0 = performance.now(), dur = 1300;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      n.textContent = (to * e).toFixed(dp) + suf;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: .5 });
  ns.forEach(n => { n.dataset.bound = 1; io.observe(n); });
}

/* ---------- 8. MICRO-MOTION: magnetic CTA + spotlight tilt ---------- */
function bindMagnetic(root = document) {
  if (reduced() || !matchMedia('(pointer:fine)').matches) return;
  $$('[data-magnetic]', root).forEach(b => {
    if (b.dataset.bound) return; b.dataset.bound = 1;
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * .16).toFixed(1)}px,${((e.clientY - r.top - r.height / 2) * .22).toFixed(1)}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
}
function bindTilt(root = document) {
  if (reduced() || !matchMedia('(pointer:fine)').matches) return;
  $$('[data-tilt]', root).forEach(c => {
    if (c.dataset.bound) return; c.dataset.bound = 1;
    c.style.transformStyle = 'preserve-3d';
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      c.style.transform = `perspective(900px) rotateX(${(-y * 4.5).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateY(-3px)`;
      c.style.setProperty('--mx', ((x + .5) * 100).toFixed(1) + '%');
      c.style.setProperty('--my', ((y + .5) * 100).toFixed(1) + '%');
    });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  });
}

/* ---------- 9. THE SHELL ---------- */
export function shell({ nav = true, footer = true, active = '' } = {}) {
  applyBrand();
  if (nav) {
    const host = $('#nav-host') || document.body.insertBefore(el('div', { id: 'nav-host' }), document.body.firstChild);
    host.innerHTML = navHTML(active);
    const t = $('#navtoggle'), l = $('#navlinks');
    t?.addEventListener('click', () => {
      const open = l.classList.toggle('open');
      t.setAttribute('aria-expanded', open);
    });
    const onScroll = () => $('#nav')?.classList.toggle('stuck', scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
  if (footer) {
    const host = $('#footer-host') || document.body.appendChild(el('div', { id: 'footer-host' }));
    host.innerHTML = footerHTML();
  }
  enhance();
  window.addEventListener('aurum:brand', () => applyBrand());
  return { toast, enhance, applyBrand };
}

/** Re-run every progressive enhancement — safe to call after any DOM injection. */
export function enhance(root = document) {
  bindStagger(root); bindReveals(root); bindCounters(root); bindMagnetic(root); bindTilt(root);
}

addEventListener('load', sweepReveals);
addEventListener('scroll', () => { if (revealIO) sweepReveals(); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) sweepReveals(); });

/* expose a fallback handle so a page that forgets the import still works */
window.Aurum = { shell, toast, enhance, applyBrand, atmosphere, $, $$, el, esc };
