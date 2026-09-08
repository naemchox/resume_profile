/* =============================================================================
   quote.js — ตัวคิดราคาต่อหัวของเดอะ เทอเรส (ของหน้านี้หน้าเดียว)

   แยกจาก js/main.js เพราะไฟล์นั้นเป็นกลไกกลางที่ทุกเดโมใช้ร่วมกัน
   แก้ที่นั่น = แก้ทุกหน้าพร้อมกัน (กฎเดียวกับ work/krua-baansuan/js/order.js)

   ทำไมต้องมี: การ์ดแพ็กเกจบอก "หัวละเท่าไหร่" แต่คนจัดงานคิดเป็น "ทั้งงานเท่าไหร่"
   เสมอ แล้วต้องหยิบเครื่องคิดเลขเอง — ซึ่งเป็นจังหวะที่คนออกจากหน้าเว็บไปหาที่อื่น

   ราคาต่อท่านอ่านจาก data-rate บน DOM ซึ่งเป็นตัวเลขเดียวกับที่พิมพ์อยู่บนการ์ด
   ข้างบนของหน้า สคริปต์แค่คูณ ไม่ได้ถือตารางราคาชุดที่สองไว้เอง
   ========================================================================== */
(() => {
  const root = document.querySelector("[data-calc]");
  if (!root) return;

  const range   = root.querySelector("[data-range]");
  const outN    = root.querySelector("[data-guests]");
  const detail  = root.querySelector("[data-detail]");
  const totalEl = root.querySelector("[data-total]");
  const noteEl  = root.querySelector("[data-note]");
  const BASE_NOTE = noteEl.textContent;

  const baht = (n) => "฿" + n.toLocaleString("th-TH");

  const render = () => {
    const kind = root.querySelector('input[name="kind"]:checked');
    const rate = +kind.dataset.rate;
    const min  = +kind.dataset.min;
    const picked = +range.value;
    /* ต่ำกว่าขั้นต่ำของแพ็กเกจ = ยังคิดที่ขั้นต่ำ ไม่ใช่คิดตามจำนวนจริง — เขียนให้เห็น
       ตรงๆ ดีกว่าโชว์ตัวเลขที่คนไปคุยแล้วเจอราคาสูงกว่าที่เห็นบนเว็บ */
    const billed = Math.max(picked, min);

    outN.textContent = picked.toLocaleString("th-TH");
    detail.textContent = `${baht(rate)} × ${billed.toLocaleString("th-TH")} ท่าน`;
    totalEl.textContent = baht(rate * billed);
    noteEl.textContent = billed > picked
      ? `แพ็กเกจนี้เริ่มต้นที่ ${min} ท่าน — จำนวนน้อยกว่านั้นยังคิดเท่า ${min} ท่าน`
      : BASE_NOTE;
  };

  range.addEventListener("input", render);
  for (const r of root.querySelectorAll('input[name="kind"]')) r.addEventListener("change", render);
  render();
})();
