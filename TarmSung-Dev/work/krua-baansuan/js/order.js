/* =============================================================================
   order.js — ใบออเดอร์ของครัวบ้านสวน (ของหน้านี้หน้าเดียว)

   ทำไมแยกไฟล์: js/main.js คือกลไกกลางที่ทุกเดโมใช้ร่วมกัน (reveal, nav, ตัวนับ)
   แก้ที่นั่น = แก้ทุกหน้าพร้อมกัน ของที่เป็นของหน้าเดียวจึงห้ามไปปนในไฟล์นั้น

   ทำไมต้องมี: เดโมของเราทุกหน้าเป็นกระดาษที่เลื่อนดูอย่างเดียว ปุ่มมีแค่โทรกับไลน์
   ต่างจาก velvet-leaf ที่กดเก็บของใส่ลิสต์ได้จริง — 21/8/26 jek ชี้ว่านั่นคือเหตุผลข้อ
   ใหญ่ที่สุดที่หน้านั้นไม่ถูกมองว่าเป็นหน้าเดียวกับหน้าอื่น ทั้งที่ฮีโร่ก็เป็นสูตรเดียวกัน

   กฎของไฟล์นี้
   - ราคาทุกตัวอ่านจาก data-price บน DOM ซึ่งมาจากราคาที่พิมพ์อยู่บนหน้าอยู่แล้ว
     สคริปต์แค่บวก ไม่ได้ถือตารางราคาชุดที่สองไว้เอง (ตารางที่สองคือที่ที่ราคาจะเพี้ยน)
   - ไม่มี JS = ปุ่มไม่โผล่ (CSS ซ่อนไว้ใต้ .js) หน้ายังอ่านได้ครบเหมือนเดิม
   - เก็บลง localStorage เพราะคนเลือกจานแล้วเผลอรีเฟรชคือเรื่องปกติ ถ้าหายคือเริ่มใหม่ทั้งหมด
   ========================================================================== */
(() => {
  const KEY = "baansuan-order";
  const slip = document.querySelector("[data-slip]");
  if (!slip) return;

  const listEl  = slip.querySelector("[data-slip-list]");
  const emptyEl = slip.querySelector("[data-slip-empty]");
  const totalEl = slip.querySelector("[data-slip-total]");
  const lineEl  = slip.querySelector("[data-slip-line]");
  const jumpEl  = document.querySelector("[data-slip-jump]");
  const countEl = document.querySelector("[data-slip-count]");
  const miniEl  = document.querySelector("[data-slip-mini]");
  const LINE_URL = lineEl?.getAttribute("href") || "";

  /* Map<ชื่อจาน, {price, n}> — ชื่อจานเป็นคีย์เพราะมันคือสิ่งที่ลูกค้าพิมพ์บอกครัวจริงๆ */
  let cart = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(saved)) for (const it of saved) {
      if (it && typeof it.name === "string" && Number.isFinite(+it.price) && +it.n > 0) {
        cart.set(it.name, { price: +it.price, n: Math.min(99, Math.floor(+it.n)) });
      }
    }
  } catch { /* storage ปิดอยู่หรือข้อมูลเสีย — เริ่มจากตะกร้าว่าง ไม่ใช่หน้าพัง */ }

  const baht = (n) => "฿" + n.toLocaleString("th-TH");
  const sum = () => [...cart.values()].reduce((t, it) => t + it.price * it.n, 0);
  const items = () => [...cart.values()].reduce((t, it) => t + it.n, 0);

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...cart].map(([name, it]) => ({ name, ...it }))));
    } catch { /* เขียนไม่ได้ก็ยังใช้งานต่อได้ในหน้านี้ ไม่ต้องบอกผู้ใช้ */ }
  };

  /* ข้อความที่จะไปโผล่ในไลน์ — เขียนแบบที่คนสั่งอาหารพิมพ์เอง ไม่ใช่ JSON */
  const orderText = () => {
    if (!cart.size) return "";
    const lines = [...cart].map(([name, it]) => `• ${name} x${it.n} — ${baht(it.price * it.n)}`);
    return `สั่งจากเว็บครัวบ้านสวนครับ/ค่ะ\n${lines.join("\n")}\nรวม ${baht(sum())}`;
  };

  const render = () => {
    listEl.textContent = "";
    for (const [name, it] of cart) {
      const li = document.createElement("li");

      const label = document.createElement("span");
      label.textContent = name;

      const qty = document.createElement("span");
      qty.className = "slip-qty";
      for (const [step, sign, aria] of [[-1, "−", "ลด"], [1, "+", "เพิ่ม"]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "qty-btn";
        b.textContent = sign;
        b.setAttribute("aria-label", `${aria}จำนวน ${name}`);
        b.addEventListener("click", () => bump(name, step));
        if (step === 1) qty.append(document.createTextNode(String(it.n)));
        qty.append(b);
      }
      /* ลำดับใน DOM: [−] จำนวน [+] — append ข้างบนใส่ตัวเลขก่อนปุ่มบวกพอดี */

      const price = document.createElement("b");
      price.textContent = baht(it.price * it.n);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "slip-x";
      del.textContent = "ลบ";
      del.setAttribute("aria-label", `เอา ${name} ออกจากออเดอร์`);
      del.addEventListener("click", () => bump(name, -it.n));

      li.append(label, qty, price, del);
      listEl.append(li);
    }

    const has = cart.size > 0;
    emptyEl.hidden = has;
    totalEl.textContent = baht(sum());
    if (countEl) countEl.textContent = String(items());
    if (miniEl) miniEl.textContent = baht(sum());
    if (jumpEl) jumpEl.hidden = !has;

    if (lineEl && LINE_URL) {
      /* ไลน์รับข้อความตั้งต้นผ่าน ?text= — ถ้ายังไม่ได้เลือกอะไร ให้เป็นลิงก์ทักธรรมดา */
      lineEl.href = has ? `${LINE_URL}?text=${encodeURIComponent(orderText())}` : LINE_URL;
    }

    for (const btn of document.querySelectorAll(".pick")) {
      const n = cart.get(btn.dataset.dish)?.n || 0;
      btn.dataset.on = n ? "1" : "0";
      btn.setAttribute("aria-pressed", n ? "true" : "false");
      btn.lastChild.textContent = n ? ` เก็บแล้ว ${n}` : " เก็บ";
    }
  };

  const bump = (name, step, price) => {
    const cur = cart.get(name);
    const next = (cur?.n || 0) + step;
    if (next <= 0) cart.delete(name);
    else cart.set(name, { price: cur?.price ?? price, n: Math.min(99, next) });
    save();
    render();
  };

  for (const btn of document.querySelectorAll(".pick")) {
    btn.addEventListener("click", () => bump(btn.dataset.dish, 1, +btn.dataset.price));
  }

  render();
})();
