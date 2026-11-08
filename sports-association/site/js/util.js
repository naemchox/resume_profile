// ตัวช่วยที่ทุกหน้าใช้ร่วมกัน: ไอคอน, escape, วันที่ภาษาไทย, carousel

const s = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icon = {
  menu: s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  arrowR: s('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  arrowL: s('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  arrowUR: s('<path d="M7 17L17 7M9 7h8v8"/>'),
  arrowUp: s('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  cal: s('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', 'class="cal"'),
  mail: s('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  info: s('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  video: s('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'),
  camera: s('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  download: s('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  pin: s('<path d="M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21z"/></svg>',
  instagram: s('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>'),
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 00-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 002.4 7.2 26 26 0 002 12a26 26 0 00.4 4.8 2.5 2.5 0 001.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 001.8-1.8A26 26 0 0022 12a26 26 0 00-.4-4.8zM10 15V9l5.2 3z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 3c.3 2.1 1.6 3.6 3.9 3.8v3a7 7 0 01-3.9-1.2v6.1A5.7 5.7 0 1111 9v3.1a2.7 2.7 0 102.6 2.7V3z"/></svg>',
};

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const NEWS_CATEGORIES = {
  announcement: 'ประกาศ',
  press: 'ข่าวประชาสัมพันธ์',
  community: 'สังคมและชุมชน',
  competition: 'การแข่งขัน',
};

export function thDate(d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return d ? new Intl.DateTimeFormat('th-TH', opts).format(d) : '';
}

export function thDateRange(a, b) {
  if (!b || a.toDateString() === b.toDateString()) return thDate(a);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${thDate(b)}`;
  }
  return `${thDate(a, { day: 'numeric', month: 'short' })} – ${thDate(b)}`;
}

const rtf = new Intl.RelativeTimeFormat('th', { numeric: 'auto' });
export function timeAgo(d) {
  if (!d) return '';
  const sec = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(sec);
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(sec / 86400), 'day');
  return thDate(d);
}

export function paragraphs(text) {
  return String(text ?? '').split(/\n{2,}/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

// ผูกปุ่มลูกศรกับแถบเลื่อนแนวนอน
export function bindCarousel(root) {
  const track = $('.carousel__track', root);
  const prev = $('[data-prev]', root);
  const next = $('[data-next]', root);
  if (!track || !prev || !next) return;
  const step = () => (track.firstElementChild?.getBoundingClientRect().width || 300) + 1;
  const update = () => {
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  };
  prev.onclick = () => track.scrollBy({ left: -step(), behavior: 'smooth' });
  next.onclick = () => track.scrollBy({ left: step(), behavior: 'smooth' });
  track.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

export const arrowsHTML = (light = false) => `
  <div class="arrows">
    <button class="arrow-btn ${light ? 'arrow-btn--light' : ''}" data-prev aria-label="ก่อนหน้า">${icon.arrowL}</button>
    <button class="arrow-btn ${light ? 'arrow-btn--light' : ''}" data-next aria-label="ถัดไป">${icon.arrowR}</button>
  </div>`;

export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

// เนื้อหาถูกสร้างด้วย JS หลังโหลดหน้า จึงต้องเลื่อนไปที่ #anchor เอง
export function scrollToHash() {
  if (!location.hash) return;
  const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (el) requestAnimationFrame(() => el.scrollIntoView());
}

// ตำแหน่งรูป { x, y } (0–100) ที่แอดมินลากตั้งไว้ → attribute style ของ <img> (ไม่มีค่า = กึ่งกลาง)
export function posCss(pos) {
  const n = v => Math.min(100, Math.max(0, Number(v)));
  return pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y)) ? `object-position:${n(pos.x)}% ${n(pos.y)}%` : '';
}
export const objPos = pos => { const css = posCss(pos); return css ? ` style="${css}"` : ''; };
