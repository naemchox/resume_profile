/* หน้าบัญชีสมาชิก — สมัคร / ล็อกอิน / ประวัติการสั่งซื้อ
   หน้าเดียวสองสถานะ (ยังไม่ล็อกอิน กับ ล็อกอินแล้ว) แทนที่จะแยกเป็นสองไฟล์
   เพราะทั้งสองสถานะใช้หัวเว็บและฟอร์มชุดเดียวกัน แยกไฟล์แล้วจะหลุดกันเวลาแก้ */
(() => {
  'use strict';
  if (!window.Store) return;
  const view = document.getElementById('view');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const PILL = { 'รอชำระเงิน': 'wait', 'ชำระเงินแล้ว': 'paid', 'กำลังจัดส่ง': 'ship', 'ส่งถึงแล้ว': 'done', 'ยกเลิก': '' };
  const when = (iso) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

  function orderCard(o) {
    return `<article class="order">
      <div class="order__top">
        <div>
          <div class="order__id">คำสั่งซื้อ ${o.id}</div>
          <div class="order__when">${when(o.at)} · ${esc(o.pay)}</div>
        </div>
        <span class="pill pill--${PILL[o.status] || ''}">${esc(o.status)}</span>
      </div>
      <div class="order__items">
        ${o.items.map((it) => `<div><span>${esc(it.name)} × ${it.qty}</span><span>${Store.baht(it.price * it.qty)}</span></div>`).join('')}
      </div>
      <div class="order__foot">
        <span>ส่งถึง: ${esc(o.name)} · ${esc(o.phone)}</span>
        <span>รวม ${Store.baht(o.total)}</span>
      </div>
    </article>`;
  }

  function renderLoggedIn(user) {
    const orders = Store.myOrders().slice().reverse();
    const justId = new URLSearchParams(location.search).get('ordered');
    document.getElementById('page-title').textContent = `สวัสดี ${user.name}`;
    document.getElementById('page-sub').textContent = user.email;
    view.innerHTML = `
      ${justId ? `<p class="msg msg--good">รับคำสั่งซื้อ ${esc(justId)} เรียบร้อย — เราส่งรายละเอียดไปที่อีเมลของคุณแล้ว โอนเงินแล้วแนบสลิปได้ที่ไลน์ @gamedock</p>` : ''}
      <div class="card-box">
        <h2>ประวัติการสั่งซื้อ (${orders.length})</h2>
        ${orders.length ? orders.map(orderCard).join('') : `<div class="empty">
            <svg class="icon" aria-hidden="true"><use href="#i-cart"/></svg>
            <p>ยังไม่มีคำสั่งซื้อ</p>
            <a class="btn btn--primary" href="index.html#results" style="margin-top:var(--s4)">เริ่มเลือกซื้อ</a>
          </div>`}
      </div>
      <div class="card-box">
        <h2>ข้อมูลบัญชี</h2>
        <p style="font-size:var(--t-sm);color:var(--text-dim)">ชื่อ: ${esc(user.name)}<br>อีเมล: ${esc(user.email)}</p>
        <button class="btn btn--ghost" type="button" id="logout" style="margin-top:var(--s4)">ออกจากระบบ</button>
      </div>`;
    document.getElementById('logout').addEventListener('click', () => { Store.logout(); render(); });
  }

  function renderGuest() {
    // สั่งซื้อแบบไม่ล็อกอินก็ต้องเห็นใบที่เพิ่งสั่ง ไม่งั้นกดยืนยันแล้วเจอหน้าล็อกอิน
    // เปล่าๆ ซึ่งอ่านได้อย่างเดียวว่า "ออเดอร์หาย"
    const justId = new URLSearchParams(location.search).get('ordered');
    const just = justId ? Store.orders().find((o) => o.id === justId) : null;
    view.innerHTML = `
      ${just ? `<p class="msg msg--good">รับคำสั่งซื้อ ${esc(just.id)} เรียบร้อย — รายละเอียดส่งไปที่ ${esc(just.email)} แล้ว</p>
        <div class="card-box">${orderCard(just)}
          <p style="font-size:var(--t-sm);color:var(--text-mute);margin-top:var(--s4)">สมัครสมาชิกด้วยอีเมลเดียวกันเพื่อเก็บประวัติการสั่งซื้อไว้ดูภายหลัง</p>
        </div>` : ''}
      <div class="split">
        <form class="card-box" id="f-login" novalidate>
          <h2>ล็อกอิน</h2>
          <div id="m-login"></div>
          <div class="field"><label for="l-mail">อีเมล</label><input id="l-mail" name="email" type="email" autocomplete="email"></div>
          <div class="field"><label for="l-pass">รหัสผ่าน</label><input id="l-pass" name="pass" type="password" autocomplete="current-password"></div>
          <button class="btn btn--primary btn--block" type="submit">เข้าสู่ระบบ</button>
        </form>
        <form class="card-box" id="f-signup" novalidate>
          <h2>สมัครสมาชิกใหม่</h2>
          <div id="m-signup"></div>
          <div class="field"><label for="s-name">ชื่อที่ให้เรียก</label><input id="s-name" name="name" autocomplete="name"></div>
          <div class="field"><label for="s-mail">อีเมล</label><input id="s-mail" name="email" type="email" autocomplete="email"></div>
          <div class="field"><label for="s-pass">รหัสผ่าน</label><input id="s-pass" name="pass" type="password" autocomplete="new-password"><small>อย่างน้อย 6 ตัวอักษร</small></div>
          <button class="btn btn--ghost btn--block" type="submit">สมัครสมาชิก</button>
        </form>
      </div>`;

    document.getElementById('f-login').addEventListener('submit', (e) => {
      e.preventDefault();
      const r = Store.login(e.target.email.value, e.target.pass.value);
      if (r.ok) render();
      else document.getElementById('m-login').innerHTML = `<p class="msg msg--bad">${r.msg}</p>`;
    });
    document.getElementById('f-signup').addEventListener('submit', (e) => {
      e.preventDefault();
      const r = Store.signup(e.target.email.value, e.target.pass.value, e.target.name.value);
      if (r.ok) render();
      else document.getElementById('m-signup').innerHTML = `<p class="msg msg--bad">${r.msg}</p>`;
    });
  }

  function render() {
    const u = Store.currentUser();
    if (u) renderLoggedIn(u);
    else {
      document.getElementById('page-title').textContent = 'บัญชีของฉัน';
      document.getElementById('page-sub').textContent = 'ล็อกอินเพื่อดูประวัติการสั่งซื้อและติดตามสถานะพัสดุ';
      renderGuest();
    }
  }
  render();
})();
