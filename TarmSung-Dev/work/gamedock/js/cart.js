/* หน้าตะกร้า — วาดรายการจาก Store แล้วสร้างออเดอร์จริง
   ทุกอย่างในหน้านี้อ่าน/เขียนผ่าน Store เท่านั้น เพื่อให้ตะกร้าที่หัวเว็บ สต็อกใน
   หลังบ้าน และประวัติในหน้าบัญชี เป็นข้อมูลชุดเดียวกันเสมอ */
(() => {
  'use strict';
  if (!window.Store) return;

  const $ = (s) => document.querySelector(s);
  const linesBox = $('#lines');

  /* ---- คิวอาร์ตัวอย่าง: ลายคงที่ที่คำนวณจากตัวเลขในโค้ด ไม่ใช่รูปที่โหลดจากข้างนอก ---- */
  (function drawQR() {
    const svg = document.querySelector('#qr svg');
    if (!svg) return;
    const N = 33;
    let out = '<rect width="33" height="33" fill="#fff"/>';
    const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#000"/>`
      + `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/>`
      + `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#000"/>`;
    out += finder(0, 0) + finder(26, 0) + finder(0, 26);
    let seed = 20260822;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const inFinder = (x < 9 && y < 9) || (x > 23 && y < 9) || (x < 9 && y > 23);
        if (inFinder) continue;
        if (rnd() > 0.52) out += `<rect x="${x}" y="${y}" width="1" height="1" fill="#000"/>`;
      }
    }
    svg.innerHTML = out;
  })();

  /* ---- วาดรายการ ---- */
  function render() {
    const lines = Store.cartLines();
    $('[data-line-count]').textContent = lines.length;

    if (!lines.length) {
      linesBox.innerHTML = `<div class="empty">
        <svg class="icon" aria-hidden="true"><use href="#i-cart"/></svg>
        <p>ยังไม่มีสินค้าในตะกร้า</p>
        <a class="btn btn--primary" href="index.html#results" style="margin-top:var(--s4)">เลือกซื้อสินค้า</a>
      </div>`;
      $('#checkout').hidden = true;
    } else {
      $('#checkout').hidden = false;
      linesBox.innerHTML = lines.map((l) => `
        <div class="line" data-sku="${l.sku}">
          <div class="line__art art art--${l.product.art}"><img class="art__photo" src="img/g-${l.product.art}.webp" alt="" loading="lazy" decoding="async"></div>
          <div>
            <div class="line__name">${l.product.name}</div>
            <div class="line__sku">รหัส ${l.sku} · เหลือในคลัง ${l.product.stock}</div>
            <div class="line__ctl">
              <span class="qty qty--sm">
                <button type="button" data-step="-1" aria-label="ลดจำนวน">−</button>
                <input type="number" value="${l.qty}" min="1" max="${l.product.stock}" inputmode="numeric" aria-label="จำนวนของ ${l.product.name}">
                <button type="button" data-step="1" aria-label="เพิ่มจำนวน">+</button>
              </span>
              <span style="font-size:var(--t-xs);color:var(--text-mute)">${Store.baht(l.product.price)} / ชิ้น</span>
              <button type="button" class="line__del" data-del>ลบออก</button>
            </div>
          </div>
          <div class="line__sum">${Store.baht(l.sum)}</div>
        </div>`).join('');
    }

    const sub = Store.cartTotal();
    const ship = sub === 0 ? 0 : (sub >= 1000 ? 0 : 50);
    $('[data-sub]').textContent = Store.baht(sub);
    $('[data-ship]').textContent = ship ? Store.baht(ship) : 'ฟรี';
    $('[data-total]').textContent = Store.baht(sub + ship);
    $('[data-freehint]').textContent =
      sub === 0 ? '' : (sub >= 1000 ? '✓ ออเดอร์นี้ได้ส่งฟรีแล้ว' : `ซื้อเพิ่มอีก ${Store.baht(1000 - sub)} ได้ส่งฟรี`);
  }

  /* ---- ปุ่มในแต่ละบรรทัด ---- */
  linesBox.addEventListener('click', (e) => {
    const row = e.target.closest('.line');
    if (!row) return;
    if (e.target.closest('[data-del]')) { Store.removeLine(row.dataset.sku); render(); return; }
    const step = e.target.closest('[data-step]');
    if (step) {
      const input = row.querySelector('input');
      Store.setQty(row.dataset.sku, (parseInt(input.value, 10) || 1) + Number(step.dataset.step));
      render();
    }
  });
  linesBox.addEventListener('change', (e) => {
    if (e.target.matches('input[type="number"]')) {
      Store.setQty(e.target.closest('.line').dataset.sku, parseInt(e.target.value, 10) || 1);
      render();
    }
  });

  /* ---- คิวอาร์โชว์เฉพาะตอนเลือก PromptPay ---- */
  const syncPay = () => {
    const v = document.querySelector('input[name="pay"]:checked')?.value;
    document.querySelector('#qr').style.display = v === 'PromptPay' ? '' : 'none';
  };
  document.querySelectorAll('input[name="pay"]').forEach((r) => r.addEventListener('change', syncPay));

  /* ---- ยืนยันคำสั่งซื้อ ---- */
  $('#checkout').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = $('#formmsg');
    const need = ['name', 'phone', 'email', 'addr'];
    const missing = need.filter((n) => !f[n].value.trim());
    if (missing.length) {
      msg.innerHTML = '<p class="msg msg--bad">กรอกข้อมูลให้ครบก่อนยืนยัน — ยังขาด: ' +
        missing.map((n) => ({ name: 'ชื่อผู้รับ', phone: 'เบอร์โทร', email: 'อีเมล', addr: 'ที่อยู่' }[n])).join(' · ') + '</p>';
      f[missing[0]].focus();
      return;
    }
    const r = Store.placeOrder({
      name: f.name.value.trim(), phone: f.phone.value.trim(),
      email: f.email.value.trim(), addr: f.addr.value.trim(),
      pay: document.querySelector('input[name="pay"]:checked').value,
    });
    if (!r.ok) { msg.innerHTML = `<p class="msg msg--bad">${r.msg}</p>`; return; }
    // เก็บเลขออเดอร์ไว้ให้หน้าบัญชีเปิดมาเจอใบที่เพิ่งสั่งทันที
    try { sessionStorage.setItem('gd.justOrdered', r.order.id); } catch {}
    location.href = 'account.html?ordered=' + r.order.id;
  });

  render();
  syncPay();
})();
