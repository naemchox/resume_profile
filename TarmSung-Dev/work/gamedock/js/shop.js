/* หน้าหมวดสินค้า/ผลค้นหา
   อ่านเงื่อนไขจาก URL (?q= ค้นหา · ?plat= เครื่อง · ?cat= หมวด · ?sort=) แล้ววาดกริด
   ใส่ไว้ใน URL ไม่ใช่ในตัวแปรจาวาสคริปต์ เพราะผลการกรองต้องก๊อปลิงก์ส่งให้ลูกค้าได้
   และปุ่มย้อนกลับของเบราว์เซอร์ต้องทำงานตามที่คนคาด */
(() => {
  'use strict';
  if (!window.Store) return;

  const grid = document.getElementById('grid');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CATS = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'PS5', label: 'PlayStation 5', plat: 'PS5' },
    { key: 'SWITCH', label: 'Nintendo Switch', plat: 'SWITCH' },
    { key: 'XBOX', label: 'Xbox Series', plat: 'XBOX' },
    { key: 'PC', label: 'PC / Steam', plat: 'PC' },
    { key: 'console', label: 'เครื่องเกม', group: 'console' },
    { key: 'code', label: 'บัตรเติมเงิน', group: 'code' },
    { key: 'used', label: 'มือสอง', badge: 'used' },
    { key: 'pre', label: 'พรีออเดอร์', badge: 'pre' },
    { key: 'sale', label: 'ลดราคา', sale: true },
  ];
  const SORTS = [
    ['pop', 'ยอดนิยม'], ['low', 'ราคาต่ำ→สูง'], ['high', 'ราคาสูง→ต่ำ'],
    ['new', 'มาใหม่'], ['off', 'ลดราคามากสุด'],
  ];

  const readURL = () => {
    const u = new URLSearchParams(location.search);
    return { cat: u.get('cat') || 'all', q: (u.get('q') || '').trim(), sort: u.get('sort') || 'pop' };
  };

  function apply(state) {
    let list = Store.products();
    const c = CATS.find((x) => x.key === state.cat) || CATS[0];
    if (c.plat) list = list.filter((p) => p.plats.includes(c.plat));
    if (c.group) list = list.filter((p) => p.group === c.group);
    if (c.badge) list = list.filter((p) => p.badge && p.badge[0] === c.badge);
    if (c.sale) list = list.filter((p) => p.was);
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((p) => (p.name + ' ' + p.sku + ' ' + p.plats.join(' ')).toLowerCase().includes(q));
    }
    const by = {
      low: (a, b) => a.price - b.price,
      high: (a, b) => b.price - a.price,
      new: (a, b) => (b.badge?.[0] === 'new' ? 1 : 0) - (a.badge?.[0] === 'new' ? 1 : 0),
      off: (a, b) => ((b.was ? b.was - b.price : 0) - (a.was ? a.was - a.price : 0)),
      pop: (a, b) => (b.reviews || 0) - (a.reviews || 0),
    }[state.sort];
    return list.slice().sort(by);
  }

  const card = (p) => {
    const badge = p.badge ? `<div class="badges"><b class="badge badge--${p.badge[0]}">${esc(p.badge[1])}</b></div>` : '';
    const rating = p.rating
      ? `<div class="rating"><svg class="icon" aria-hidden="true"><use href="#i-star"/></svg>${p.rating} <span>(${p.reviews})</span></div>` : '';
    const foot = p.stock === 0 ? '<span class="card__meta">ของหมดชั่วคราว</span>'
      : p.note ? `<span class="card__ship">${esc(p.note)}</span>`
      : '<span class="card__ship">ส่งฟรี</span>';
    return `<article class="card" data-sku="${p.sku}">
      <a class="card__link" href="game.html?sku=${p.sku}"><span>ดูรายละเอียด ${esc(p.name)}</span></a>
      <div class="card__media">
        <div class="art art--${p.art} card__art" aria-hidden="true"><img class="art__photo" src="img/g-${p.art}.webp" alt="" loading="lazy" decoding="async"></div>
        ${badge}
        <div class="card__title-art" aria-hidden="true">${p.cover}</div>
        <div class="card__plat" aria-hidden="true">${p.plats.map((x) => `<b>${esc(x)}</b>`).join('')}</div>
      </div>
      <div class="card__body">
        <h3 class="card__name">${esc(p.name)}</h3>
        ${rating}
        <div class="price${p.was ? ' price--hot' : ''}"><b>${Store.baht(p.price)}</b>${p.was ? `<s>${Store.baht(p.was)}</s>` : ''}</div>
        ${foot}
      </div>
    </article>`;
  };

  function render() {
    const state = readURL();
    const c = CATS.find((x) => x.key === state.cat) || CATS[0];
    const list = apply(state);

    const title = state.q ? `ผลการค้นหา “${state.q}”` : c.label === 'ทั้งหมด' ? 'สินค้าทั้งหมด' : c.label;
    document.getElementById('shop-title').textContent = title;
    document.getElementById('crumb-now').textContent = title;
    document.title = title + ' | GAMEDOCK';
    document.getElementById('shop-sub').textContent = state.q
      ? 'ถ้าไม่เจอที่ต้องการ ลองพิมพ์แค่ชื่อเกมหรือชื่อเครื่อง'
      : 'เลือกดูตามเครื่อง หรือค้นหาชื่อเกมที่ต้องการ';

    document.getElementById('chips').innerHTML =
      CATS.map((x) => `<button class="chip" type="button" data-cat="${x.key}" aria-pressed="${x.key === state.cat}">${x.label}</button>`).join('') +
      `<div class="filters__sort"><label for="sort">เรียงตาม</label><select id="sort">
        ${SORTS.map(([k, l]) => `<option value="${k}"${k === state.sort ? ' selected' : ''}>${l}</option>`).join('')}
      </select></div>`;

    document.getElementById('count').textContent = `พบ ${list.length} รายการ`;
    grid.innerHTML = list.map(card).join('');
    document.getElementById('none').innerHTML = list.length ? '' : `<div class="empty">
      <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
      <p>ไม่พบสินค้าที่ตรงกับเงื่อนไขนี้</p>
      <a class="btn btn--ghost" href="shop.html" style="margin-top:var(--s4)">ล้างตัวกรอง</a></div>`;

    document.getElementById('sort').addEventListener('change', (e) => go({ ...state, sort: e.target.value }));
  }

  function go(state) {
    const u = new URLSearchParams();
    if (state.cat && state.cat !== 'all') u.set('cat', state.cat);
    if (state.q) u.set('q', state.q);
    if (state.sort && state.sort !== 'pop') u.set('sort', state.sort);
    history.pushState(null, '', 'shop.html' + (u.toString() ? '?' + u : ''));
    render();
  }

  document.getElementById('chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) go({ ...readURL(), cat: b.dataset.cat });
  });
  addEventListener('popstate', render);
  render();
})();
