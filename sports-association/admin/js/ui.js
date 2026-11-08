// โครงหน้า, แถบสถานะ, modal ยืนยัน และตัวช่วยแสดงผล
import { ready } from './firebase.js';
import { requireAdmin, logout } from './auth.js';
import { SITE_URL, STATUS_LABELS } from './config.js';
import { toDate } from './db.js';

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  news: '<path d="M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3"/>',
  banner: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M3 13l5-4 4 3 3-2 6 4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  album: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 16l-5-5-9 10"/>',
  image: '<path d="M4 5h16v14H4z"/><path d="M4 15l4-4 4 4 3-3 5 5"/><circle cx="15" cy="9" r="1.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>'
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

const NAV = [
  { id: 'dashboard', href: 'index.html', label: 'ภาพรวม', icon: 'home' },
  { id: 'news', href: 'news.html', label: 'ข่าว', icon: 'news' },
  { id: 'banners', href: 'banners.html', label: 'แบนเนอร์หน้าแรก', icon: 'banner' },
  { id: 'events', href: 'events.html', label: 'ปฏิทินการแข่ง', icon: 'calendar' },
  { id: 'albums', href: 'albums.html', label: 'อัลบั้มรูป', icon: 'album' },
  { id: 'site-images', href: 'site-images.html', label: 'รูปประจำหน้า', icon: 'image' }
];

function renderShell(active) {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `
    <div class="brand">
      <div class="brand-name">Sample Sports</div>
      <div class="brand-sub">ระบบจัดการเว็บไซต์</div>
    </div>
    <nav class="nav">
      ${NAV.map(n => `<a href="${n.href}" class="${n.id === active ? 'active' : ''}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
      <a href="${SITE_URL}" target="_blank" rel="noopener">${icon('external')}<span>ดูหน้าเว็บจริง</span></a>
    </nav>
    <div class="sidebar-foot">
      <div class="user-email" id="user-email">${ready ? '' : 'โหมดดูหน้าตา'}</div>
      ${ready ? '<a href="#" id="logout-link">ออกจากระบบ</a>' : '<a href="login.html">หน้าเข้าสู่ระบบ</a>'}
    </div>`;

  const main = document.querySelector('.main');
  main.insertAdjacentHTML('afterbegin', `
    <header class="topbar">
      <button class="menu-btn" id="menu-btn" aria-label="เปิดเมนู">${icon('menu')}</button>
      <span class="brand-name">Sample Sports</span>
    </header>
    ${ready ? '' : '<div class="setup-banner" role="alert"><strong>ยังไม่ได้ตั้งค่า Firebase</strong>เปิดดูหน้าตาได้ แต่บันทึกข้อมูลไม่ได้ (ดู admin/README.md)</div>'}`);

  document.getElementById('menu-btn').addEventListener('click', () => document.body.classList.add('nav-open'));
  document.getElementById('backdrop').addEventListener('click', () => document.body.classList.remove('nav-open'));
  document.getElementById('logout-link')?.addEventListener('click', e => { e.preventDefault(); logout(); });
}

// ปุ่มที่มี data-write จะถูกปิดเมื่อยังไม่ได้ตั้งค่า Firebase (รวมปุ่มที่ render ทีหลัง)
function lockWrites() {
  const lock = root => root.querySelectorAll?.('[data-write]').forEach(el => {
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
    el.title = 'ยังไม่ได้ตั้งค่า Firebase';
  });
  lock(document);
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if (n.matches('[data-write]')) lock(n.parentNode);
    lock(n);
  }))).observe(document.body, { childList: true, subtree: true });
}

// เรียกต้นทุกหน้า: วาดเมนู → เช็กสิทธิ์ → แสดงหน้า
export async function bootPage(active) {
  renderShell(active);
  if (!ready) lockWrites();
  const session = await requireAdmin();
  if (session) {
    document.getElementById('user-email').textContent = session.admin.name || session.user.email;
  }
  document.body.classList.remove('is-checking');
  return session;
}

/* ---------- แถบสถานะ ---------- */
let statusEl, statusTimer;
function statusBox() {
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'status';
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.hidden = true;
    document.body.appendChild(statusEl);
    // dialog ปิดแล้ว → ย้ายแถบสถานะกลับมาที่ body (เช่น "บันทึกแล้ว" ที่ขึ้นก่อนปิดฟอร์ม)
    document.addEventListener('close', e => {
      if (e.target.contains?.(statusEl)) document.body.appendChild(statusEl);
    }, true);
  }
  return statusEl;
}
function showStatus(kind, msg, autoHide) {
  const el = statusBox();
  // <dialog> ที่เปิดด้วย showModal อยู่ชั้นบนสุด ต้องย้ายแถบสถานะเข้าไปใน dialog ไม่งั้นจะถูกบัง
  const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  if (el.parentNode !== host) host.appendChild(el);
  clearTimeout(statusTimer);
  el.className = `status ${kind}`;
  el.innerHTML = `${kind === 'saving' ? '<span class="spinner"></span>' : ''}<span class="msg"></span>${kind === 'error' ? '<button aria-label="ปิด">×</button>' : ''}`;
  el.querySelector('.msg').textContent = msg;
  el.querySelector('button')?.addEventListener('click', () => { el.hidden = true; });
  el.hidden = false;
  if (autoHide) statusTimer = setTimeout(() => { el.hidden = true; }, autoHide);
}

export const status = {
  saving: (msg = 'กำลังบันทึก…') => showStatus('saving', msg),
  ok: (msg = 'บันทึกแล้ว') => showStatus('ok', msg, 3000),
  error: err => showStatus('error', `ผิดพลาด: ${errorMessage(err)}`),
  hide: () => { if (statusEl) statusEl.hidden = true; }
};

export function errorMessage(err) {
  if (!err) return 'ไม่ทราบสาเหตุ';
  const map = {
    'permission-denied': 'ไม่มีสิทธิ์ทำรายการนี้ (ตรวจสอบว่าบัญชีอยู่ใน admins)',
    'storage/unauthorized': 'ไม่มีสิทธิ์อัปโหลดไฟล์ (ตรวจสอบ admins และ Storage rules)',
    'storage/quota-exceeded': 'พื้นที่เก็บไฟล์เต็ม',
    'storage/retry-limit-exceeded': 'อินเทอร์เน็ตไม่เสถียร อัปโหลดไม่สำเร็จ',
    'storage/canceled': 'ยกเลิกการอัปโหลด',
    unavailable: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต',
    'failed-precondition': 'ฐานข้อมูลยังไม่พร้อม'
  };
  return map[err.code] || err.message || String(err);
}

/* ---------- modal ยืนยัน (ห้ามใช้ confirm ของ browser) ---------- */
export function confirmDialog({ title = 'ยืนยัน', message = '', confirmText = 'ยืนยัน', danger = false } = {}) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'small';
    dlg.innerHTML = `
      <div class="dlg">
        <div class="dlg-head"><h2></h2></div>
        <div class="dlg-body"><p></p></div>
        <div class="dlg-foot">
          <button type="button" class="btn btn-secondary" data-act="cancel">ยกเลิก</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok"></button>
        </div>
      </div>`;
    dlg.querySelector('h2').textContent = title;
    dlg.querySelector('p').textContent = message;
    dlg.querySelector('[data-act=ok]').textContent = confirmText;
    const done = val => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.querySelector('[data-act=cancel]').onclick = () => done(false);
    dlg.querySelector('[data-act=ok]').onclick = () => done(true);
    dlg.addEventListener('cancel', e => { e.preventDefault(); done(false); });
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector('[data-act=cancel]').focus();
  });
}

// เปิด/ปิด <dialog> ฟอร์มของแต่ละหน้า
export function setupDialog(dlg) {
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
  return {
    open: () => dlg.showModal(),
    close: () => dlg.close()
  };
}

// ล็อกปุ่มระหว่างบันทึก กันกดซ้ำ
export async function withBusy(buttons, fn) {
  const list = [].concat(buttons).filter(Boolean);
  list.forEach(b => { b.disabled = true; });
  try {
    return await fn();
  } finally {
    if (ready) list.forEach(b => { b.disabled = false; });
  }
}

/* ---------- แสดงผล ---------- */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
}

export function fmtRange(a, b) {
  const s = fmtDate(a), e = fmtDate(b);
  return !b || s === e ? s : `${s} – ${e}`;
}

export function statusBadge(st) {
  return `<span class="badge badge-${esc(st)}">${esc(STATUS_LABELS[st] || st)}</span>`;
}

export function isHttpUrl(s) {
  try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; }
}

export function progressText(label, frac) {
  return `${label} ${Math.round(frac * 100)}%`;
}
