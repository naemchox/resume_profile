// ช่องกรอกวันที่แบบ วว/ดด/ปปปป (พ.ศ.) — ใช้ร่วมกันทุกหน้า
//
// ย้ายออกมาจาก pr.html (ข้อกำหนดงาน) เพราะหน้ารับของต้องใช้ช่องหน้าตาเดียวกัน
// ผูกสองทาง: พิมพ์ในช่อง → ปฏิทินเลื่อนตาม / เลือกจากปฏิทิน → ข้อความในช่องเปลี่ยนตาม
//
// หมายเหตุ: pr.html ยังมีสำเนาของตัวเองอยู่ ค่อยย้ายมาใช้ไฟล์นี้เมื่อไม่มีใครค้างงานในไฟล์นั้น
import { t } from './i18n.js';
import { el } from './ui.js';

const BE_OFFSET = 543;
const pad2 = (n) => String(n).padStart(2, '0');

export const toBeText = (dt) =>
  `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear() + BE_OFFSET}`;
export const toIso = (dt) =>
  `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

// เติมทีละส่วนได้ ยังพิมพ์ไม่ครบก็เดาจากเดือน/ปีปัจจุบัน
//   26           → 26 ของเดือนนี้ ปีนี้
//   26/12        → 26 ธ.ค. ปีนี้
//   26/12/2569   → ครบรูปแบบ (รับทั้ง พ.ศ. และ ค.ศ.)
export const parseBeDate = (str) => {
  const parts = String(str ?? '').split('/');
  const now = new Date();
  const d = Number(parts[0]);
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;

  const mRaw = (parts[1] ?? '').trim();
  const m = mRaw === '' ? now.getMonth() + 1 : Number(mRaw);
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;

  const yRaw = (parts[2] ?? '').trim();
  // ปียังพิมพ์ไม่ครบ 4 หลัก = ยังไม่เลือกปี ใช้ปีปัจจุบันไปก่อน
  let y = yRaw.length === 4 ? Number(yRaw) : now.getFullYear();
  if (!Number.isInteger(y)) return null;
  if (y > 2400) y -= BE_OFFSET;

  const dt = new Date(y, m - 1, d);
  // กันวันที่ไม่มีจริง เช่น 31/02 (JS จะเลื่อนไปเดือนถัดไปเงียบๆ)
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
};

// แปลงวันที่จากฐานข้อมูล (YYYY-MM-DD) เป็นข้อความในช่อง
export const isoToBe = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return (y && m && d) ? toBeText(new Date(y, m - 1, d)) : '';
};

// ใส่ / ให้เองระหว่างพิมพ์ — ผู้ใช้เคาะแต่ตัวเลข
const maskBeDate = (raw) => {
  const g = String(raw).replace(/\D/g, '').slice(0, 8);
  return [g.slice(0, 2), g.slice(2, 4), g.slice(4, 8)].filter(Boolean).join('/');
};

// ไอคอนปฏิทินแบบเส้น (แนว Lucide) วาดด้วย SVG — คมทุกจอ และย้อมสีตามแบรนด์ได้
// อิโมจิ 📅 ใช้ไม่ได้ผล เพราะแต่ละเครื่องเรนเดอร์คนละหน้าตา และย้อมสีไม่ได้
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
  + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/>'
  + '<path d="M16 2.5v4M8 2.5v4M3 10h18"/>'
  + '<path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>';

export function dateField(initial, disabled) {
  const input = el('input', {
    type: 'text', class: 'date-input', inputmode: 'numeric', maxLength: 10,
    placeholder: t('sow.dateFormat'), value: initial ?? '', disabled: !!disabled,
  });
  // ช่องปฏิทินจริงซ้อนทับช่องข้อความแบบโปร่งใส เพื่อให้ปฏิทินเด้งตรงตำแหน่งช่องพอดี
  // (ถ้าย่อเหลือ 1px ปฏิทินจะไปโผล่มุมจอ)
  const native = el('input', { type: 'date', class: 'date-native', tabIndex: -1 });
  const btnHolder = el('span', { class: 'btn-holder' });

  const syncNative = () => {
    const dt = parseBeDate(input.value);
    native.value = dt ? toIso(dt) : '';
  };
  syncNative();

  input.addEventListener('input', () => {
    // ใส่ / ให้เฉพาะตอนพิมพ์ต่อท้าย ถ้าแก้กลางข้อความปล่อยตามที่พิมพ์ ไม่ให้เคอร์เซอร์กระโดด
    const atEnd = input.selectionStart === input.value.length;
    if (atEnd) {
      const masked = maskBeDate(input.value);
      if (masked !== input.value) {
        input.value = masked;
        input.setSelectionRange(masked.length, masked.length);
      }
    }
    syncNative();
    input.classList.toggle('bad', input.value.trim() !== '' && !parseBeDate(input.value));
  });

  // เลือกจากปฏิทิน → เขียนกลับเป็น วว/ดด/ปปปป
  native.addEventListener('change', () => {
    if (!native.value) return;
    const [y, m, d] = native.value.split('-').map(Number);
    input.value = toBeText(new Date(y, m - 1, d));
    input.classList.remove('bad');
    input.dispatchEvent(new Event('change'));
  });

  // เบราว์เซอร์บางตัวเปิดปฏิทินด้วยสคริปต์ไม่ได้ (ต้องกดที่ตัวช่องเอง)
  // กรณีนั้นให้สลับมาโชว์ช่องปฏิทินมาตรฐานทับไว้ ผู้ใช้จะได้ยังเลือกวันได้ ไม่ใช่กดแล้วเงียบ
  const wrap = el('div', { class: 'field-wrap date-field' }, btnHolder, input, native);
  const openPicker = () => {
    if (disabled) return;
    if (typeof native.showPicker === 'function') {
      try { native.showPicker(); return; } catch { /* ตกไปใช้ทางสำรอง */ }
    }
    wrap.classList.add('picker-fallback');
    native.focus();
  };
  native.addEventListener('blur', () => wrap.classList.remove('picker-fallback'));

  btnHolder.append(el('button', {
    type: 'button', class: 'in-field-btn', title: t('sow.insertDate'),
    'aria-label': t('sow.insertDate'), html: CAL_ICON, disabled: !!disabled,
    onclick: (e) => { e.preventDefault(); openPicker(); },
  }));

  // กดที่ช่อง = เปิดปฏิทินให้เลย ส่วนการพิมพ์ยังทำได้ปกติ
  input.addEventListener('click', openPicker);

  return { el: wrap, input };
}
