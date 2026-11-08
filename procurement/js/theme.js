/* โหมดสว่าง/มืด — โหลดเป็นสคริปต์ธรรมดาใน <head> ของทุกหน้า
   ต้องรันก่อนที่หน้าจะวาด ไม่งั้นจอจะแวบขาวหนึ่งเฟรมก่อนเปลี่ยนเป็นมืด
   (โมดูลใช้ไม่ได้ เพราะ type=module ถูกเลื่อนไปรันหลังวาดหน้าเสมอ) */
(function () {
  var KEY = 'proc.theme';
  var mq  = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() {
    try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; }
    catch (e) { return null; }   // เบราว์เซอร์บางเครื่องปิด localStorage ไว้ — ห้ามพังทั้งหน้า
  }
  function effective() { return stored() || (mq.matches ? 'dark' : 'light'); }
  function paint(mode) { document.documentElement.dataset.theme = mode; }

  function set(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    paint(mode);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: mode } }));
  }

  paint(effective());

  // ยังไม่เคยกดเลือกเอง = ตามเครื่อง ผู้ใช้สลับโหมดของ macOS แล้วหน้าเว็บต้องตามทันที
  mq.addEventListener('change', function () { if (!stored()) paint(effective()); });

  window.Theme = {
    get: effective,
    set: set,
    toggle: function () { var next = effective() === 'dark' ? 'light' : 'dark'; set(next); return next; },
  };
})();
