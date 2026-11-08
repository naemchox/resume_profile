/* ============================================================
   fontScale.js — ปุ่มขยาย/ย่อตัวอักษรฝั่งคนขับ (driver.html · helper.html)

   CSS ทั้งเว็บเป็น px จึงปรับขนาดตัวอักษรตั้งต้นอย่างเดียวไม่มีผล — ใช้ CSS zoom ทั้งหน้าแทน
   (เหมือนกด Ctrl + ในเบราว์เซอร์) ตัวอักษร ปุ่ม ช่องกรอก ใหญ่ขึ้นพร้อมกัน ความกว้างจอเท่าเดิม
   เนื้อหาจึงจัดเรียงใหม่ให้พอดีจอเอง
   ค่าที่เลือกจำไว้ในเครื่อง (ft-fontscale) · theme-init.js ใส่ให้ก่อนวาดหน้า กันกระพริบ
   ปุ่ม "กก" บนแถบหัว (ติดจอตลอด) → แผงล่างจอ ปุ่ม ก− / ก+ ใหญ่ นิ้วโป้งกดถึง
   ============================================================ */

const KEY = 'ft-fontscale';
export const LEVELS = [0.9, 1, 1.15, 1.3, 1.5];

export function fontScale(){
  try{ const z = parseFloat(localStorage.getItem(KEY)); return LEVELS.includes(z) ? z : 1; }catch{ return 1; }
}

function setScale(z){
  document.documentElement.style.zoom = z === 1 ? '' : String(z);
  try{ z === 1 ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, String(z)); }catch{}
  /* ช่องเซ็น / อื่น ๆ ที่วัดขนาดจาก resize — ให้วัดใหม่ */
  dispatchEvent(new Event('resize'));
}

const pct = (z) => `${Math.round(z * 100)}%`;

function openSheet(){
  if (document.querySelector('.fs-sheet')) return;
  const scrim = document.createElement('div');
  scrim.className = 'fs-scrim';
  scrim.innerHTML = `
<div class="fs-sheet" role="dialog" aria-label="ขนาดตัวอักษร">
  <div class="fs-title">ขนาดตัวอักษร</div>
  <div class="fs-row">
    <button type="button" class="fs-step" data-fs="-1" aria-label="ตัวอักษรเล็กลง"><span style="font-size:18px">ก</span>−</button>
    <div class="fs-now"><b data-fsnow></b><span>ขนาดตอนนี้</span></div>
    <button type="button" class="fs-step" data-fs="1" aria-label="ตัวอักษรใหญ่ขึ้น"><span style="font-size:26px">ก</span>+</button>
  </div>
  <div class="fs-dots" data-fsdots></div>
  <p class="fs-sample">ตัวอย่าง: ส่งของ 3 จุด · ถ่ายรูป 2 รูป</p>
  <div class="fs-foot">
    <button type="button" class="btn btn-ghost" data-fsreset>ขนาดปกติ</button>
    <button type="button" class="btn btn-accent" data-fsdone>เสร็จ</button>
  </div>
</div>`;
  const paint = () => {
    const z = fontScale(), i = LEVELS.indexOf(z);
    scrim.querySelector('[data-fsnow]').textContent = pct(z);
    scrim.querySelector('[data-fs="-1"]').disabled = i <= 0;
    scrim.querySelector('[data-fs="1"]').disabled = i >= LEVELS.length - 1;
    scrim.querySelector('[data-fsdots]').innerHTML = LEVELS.map((l, k) => `<i${k === i ? ' class="on"' : ''}></i>`).join('');
  };
  const shut = () => scrim.remove();
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim || e.target.closest('[data-fsdone]')) return shut();
    const step = e.target.closest('[data-fs]');
    if (step){
      const i = LEVELS.indexOf(fontScale()) + Number(step.dataset.fs);
      if (LEVELS[i]) setScale(LEVELS[i]);
      return paint();
    }
    if (e.target.closest('[data-fsreset]')){ setScale(1); paint(); }
  });
  document.body.appendChild(scrim);
  paint();
}

/** ใส่ปุ่ม "กก" ในแถบหัว (ต่อหน้าปุ่มสลับธีม) — เรียกหลัง shell() */
export function mountFontScale(){
  const theme = document.querySelector('.appbar-inner > .theme-btn');
  if (!theme || document.querySelector('.fs-btn')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fs-btn';
  b.title = 'ขยาย / ย่อตัวอักษร';
  b.setAttribute('aria-label', 'ขยาย / ย่อตัวอักษร');
  b.innerHTML = '<span style="font-size:12px">ก</span><span style="font-size:18px">ก</span>';
  b.onclick = openSheet;
  theme.before(b);
}
