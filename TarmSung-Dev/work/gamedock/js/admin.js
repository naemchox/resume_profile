/* ระบบหลังร้าน — ล็อกอิน · แก้สินค้า/ราคา/สต็อก · จัดการคำสั่งซื้อ
   นี่คือส่วนที่ทำให้เว็บ "แก้เองได้" ไม่ต้องเรียกคนทำเว็บทุกครั้งที่เปลี่ยนราคา
   ทุกอย่างเขียนผ่าน Store ตัวเดียวกับหน้าร้าน กด บันทึก แล้วเปิดหน้าร้านจะเห็นผลทันที

   บัญชีทดลอง: demo / demo
   ของจริงต้องตรวจรหัสผ่านที่ฝั่งเซิร์ฟเวอร์และออก session token — ตรงนี้เป็นการ
   ตรวจฝั่งหน้าเว็บล้วน เอาไว้ให้ลูกค้าเห็นหน้าจอจริงก่อนตัดสินใจจ้างเท่านั้น */
(() => {
  'use strict';
  if (!window.Store) return;
  const view = document.getElementById('view');
  const KEY = 'gd.admin';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isIn = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
  const STATUS = ['รอชำระเงิน', 'ชำระเงินแล้ว', 'กำลังจัดส่ง', 'ส่งถึงแล้ว', 'ยกเลิก'];
  const PILL = { 'รอชำระเงิน': 'wait', 'ชำระเงินแล้ว': 'paid', 'กำลังจัดส่ง': 'ship', 'ส่งถึงแล้ว': 'done', 'ยกเลิก': '' };
  let tab = 'products';

  /* ---------- ล็อกอิน ---------- */
  function renderLogin() {
    view.innerHTML = `
      <div class="pagehead"><h1>เข้าสู่ระบบหลังร้าน</h1><p>สำหรับเจ้าของร้านและพนักงานที่ได้รับสิทธิ์</p></div>
      <form class="card-box" id="f" style="max-width:420px" novalidate>
        <div id="m"></div>
        <div class="field"><label for="u">ชื่อผู้ใช้</label><input id="u" name="u" autocomplete="username"></div>
        <div class="field"><label for="p">รหัสผ่าน</label><input id="p" name="p" type="password" autocomplete="current-password"></div>
        <button class="btn btn--primary btn--block" type="submit">เข้าสู่ระบบ</button>
        <p class="msg msg--good" style="margin:var(--s4) 0 0">บัญชีทดลองสำหรับดูระบบ: <b>demo</b> / <b>demo</b></p>
      </form>`;
    document.getElementById('f').addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.target.u.value.trim() === 'demo' && e.target.p.value === 'demo') {
        try { sessionStorage.setItem(KEY, '1'); } catch {}
        render();
      } else {
        document.getElementById('m').innerHTML = '<p class="msg msg--bad">ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</p>';
      }
    });
  }

  /* ---------- แผงสินค้า ---------- */
  function productsPanel() {
    const rows = Store.products().map((p) => `
      <tr data-sku="${p.sku}">
        <td><code style="font-size:var(--t-xs);color:var(--text-mute)">${p.sku}</code></td>
        <td><input type="text" data-f="name" value="${esc(p.name)}"></td>
        <td><input type="number" data-f="price" value="${p.price}" min="0" step="10"></td>
        <td><input type="number" data-f="was" value="${p.was || ''}" min="0" step="10" placeholder="—"></td>
        <td><input type="number" data-f="stock" value="${p.stock}" min="0"></td>
        <td style="white-space:nowrap">
          <button class="btn btn--primary btn--sm" type="button" data-save>บันทึก</button>
          <span class="rowsave">บันทึกแล้ว ✓</span>
        </td>
      </tr>`).join('');
    return `
      <div class="card-box">
        <h2>สินค้าในร้าน (${Store.products().length} รายการ)</h2>
        <p style="font-size:var(--t-sm);color:var(--text-mute);margin-bottom:var(--s4)">แก้ชื่อ ราคา ราคาก่อนลด หรือจำนวนคงเหลือ แล้วกดบันทึก — เปิดหน้าร้านจะเห็นผลทันทีโดยไม่ต้องแจ้งคนทำเว็บ</p>
        <div class="table-wrap">
          <table class="dtable">
            <thead><tr><th>รหัส</th><th>ชื่อสินค้า</th><th>ราคาขาย</th><th>ราคาก่อนลด</th><th>คงเหลือ</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <button class="btn btn--ghost btn--sm" type="button" id="reset" style="margin-top:var(--s4)">คืนค่าข้อมูลสินค้าเป็นค่าตั้งต้น</button>
      </div>`;
  }

  /* ---------- แผงคำสั่งซื้อ ---------- */
  function ordersPanel() {
    const os = Store.orders().slice().reverse();
    if (!os.length) {
      return `<div class="card-box"><h2>คำสั่งซื้อ</h2>
        <div class="empty"><svg class="icon" aria-hidden="true"><use href="#i-cart"/></svg>
        <p>ยังไม่มีคำสั่งซื้อเข้ามา — ลองสั่งซื้อจากหน้าร้านดูก่อน แล้วกลับมาที่หน้านี้</p></div></div>`;
    }
    const rows = os.map((o) => `
      <tr data-id="${o.id}">
        <td><b>${o.id}</b><br><span style="font-size:var(--t-xs);color:var(--text-mute)">${new Date(o.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span></td>
        <td>${esc(o.name)}<br><span style="font-size:var(--t-xs);color:var(--text-mute)">${esc(o.phone)} · ${esc(o.email)}</span></td>
        <td style="font-size:var(--t-xs);color:var(--text-dim)">${o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join('<br>')}</td>
        <td>${esc(o.pay)}</td>
        <td><b>${Store.baht(o.total)}</b></td>
        <td>
          <select data-status>${STATUS.map((s) => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}</select>
          <span class="pill pill--${PILL[o.status] || ''}" style="margin-left:.4rem">${esc(o.status)}</span>
        </td>
      </tr>`).join('');
    const income = os.filter((o) => o.status !== 'ยกเลิก').reduce((n, o) => n + o.total, 0);
    return `
      <div class="card-box">
        <h2>คำสั่งซื้อ (${os.length}) · ยอดขายรวม ${Store.baht(income)}</h2>
        <div class="table-wrap">
          <table class="dtable">
            <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>รายการ</th><th>ชำระโดย</th><th>ยอด</th><th>สถานะ</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  /* ---------- แผงสมาชิก ---------- */
  function usersPanel() {
    const us = Store.users();
    const rows = us.map((u) => {
      const n = Store.orders().filter((o) => o.email === u.email);
      const spent = n.filter((o) => o.status !== 'ยกเลิก').reduce((s, o) => s + o.total, 0);
      return `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${n.length}</td><td><b>${Store.baht(spent)}</b></td></tr>`;
    }).join('');
    return `<div class="card-box">
      <h2>สมาชิก (${us.length})</h2>
      ${us.length ? `<div class="table-wrap"><table class="dtable">
        <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>จำนวนออเดอร์</th><th>ยอดซื้อสะสม</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
      : `<div class="empty"><svg class="icon" aria-hidden="true"><use href="#i-user"/></svg><p>ยังไม่มีสมาชิกสมัครเข้ามา</p></div>`}
    </div>`;
  }

  /* ---------- ประกอบหน้า ---------- */
  function renderAdmin() {
    document.getElementById('adminwho').hidden = false;
    document.getElementById('a-logout').hidden = false;
    const panel = tab === 'orders' ? ordersPanel() : tab === 'users' ? usersPanel() : productsPanel();
    view.innerHTML = `
      <div class="pagehead"><h1>ระบบหลังร้าน</h1><p>แก้ข้อมูลร้านได้เองทั้งหมด ไม่ต้องรอคิวคนทำเว็บ</p></div>
      <div class="admin-tabs">
        <button class="chip" type="button" data-tab="products" aria-pressed="${tab === 'products'}">สินค้าและราคา</button>
        <button class="chip" type="button" data-tab="orders" aria-pressed="${tab === 'orders'}">คำสั่งซื้อ (${Store.orders().length})</button>
        <button class="chip" type="button" data-tab="users" aria-pressed="${tab === 'users'}">สมาชิก (${Store.users().length})</button>
      </div>
      ${panel}`;

    view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderAdmin(); }));

    // บันทึกรายบรรทัด: อ่านทุกช่องในแถวนั้นครั้งเดียว แถวอื่นไม่ถูกแตะ
    view.querySelectorAll('[data-save]').forEach((btn) => btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const patch = {};
      tr.querySelectorAll('[data-f]').forEach((inp) => {
        const f = inp.dataset.f;
        if (f === 'name') patch.name = inp.value.trim() || 'ไม่มีชื่อ';
        else {
          const v = inp.value === '' ? null : Math.max(0, parseInt(inp.value, 10) || 0);
          if (f === 'was') patch.was = v; else patch[f] = v ?? 0;
        }
      });
      Store.saveProduct(tr.dataset.sku, patch);
      const tag = tr.querySelector('.rowsave');
      tag.classList.add('on');
      setTimeout(() => tag.classList.remove('on'), 1600);
    }));

    const reset = document.getElementById('reset');
    if (reset) reset.addEventListener('click', () => { Store.resetProducts(); renderAdmin(); });

    view.querySelectorAll('[data-status]').forEach((sel) => sel.addEventListener('change', () => {
      Store.setOrderStatus(sel.closest('tr').dataset.id, sel.value);
      renderAdmin();
    }));
  }

  function render() { isIn() ? renderAdmin() : renderLogin(); }

  document.getElementById('a-logout').addEventListener('click', () => {
    try { sessionStorage.removeItem(KEY); } catch {}
    document.getElementById('adminwho').hidden = true;
    document.getElementById('a-logout').hidden = true;
    render();
  });

  render();
})();
