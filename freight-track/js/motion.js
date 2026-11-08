/* ============================================================
   motion.js — แอนิเมชันของทั้งเว็บ

   โทน: สุขุม มั่นใจ ดูแพง — ผู้ใช้หลักอายุ 30–40 ใช้ทั้งวันในงานจริง
     · ไม่เด้งดึ๋ง ไม่มีของตกลงมาเต็มจอ ไม่ยื้อเวลาคนทำงาน (ทุกอย่างจบใน ~0.2–0.8 วิ)
     · เคลื่อนแค่ transform / opacity ลื่นบนมือถือคนขับ
     · เคลื่อนเพื่อบอกอะไรบางอย่างเสมอ — ของใหม่เข้ามา สถานะเปลี่ยน งานเสร็จ
     · เครื่องที่ตั้ง "ลดการเคลื่อนไหว" ไว้ ข้ามทั้งหมด

   ไม่ใช้ไลบรารีเพิ่ม — Web Animations API (element.animate) มีในทุกเบราว์เซอร์อยู่แล้ว
   ============================================================ */

const EASE = 'cubic-bezier(.2,.7,.2,1)';            /* ออกตัวไว แล้วค่อย ๆ นิ่ง */
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 0. โครงหน้ารอโหลด → หน้าจริง ----------------------
   shell() เรียกตอนต้นไฟล์ของทุกหน้า ก่อนหน้านั้นจะวาดข้อมูลแบบ synchronous ต่อจนจบไฟล์
   รอสองเฟรมจึงแน่ใจว่าหน้าวาดเสร็จแล้ว ค่อยสลับ — ไม่มีจังหวะที่เนื้อหาโผล่แวบแล้วหาย */
export function pageReady(){
  const go = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    enterPage();                                        /* ตั้งจุดเริ่มแอนิเมชันก่อน แล้วค่อยเผยหน้า */
    document.documentElement.classList.add('is-ready');
    const sk = document.querySelector('body > .skel');
    if (sk) setTimeout(() => sk.remove(), 300);
  }));
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go, { once:true }) : go();
}

/* ---------- 1. เปิดหน้า: ของบนจอค่อย ๆ ขึ้นมาทีละชิ้น ------------ */
export function enterPage(){
  if (reduce()) return;
  const run = () => {
    const picks = [...document.querySelectorAll(
      'main .eyebrow, main h1, main h1 + p, main .card, main .kpi, #demoBarSlot > *')]
      .filter(el => !el.closest('[data-reveal]') && !el.hasAttribute('data-reveal'))
      .filter(el => el.getBoundingClientRect().top < innerHeight + 40)
      .slice(0, 14);
    picks.forEach((el, i) => el.animate(
      [{ opacity:0, transform:'translateY(10px)' }, { opacity:1, transform:'none' }],
      { duration:420, delay:i * 40, easing:EASE, fill:'backwards' }));
  };
  run();
}

/* ---------- 2. ตัวเลขนับขึ้น ------------------------------------ */
const lastNum = new Map();
/**
 * ตัวเลขใน selector นับจากค่าเดิมไปค่าใหม่ — เรียกทุกครั้งหลังวาดใหม่ได้เลย
 * ค่าที่ไม่เปลี่ยนจะไม่ขยับ (กระดานวาดใหม่ทุกนาที ไม่อยากให้ตัวเลขวิ่งทุกนาที)
 */
export function countUp(container, selector, group = 'default'){
  if (!container) return;
  container.querySelectorAll(selector).forEach((el, i) => {
    const key = `${group}:${i}`;
    const to = Number(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;
    const from = lastNum.has(key) ? lastNum.get(key) : 0;
    lastNum.set(key, to);
    if (from === to || reduce()) return;
    const t0 = performance.now(), dur = from === 0 ? 900 : 600;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString('th-TH');
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    if (from !== 0){
      el.animate([{ color:'var(--amber-dim)' }, { color:'inherit' }], { duration:1400, easing:'ease-out' });
    }
  });
}

/* ---------- 3. รายการที่อัปเดตสด --------------------------------
   ตารางกระดานงานถูกวาดใหม่ทั้งก้อนทุกครั้งที่ข้อมูลเปลี่ยน
   ตัวนี้จำว่าแถวไหนเคยเห็นแล้ว หน้าตาเป็นยังไง แล้วเลือกขยับเฉพาะที่มีความหมาย
     · วาดครั้งแรก      → แถวไหลขึ้นมาทีละแถว + แถบความคืบหน้าวิ่งจาก 0
     · แถวใหม่           → เลื่อนเข้ามา + ไฮไลต์สีส้มจาง ๆ แล้วหายไป
     · แถวที่สถานะเปลี่ยน → ไฮไลต์ + ป้ายสถานะเด้งเบา ๆ ครั้งเดียว */
export function liveList(container, { row = '[data-id]', key = (el) => el.dataset.id, sig = (el) => el.dataset.sig || '' } = {}){
  const seen = new Map();
  let first = true;
  /** @param {{reset?:boolean}} opts reset:true = เปลี่ยนมุมมอง (แท็บ/คำค้น) — ไหลเข้าเบา ๆ ไม่ไฮไลต์ว่า "ใหม่" */
  return function afterRender(opts = {}){
    if (opts.reset) first = true;
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    const rows = [...el.querySelectorAll(row)];
    const quiet = reduce();
    rows.forEach((r, i) => {
      const k = key(r), s = sig(r);
      const was = seen.get(k);
      seen.set(k, s);
      if (quiet) return;
      if (first){
        if (i < 18){
          r.animate([{ opacity:0, transform:'translateY(10px)' }, { opacity:1, transform:'none' }],
            { duration:420, delay:i * 32, easing:EASE, fill:'backwards' });
          growBars(r, 200 + i * 32);
        }
      } else if (was === undefined){
        r.animate([{ opacity:0, transform:'translateX(-10px)' }, { opacity:1, transform:'none' }],
          { duration:420, easing:EASE });
        flash(r);
        growBars(r, 120);
      } else if (was !== s){
        flash(r);
        const pill = r.querySelector('.pill');
        pill?.animate([{ transform:'scale(1)' }, { transform:'scale(1.12)' }, { transform:'scale(1)' }],
          { duration:520, easing:EASE });
      }
    });
    first = false;
  };
}

/** ไฮไลต์สีส้มจาง ๆ ที่ค่อย ๆ หายไป — บอกว่า "ตรงนี้เพิ่งเปลี่ยน" */
export function flash(el){
  if (!el || reduce()) return;
  el.animate([{ backgroundColor:'var(--amber-wash)' }, { backgroundColor:'var(--amber-wash)', offset:.35 }, { backgroundColor:'transparent' }],
    { duration:1800, easing:'ease-out' });
}

/** แถบความคืบหน้าในแถววิ่งจาก 0 ถึงค่าจริง */
function growBars(scope, delay = 0){
  scope.querySelectorAll('.tripbar i').forEach(b => {
    b.animate([{ transform:'scaleX(0)' }, { transform:'scaleX(1)' }],
      { duration:700, delay, easing:EASE, fill:'backwards' });
  });
}

/* ---------- 4. ฉลองงานสำเร็จ -------------------------------------
   วงกลมวาดตัวเอง → เครื่องหมายถูก → จุดสีกระจายออกเบา ๆ แล้วจางหายเอง
   ใช้เฉพาะจังหวะที่เป็นความสำเร็จจริง: ปิดจุดส่ง นำเข้างาน sync ไฟล์ที่ลากมาวาง
   ไม่บังงาน — แตะที่ไหนก็ปิด และหายเองใน ~1.6 วินาที */
export function celebrate(title, sub = '', { big = false } = {}){
  if (reduce()) return;
  const wrap = document.createElement('div');
  wrap.className = 'celebrate';
  wrap.setAttribute('aria-hidden', 'true');
  const dots = Array.from({ length: big ? 18 : 12 }, (_, i) => {
    const a = (i / (big ? 18 : 12)) * Math.PI * 2 + Math.random() * .3;
    const d = (big ? 92 : 74) + Math.random() * 26;
    const c = ['var(--amber)', 'var(--green)', 'var(--blue)', 'var(--amber-dim)'][i % 4];
    return `<i style="--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;background:${c}"></i>`;
  }).join('');
  wrap.innerHTML = `
    <div class="celebrate-card">
      <div class="celebrate-mark">
        <span class="celebrate-ring"></span>
        <svg viewBox="0 0 52 52" width="58" height="58">
          <circle cx="26" cy="26" r="23" fill="none" stroke="var(--green)" stroke-width="3" pathLength="1" class="c-circle"/>
          <path d="M15 27 l7.5 7.5 L37.5 19" fill="none" stroke="var(--green)" stroke-width="3.6"
                stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="c-check"/>
        </svg>
        <span class="celebrate-dots">${dots}</span>
      </div>
      <div class="celebrate-title">${escape(title)}</div>
      ${sub ? `<div class="celebrate-sub">${escape(sub)}</div>` : ''}
    </div>`;
  document.body.appendChild(wrap);
  const bye = () => {
    if (!wrap.isConnected) return;
    wrap.animate([{ opacity:1 }, { opacity:0 }], { duration:260, easing:'ease-in' }).onfinish = () => wrap.remove();
  };
  wrap.addEventListener('click', bye);
  setTimeout(bye, big ? 2000 : 1600);
}

const escape = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
