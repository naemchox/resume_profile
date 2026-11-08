import th from '../i18n/th.js';
import en from '../i18n/en.js';
import { DEFAULT_LANG } from './supabase.js';

const DICTS = { th, en };
const KEY = 'proc.lang';

export let lang = localStorage.getItem(KEY) || DEFAULT_LANG || 'th';

export function t(key, params) {
  let s = DICTS[lang]?.[key] ?? DICTS.th[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// เลือกคอลัมน์ตามภาษา เช่น pick(row, 'name') -> row.name_th หรือ row.name_en
export const pick = (row, base) =>
  (lang === 'en' ? row?.[`${base}_en`] : null) || row?.[`${base}_th`] || '';

export function setLang(next) {
  lang = next;
  localStorage.setItem(KEY, next);
  document.documentElement.lang = next;
  apply();
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: next } }));
}

export function toggleLang() { setLang(lang === 'th' ? 'en' : 'th'); }

// เติมข้อความให้ทุก element ที่มี data-i18n / data-i18n-ph / data-i18n-title
export function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.documentElement.lang = lang;
}

// วันที่ของเครื่องผู้ใช้ในรูป YYYY-MM-DD สำหรับ <input type="date">
// ห้ามใช้ toISOString() เพราะมันคิดเป็นเวลา UTC — ไทยเร็วกว่า 7 ชม. ช่วงเที่ยงคืนถึงเจ็ดโมงเช้า
// จึงได้วันที่ย้อนหลังไปหนึ่งวัน (เคยเจอ: เปิดกล่องบันทึกส่งมอบตอนตี 1 แล้วขึ้นวันของเมื่อวาน)
export const isoDate = (d = new Date()) => {
  const x = new Date(d);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())}`;
};

export const fmtDate = (d) => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) : d;
  if (Number.isNaN(dt.getTime())) return '';
  return lang === 'en'
    ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return fmtDate(dt) + ' ' + dt.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'th-TH',
    { hour: '2-digit', minute: '2-digit' });
};
