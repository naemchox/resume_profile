/* ธีมสว่าง / มืด ของหน้าแบบฝึก — อ่านค่าที่เลือกไว้ในแอปจริงอย่างเดียว ไม่เขียนอะไรลงเครื่อง
   (ไม่ใช้ js/theme-init.js เพราะตัวนั้นย้าย/เขียนข้อมูลใน localStorage ของระบบจริง) */
(() => {
  const root = document.documentElement;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const saved = () => { try{ const t = localStorage.getItem('ft-theme'); return t === 'dark' || t === 'light' ? t : ''; }catch{ return ''; } };
  const apply = () => { root.dataset.theme = saved() || (mq.matches ? 'dark' : 'light'); };
  apply();
  mq.addEventListener('change', apply);
})();
