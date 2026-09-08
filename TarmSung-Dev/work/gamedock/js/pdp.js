/* หน้าสินค้า — แท็บ, จำนวน, ตัวเลือกเวอร์ชัน/เครื่อง
   ทั้งสามอย่างเป็นของที่ลูกค้าคาดว่าจะกดได้ทันทีในหน้านี้ ถ้าเป็นภาพนิ่งจะรู้สึกทันที
   ว่าเป็นเดโม จึงทำให้ทำงานจริงในฝั่งหน้าเว็บก่อน แล้วค่อยต่อฐานข้อมูลทีหลัง */
(() => {
  'use strict';

  /* ---- เปิดหน้าสินค้าตัวไหนก็ได้ด้วย ?sku= ----
     หน้านี้เป็น HTML จริงของ Nova Drifter Deluxe เมื่อเปิดเปล่าๆ (Google เก็บได้
     และเปิดอ่านได้แม้ JS ไม่ทำงาน) พอมี ?sku ค่อยเขียนทับด้วยข้อมูลของตัวนั้น
     ทางเลือกอื่นคือทำ 26 ไฟล์แยก ซึ่งแปลว่าแก้ราคาทีต้องไล่แก้ 26 ที่ */
  const $ = (s) => document.querySelector(s);
  const bind = (n) => document.querySelector(`[data-bind="${n}"]`);
  const params = new URLSearchParams(location.search);
  let sku = params.get('sku') || 'NVD-PS5-DLX';
  if (!Store.find(sku)) sku = 'NVD-PS5-DLX';

  // สินค้าตระกูลเดียวกัน = รหัสขึ้นต้นเหมือนกัน (NVD-PS5-DLX / NVD-PS5-STD / NVD-PS5-SP)
  const family = (s) => s.split('-')[0];
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const shortName = (p) => {
    const t = p.name.split('—')[1] || p.name.split('(')[1] || p.name;
    return t.replace(/\)$/, '').trim().slice(0, 26) || p.name.slice(0, 26);
  };

  function render() {
    const p = Store.find(sku);
    if (!p) return;
    document.title = `${p.name} | GAMEDOCK`;

    bind('name').textContent = p.name;
    bind('crumb').textContent = p.name;
    bind('sku').textContent = 'รหัสสินค้า ' + p.sku;
    bind('plats').innerHTML = p.plats.map((x) => `<b>${esc(x)}</b>`).join('') +
      (p.digital ? '<b>โค้ดดิจิทัล</b>' : '');

    // งานศิลป์: เปลี่ยนทั้งภาพใหญ่และภาพย่อยใบแรกให้ตรงกับสินค้าที่เปิดอยู่
    const main = bind('hero').querySelector('.art');
    main.className = `art art--${p.art}`;
    main.innerHTML = `<img class="art__photo" src="img/g-${p.art}.webp" alt="ภาพปกของ ${esc(p.name)}">`;
    const t0 = bind('thumbs').querySelector('.thumb .art');
    t0.className = `art art--${p.art}`;
    t0.innerHTML = `<img class="art__photo" src="img/g-${p.art}.webp" alt="">`;

    bind('price').textContent = Store.baht(p.price);
    bind('was').textContent = p.was ? Store.baht(p.was) : '';
    bind('was').hidden = !p.was;
    bind('save').textContent = p.was ? 'ประหยัด ' + Store.baht(p.was - p.price) : '';
    bind('save').hidden = !p.was;

    const inst = Math.ceil(p.price / (p.price >= 3000 ? 10 : 6));
    bind('inst').textContent = p.price >= 1000
      ? `ผ่อน 0% ${Store.baht(inst)} × ${p.price >= 3000 ? 10 : 6} เดือน · เก็บเงินปลายทางได้`
      : 'จ่ายผ่าน PromptPay หรือเก็บเงินปลายทางได้';

    bind('stock').textContent = p.stock > 0
      ? (p.stock > 20 ? 'พร้อมส่งทันที' : `เหลือ ${p.stock} ชิ้นสุดท้าย`)
      : 'ของหมดชั่วคราว';

    const rat = bind('rating');
    rat.innerHTML = p.rating
      ? `<svg class="icon" aria-hidden="true"><use href="#i-star"/></svg><b>${p.rating}</b> <a href="#tab-review">${p.reviews} รีวิว</a>`
      : '<b>ยังไม่มีรีวิว</b>';
    bind('revtab').textContent = `รีวิว (${p.reviews || 0})`;

    // ตัวเลือกเวอร์ชัน = สินค้าตระกูลเดียวกันที่มีจริงในคลัง ไม่ใช่ปุ่มหลอก
    const kin = Store.products().filter((x) => family(x.sku) === family(p.sku));
    bind('versions').innerHTML = kin.map((x) => `
      <button class="opt" type="button" aria-pressed="${x.sku === p.sku}" data-goto="${x.sku}"${x.stock ? '' : ' disabled'}>
        <span>${esc(shortName(x))}</span><small>${x.stock ? Store.baht(x.price) : 'ของหมด'}</small>
      </button>`).join('');
    bind('versions').closest('.optset').hidden = kin.length < 2;

    const plats = [...new Set(kin.flatMap((x) => x.plats))];
    bind('plats-opt').innerHTML = plats.map((pl) => {
      const owner = kin.find((x) => x.plats.includes(pl));
      const on = p.plats.includes(pl);
      return `<button class="opt" type="button" aria-pressed="${on}" data-goto="${owner.sku}"${owner.stock ? '' : ' disabled'}>
        <span>${esc(pl)}</span><small>${owner.stock ? (on ? 'พร้อมส่ง' : Store.baht(owner.price)) : 'ของหมด'}</small></button>`;
    }).join('');
    bind('plats-opt').closest('.optset').hidden = plats.length < 2;

    const q = document.getElementById('qty');
    q.max = Math.max(1, p.stock);
    if (+q.value > p.stock) q.value = Math.max(1, p.stock);

    document.querySelectorAll('[data-add-cart]').forEach((b) => { b.dataset.addCart = p.sku; b.disabled = !p.stock; });
    document.querySelectorAll('[data-buy-now]').forEach((b) => { b.dataset.buyNow = p.sku; b.disabled = !p.stock; });
    document.querySelectorAll('.buybar .price b').forEach((b) => { b.textContent = Store.baht(p.price); });
    document.querySelectorAll('.buybar .price s').forEach((s) => { s.textContent = p.was ? Store.baht(p.was) : ''; });
  }

  // กดเปลี่ยนเวอร์ชัน/เครื่อง = เปลี่ยนสินค้าจริง และเปลี่ยน URL ให้ก๊อปส่งต่อได้
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b || b.disabled) return;
    sku = b.dataset.goto;
    history.replaceState(null, '', 'game.html?sku=' + sku);
    render();
  });

  render();

  /* ---- แท็บ ---- */
  const tabs = document.querySelectorAll('.tab');
  const show = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  };
  tabs.forEach((t) => t.addEventListener('click', () => show(t)));
  // ลิงก์ "325 รีวิว" ด้านบนต้องพาไปที่แท็บรีวิวจริง ไม่ใช่แค่เลื่อนลงไปหาแท็บที่ปิดอยู่
  document.querySelectorAll('a[href="#tab-review"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = document.getElementById('t-review');
      show(tab);
      tab.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });

  /* ---- ปุ่มเลือกเวอร์ชัน/เครื่อง: เลือกได้ทีละอันภายในกลุ่มของตัวเอง ---- */
  document.querySelectorAll('.opts').forEach((group) => {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('.opt');
      if (!b || b.disabled) return;
      group.querySelectorAll('.opt').forEach((o) => o.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
    });
  });

  /* ---- จำนวน ---- */
  const qtyBox = document.querySelector('.qty');
  if (qtyBox) {
    const input = qtyBox.querySelector('input');
    qtyBox.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const step = btn.textContent.trim() === '+' ? 1 : -1;
      const next = Math.min(9, Math.max(1, (parseInt(input.value, 10) || 1) + step));
      input.value = next;
    });
  }

  /* ---- ใส่ตะกร้า / ซื้อเลย: ผ่าน Store เพื่อให้ตะกร้ากับสต็อกเป็นชุดเดียวกับทั้งเว็บ ---- */
  const qtyNow = () => parseInt(document.getElementById('qty')?.value, 10) || 1;
  const flash = (btn, msg) => {
    const old = btn.textContent;
    btn.textContent = msg; btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1600);
  };
  const addBtn = document.querySelector('[data-add-cart]');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const r = Store.addToCart(addBtn.dataset.addCart, qtyNow());
      flash(addBtn, r.ok ? 'ใส่ตะกร้าแล้ว' : r.msg);
    });
  }
  document.querySelectorAll('[data-buy-now]').forEach((b) => {
    b.addEventListener('click', () => {
      const r = Store.addToCart(b.dataset.buyNow, qtyNow());
      if (r.ok) location.href = 'cart.html'; else flash(b, r.msg);
    });
  });

  /* ---- นาฬิกาในกล่องราคา: ใช้เวลาชุดเดียวกับแฟลชเซลหน้าแรก ---- */
  const inline = document.querySelector('[data-countdown-inline]');
  if (inline) {
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      const left = Math.max(0, Math.floor((end - now) / 1000));
      inline.textContent = `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
    };
    tick();
    setInterval(tick, 1000);
  }
})();
