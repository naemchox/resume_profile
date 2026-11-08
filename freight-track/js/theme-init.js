/* ธีมสว่าง / มืด — โหลดแบบ blocking ใน <head> ของทุกหน้า เพื่อใส่ธีมก่อนวาดหน้า (กันจอกะพริบขาว)
   ยังไม่เคยเลือก = ตามระบบ (และเปลี่ยนตามเมื่อระบบเปลี่ยน) · กดปุ่ม [data-theme-toggle] = จำค่าที่เลือกไว้ในเครื่อง
   ใช้ key เดียวกับหน้า Dashboard (index.html) จึงเลือกที่หน้าไหนก็มีผลทุกหน้า */
/* เปลี่ยนชื่อระบบ CST → FT (4 ต.ค. 2569) — ย้ายข้อมูลในเครื่องจากชื่อเก่า "cst." / "cst-" มาชื่อใหม่ครั้งเดียว
   ล็อกอินที่ค้างอยู่ งานของคนขับที่ยังไม่ได้ส่ง (กล่องขาออก) และธีมที่เลือกไว้จึงไม่หาย · ชื่อใหม่มีค่าอยู่แล้ว = ไม่ทับ */
(() => {
  const OLD = 'c' + 'st';                     /* เขียนแยกไว้ กันการค้นหา-แทนที่ชื่อระบบรอบหน้าเปลี่ยนตัวนี้ไปด้วย */
  for (const name of ['localStorage', 'sessionStorage']){
    try{
      const st = window[name], keys = [];
      for (let i = 0; i < st.length; i++){ const k = st.key(i); if (k && (k.startsWith(OLD + '.') || k.startsWith(OLD + '-'))) keys.push(k); }
      keys.forEach(k => { const nk = 'ft' + k.slice(3); if (st.getItem(nk) === null) st.setItem(nk, st.getItem(k)); st.removeItem(k); });
    }catch{}
  }
})();

(() => {
  const KEY = 'ft-theme', root = document.documentElement;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const saved = () => { try { const t = localStorage.getItem(KEY); return t === 'dark' || t === 'light' ? t : ''; } catch { return ''; } };
  const apply = () => { root.dataset.theme = saved() || (mq.matches ? 'dark' : 'light'); };
  apply();
  mq.addEventListener('change', apply);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch {}
    root.dataset.theme = next;
  });
})();

/* ขนาดตัวอักษรฝั่งคนขับ (js/fontScale.js) — ใส่ก่อนวาดหน้า หน้าจึงไม่กระพริบจากเล็กเป็นใหญ่ */
(() => {
  if (!/\/(driver|helper|driver-copy)\.html$/.test(location.pathname)) return;
  try{
    const z = parseFloat(localStorage.getItem('ft-fontscale'));
    if ([0.9, 1.15, 1.3, 1.5].includes(z)) document.documentElement.style.zoom = String(z);
  }catch{}
})();
