import { t, apply, toggleLang, lang } from './i18n.js';
import { me, signOut, canOpen } from './auth.js';
import { openFile, downloadFile, fileUrl, fileLabel, fileKind } from './storage.js';

// โหมดสว่าง/มืด — ปกติ js/theme.js ถูกโหลดใน <head> ของหน้า (กันจอแวบขาว)
// แต่หน้าใหม่ที่ลืมใส่บรรทัดนั้นต้องใช้งานได้เหมือนกัน ไม่ใช่ปุ่มขึ้นแล้วกดไม่ติด
// จึงดึงมาเองตรงนี้เป็นตาข่ายรับ — ทุกหน้าของแอปนำเข้าไฟล์นี้อยู่แล้ว
if (!window.Theme) await import('./theme.js');

// ---------------------------------------------------------------------------
// สร้าง element แบบสั้น: el('div', {class:'x'}, 'ข้อความ')
// ---------------------------------------------------------------------------
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k in n && k !== 'list') n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------------------
// แปล error จากฐานข้อมูลให้เป็นภาษาคน
// ข้อความที่เราเขียนเองใน RPC เป็นภาษาไทยอยู่แล้ว — ส่งต่อตรงๆ
// ที่เหลือคือข้อความมาตรฐานของ Postgres/RLS ต้องแปลงเอง
// ---------------------------------------------------------------------------
const DB_ERRORS = [
  [/row-level security/i,        'msg.noPermission'],
  [/permission denied/i,         'msg.noPermission'],
  [/JWT|not authenticated/i,     'msg.noPermission'],
  [/Failed to fetch|NetworkError/i, 'msg.networkError'],
];

export function errText(err) {
  const raw = err?.message ?? err?.error_description ?? String(err ?? '');
  for (const [re, key] of DB_ERRORS) if (re.test(raw)) return t(key);
  if (/duplicate key/i.test(raw)) {
    return lang === 'en' ? 'This record already exists.' : 'มีรายการนี้อยู่แล้ว';
  }
  if (/violates foreign key/i.test(raw)) {
    return lang === 'en'
      ? 'This record is still referenced elsewhere.'
      : 'ยังมีรายการอื่นอ้างถึงข้อมูลนี้อยู่ ลบไม่ได้';
  }
  return raw;
}

// ---------------------------------------------------------------------------
// แจ้งเตือนมุมจอ
// ---------------------------------------------------------------------------
export function toast(msg, kind = 'ok') {
  let box = $('#toasts');
  if (!box) { box = el('div', { id: 'toasts' }); document.body.append(box); }
  const n = el('div', { class: `toast toast-${kind}` }, msg);
  box.append(n);
  setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 300); }, 4200);
}

export const ok   = (m) => toast(m, 'ok');
export const warn = (m) => toast(m, 'warn');
export const fail = (e) => toast(errText(e), 'err');

// ---------------------------------------------------------------------------
// กล่องโต้ตอบ
// ---------------------------------------------------------------------------
export function modal({ title, body, actions = [], wide = false, cancelLabel = null }) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); resolve(v); };
    const foot = el('footer', {},
      ...actions.map((a) =>
        el('button', { class: a.class ?? 'btn', onclick: () => close(a.value) }, a.label)),
      el('button', { class: 'btn ghost', onclick: () => close(null) },
        cancelLabel ?? t('common.cancel')));
    const box = el('div', { class: 'modal' + (wide ? ' wide' : '') },
      el('header', {}, title), el('section', {}, body), foot);
    const back = el('div', { class: 'backdrop', onclick: (e) => { if (e.target === back) close(null); } }, box);
    document.body.append(back);
    setTimeout(() => box.querySelector('input,textarea,select,button')?.focus(), 30);
  });
}

export const confirmBox = (title, label = t('common.confirm')) =>
  modal({ title, body: '', actions: [{ label, class: 'btn danger', value: true }] });

// ขอเหตุผลแบบบังคับกรอก — ใช้ตอนตีกลับ / เกินงบ / ไม่เลือกเจ้าถูกสุด
export async function askReason(title, hint) {
  const ta = el('textarea', { rows: 4, required: true, placeholder: hint ?? '' });
  const err = el('p', { class: 'err-line hidden' }, t('common.required'));
  const res = await modal({
    title,
    body: el('div', {}, ta, err),
    actions: [{
      label: t('common.confirm'), class: 'btn primary',
      value: () => {
        const v = ta.value.trim();
        if (!v) { err.classList.remove('hidden'); ta.focus(); return undefined; }
        return v;
      },
    }],
  });
  if (typeof res !== 'function') return null;
  const v = res();
  return v === undefined ? askReason(title, hint) : v;
}

// ---------------------------------------------------------------------------
// ป้ายสถานะ
// ---------------------------------------------------------------------------
const STATUS_TONE = {
  draft: 'grey', sow_locked: 'grey', rfq_issued: 'blue', quoting: 'blue',
  evaluated: 'blue', pending_approval: 'amber', approved: 'green',
  rejected: 'red', po_issued: 'green', closed: 'grey', cancelled: 'grey',
  issued: 'blue', partially_received: 'amber', received: 'green',
  invoiced: 'blue', paid: 'green',
  matched: 'green', mismatched: 'red', pending: 'amber',
};

export const badge = (value, prefix) =>
  el('span', { class: `badge ${STATUS_TONE[value] ?? 'grey'}` }, t(`${prefix}.${value}`));

// ---------------------------------------------------------------------------
// โครงหน้า — เมนูขึ้นตามตำแหน่งที่มี
// ---------------------------------------------------------------------------
// ลำดับเมนู + ชื่อที่ใช้เรียก — ส่วน "ใครเห็นเมนูไหน" ไม่ได้อยู่ตรงนี้
// แต่อ่านจาก PAGE_ROLES ใน js/auth.js ตัวเดียวกับด่านกันหน้า
// (เมนูโผล่ = เข้าได้จริง เสมอ ไม่มีทางเพี้ยนกันเอง)
const NAV = [
  ['home.html',    'nav.home'],
  ['pr.html',      'nav.pr'],
  ['quotes.html',  'nav.quotes'],
  ['approve.html', 'nav.approve'],
  ['po.html',      'nav.po'],
  ['gr.html',      'nav.gr'],
  ['invoice.html', 'nav.invoice'],
  ['pay.html',     'nav.pay'],
  ['reports.html', 'nav.reports'],
  ['admin.html',   'nav.admin'],
];

// ---------------------------------------------------------------------------
// ปุ่มสลับโหมดสว่าง/มืด — สถานะจริงเก็บใน js/theme.js (โหลดใน <head> ทุกหน้า)
// ไอคอนทั้งสองอันอยู่ในปุ่มพร้อมกัน แล้วให้ CSS เลือกโชว์ตาม data-theme
// จะได้ไม่ต้องวาดปุ่มใหม่ตอนสลับ และปุ่มไม่ขยับตอนไอคอนเปลี่ยน
// ---------------------------------------------------------------------------
const THEME_ICONS = `
  <svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
  </svg>
  <svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2"/>
    <path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>
  </svg>`;

export function themeToggle(cls = 'btn ghost small theme-toggle') {
  const label = () => t(window.Theme?.get() === 'dark' ? 'theme.toLight' : 'theme.toDark');
  const btn = el('button', {
    type: 'button', class: cls, html: THEME_ICONS,
    title: label(), 'aria-label': label(),
    onclick: () => { window.Theme?.toggle(); },
  });
  // ปุ่มอันอื่นในหน้าเดียวกัน (หรือระบบสลับโหมดของเครื่อง) เปลี่ยนโหมดได้ ต้องอัปเดตคำอธิบายตาม
  window.addEventListener('themechange', () => { btn.title = label(); btn.setAttribute('aria-label', label()); });
  return btn;
}

export function shell(activeHref) {
  const nav = el('nav', {},
    ...NAV.filter(([href]) => canOpen(href))
      .map(([href, key]) =>
        el('a', { href, class: href === activeHref ? 'active' : '' }, t(key))));

  const header = el('header', { class: 'topbar' },
    el('a', { class: 'brand', href: 'home.html' }, t('app.name')),
    nav,
    // รวมของฝั่งผู้ใช้ไว้เป็นก้อนเดียว จะได้จัดให้ลงมาชิดเส้นล่างของแถบได้ทีเดียว
    el('div', { class: 'user-group' },
      themeToggle('btn ghost small theme-toggle'),
      el('button', { class: 'btn ghost small lang-toggle',
                     onclick: () => { toggleLang(); location.reload(); } },
        lang === 'th' ? 'EN' : 'ไทย'),
      (() => {
        const name  = (lang === 'en' ? (me?.full_name_en || me?.full_name_th) : me?.full_name_th) || '';
        const roles = (me?.roles ?? []).map((r) => t(`role.${r}`)).join(' · ');
        return el('span', { class: 'who', title: roles ? `${name} — ${roles}` : name },
          el('b', {}, name), el('small', {}, roles));
      })(),
      el('button', { class: 'btn ghost small', onclick: signOut }, t('nav.signOut'))));

  document.body.prepend(header);
  apply();

  // เมนูอยู่แถวล่างเต็มความกว้างเสมอ เหลือแค่กรณีจอแคบจนยังล้น — เลื่อนหน้าที่เปิดอยู่มาให้เห็นเต็มอัน
  nav.querySelector('a.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });

  return header;
}

export function pageTitle(key, ...extra) {
  document.title = `${t(key)} — ${t('app.name')}`;
  return el('div', { class: 'page-head' }, el('h1', {}, t(key)), el('div', { class: 'spacer' }), ...extra);
}

export const spinner = () => el('div', { class: 'spinner' }, t('common.loading'));
export const emptyRow = (cols) =>
  el('tr', {}, el('td', { colspan: cols, class: 'empty' }, t('common.empty')));

// ---------------------------------------------------------------------------
// ตาราง
// ---------------------------------------------------------------------------
export function table(headers, rows) {
  return el('div', { class: 'table-wrap' },
    el('table', {},
      el('thead', {}, el('tr', {}, ...headers.map((h) =>
        el('th', { class: h.align ? `ta-${h.align}` : '' }, typeof h === 'string' ? h : h.label)))),
      el('tbody', {}, ...(rows.length ? rows : [emptyRow(headers.length)]))));
}

// ---------------------------------------------------------------------------
// ส่งออก CSV (ใส่ BOM ให้ Excel ไทยเปิดแล้วไม่เป็นตัวยึกยือ)
// ---------------------------------------------------------------------------
export function downloadCsv(filename, header, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const body = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
}

// ---------------------------------------------------------------------------
// กล่องไฟล์แนบของหน้ารายละเอียด — ชื่อไฟล์ + ปุ่มเปิด/ดาวน์โหลด + ตัวอย่างในหน้าเดียวกัน
//
// อยู่ที่ไฟล์นี้ ไม่ใช่ storage.js เพราะ storage.js ต้องไม่รู้จักหน้าตาของแอป
// (ui.js กับ form.js เรียก storage.js ได้ แต่ storage.js ห้ามเรียกกลับ — จะวนลูป)
//
// ทำไมต้องเห็นตัวอย่างในหน้าเดียวกัน ไม่ใช่แค่ปุ่มเปิดแท็บใหม่:
// คนคีย์บิลต้องอ่านเลขจากบิลจริงเทียบกับที่คีย์ไว้ทีละช่อง ถ้าต้องสลับแท็บไปมา
// จะคีย์ผิดง่าย และตอนตรวจย้อนหลังก็ไม่รู้ว่าตัวเลขในระบบมาจากกระดาษใบไหน
//
// opts: { title, missing, action, open }
//   title   คีย์ข้อความหัวกล่อง
//   missing คีย์ข้อความตอนยังไม่มีไฟล์แนบ
//   action  ปุ่มมุมขวาบน (เช่น "แนบไฟล์" / "เปลี่ยนไฟล์") ผู้เรียกสร้างเอง
//   open    เปิดตัวอย่างทันทีที่เข้าหน้า (ค่าเริ่มต้น: เปิด)
// ---------------------------------------------------------------------------
export function attachCard(path, opts = {}) {
  const { title = 'common.attachment', missing = 'file.missing',
          action = null, open = true } = opts;

  const card = el('div', { class: 'card' },
    el('div', { class: 'row' },
      el('h2', { style: 'margin:0' }, t(title)),
      el('div', { class: 'spacer' }),
      action));

  if (!path) {
    card.append(el('div', { class: 'notice warn', style: 'margin:.7rem 0 0' }, t(missing)));
    return card;
  }

  const kind = fileKind(path);
  const view = el('div', { class: 'file-view' + (open && kind !== 'other' ? '' : ' hidden') });
  let loaded = false;

  const load = async () => {
    if (loaded) return;
    loaded = true;
    view.textContent = '';
    view.append(spinner());
    try {
      // อายุลิงก์ 30 นาที — นานพอให้คีย์บิลทั้งใบจบโดยตัวอย่างไม่ดับกลางคัน
      const url = await fileUrl(path, 1800);
      view.textContent = '';
      view.append(kind === 'pdf'
        ? el('iframe', { class: 'file-preview', src: url, title: fileLabel(path) })
        : el('img', { class: 'file-preview', src: url, alt: fileLabel(path) }));
    } catch (e) {
      loaded = false;                       // ลิงก์ล้มเหลว ต้องกดดูใหม่ได้
      view.textContent = '';
      view.append(el('div', { class: 'notice err' }, errText(e)));
    }
  };

  const toggle = el('button', { class: 'btn small' });
  const setShown = (on) => {
    view.classList.toggle('hidden', !on);
    toggle.textContent = t(on ? 'file.hidePreview' : 'file.showPreview');
    if (on) load();
  };
  toggle.addEventListener('click', () => setShown(view.classList.contains('hidden')));

  card.append(el('div', { class: 'attach-head' },
    el('span', { class: 'clip' }, '\u{1F4CE}'),
    el('span', { class: 'attach-name', title: fileLabel(path) }, fileLabel(path)),
    el('button', { class: 'btn small',
      onclick: () => openFile(path).catch(fail) }, t('file.view')),
    el('button', { class: 'btn small',
      onclick: () => downloadFile(path).catch(fail) }, t('file.download')),
    kind === 'other' ? null : toggle));

  if (kind === 'other') {
    card.append(el('div', { class: 'notice info', style: 'margin:.7rem 0 0' }, t('file.noPreview')));
  } else {
    setShown(open);
    card.append(view);
  }
  return card;
}
