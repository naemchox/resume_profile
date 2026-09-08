/* GAMEDOCK — ชั้นข้อมูล
   ทุกหน้าคุยกับร้านผ่านไฟล์นี้ไฟล์เดียว ไม่มีหน้าไหนแตะ localStorage ตรงๆ
   เพราะตอนย้ายไปฐานข้อมูลจริง เราจะเปลี่ยนแค่ข้างในฟังก์ชันพวกนี้ให้เป็น fetch()
   ส่วนหน้าเว็บทั้งหมดไม่ต้องแก้แม้แต่บรรทัดเดียว

   สิ่งที่เก็บ:
   - gd.override  แก้ชื่อ/ราคา/สต็อกจากหลังบ้าน (ทับข้อมูลใน data.js)
   - gd.cart      ตะกร้าของเครื่องนี้
   - gd.users     บัญชีสมาชิก
   - gd.session   ใครล็อกอินอยู่
   - gd.orders    ออเดอร์ทั้งหมด */
window.Store = (() => {
  'use strict';
  const K = { over: 'gd.override', cart: 'gd.cart', users: 'gd.users', ses: 'gd.session', ord: 'gd.orders' };

  // localStorage พังได้จริง (โหมดส่วนตัว, ปิดคุกกี้) — ถ้าอ่านไม่ได้ให้ร้านยังเปิดได้
  // ด้วยข้อมูลตั้งต้น ดีกว่าทั้งหน้าขาว
  const read = (k, dflt) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dflt; }
    catch { return dflt; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  };

  /* ---------- สินค้า ---------- */
  const overrides = () => read(K.over, {});
  const products = () => {
    const ov = overrides();
    return (window.GD_PRODUCTS || []).map((p) => ({ ...p, ...(ov[p.sku] || {}) }))
      .filter((p) => !p.deleted);
  };
  const find = (sku) => products().find((p) => p.sku === sku) || null;
  const saveProduct = (sku, patch) => {
    const ov = overrides();
    ov[sku] = { ...(ov[sku] || {}), ...patch };
    write(K.over, ov);
  };
  const resetProducts = () => { try { localStorage.removeItem(K.over); } catch {} };

  /* ---------- ตะกร้า ---------- */
  const cart = () => read(K.cart, []);
  const cartCount = () => cart().reduce((n, l) => n + l.qty, 0);
  const cartLines = () => cart().map((l) => {
    const p = find(l.sku);
    return p ? { ...l, product: p, sum: p.price * l.qty } : null;
  }).filter(Boolean);
  const cartTotal = () => cartLines().reduce((n, l) => n + l.sum, 0);
  const addToCart = (sku, qty = 1) => {
    const p = find(sku);
    if (!p) return { ok: false, msg: 'ไม่พบสินค้านี้' };
    const c = cart();
    const line = c.find((l) => l.sku === sku);
    const want = (line ? line.qty : 0) + qty;
    if (want > p.stock) return { ok: false, msg: `สินค้าเหลือ ${p.stock} ชิ้น` };
    if (line) line.qty = want; else c.push({ sku, qty });
    write(K.cart, c);
    paintCount();
    return { ok: true, count: cartCount() };
  };
  const setQty = (sku, qty) => {
    const p = find(sku);
    const c = cart().map((l) => (l.sku === sku ? { ...l, qty: Math.max(1, Math.min(qty, p ? p.stock : 9)) } : l));
    write(K.cart, c); paintCount();
  };
  const removeLine = (sku) => { write(K.cart, cart().filter((l) => l.sku !== sku)); paintCount(); };
  const clearCart = () => { write(K.cart, []); paintCount(); };

  /* ---------- สมาชิก ---------- */
  const users = () => read(K.users, []);
  const session = () => read(K.ses, null);
  const signup = (email, pass, name) => {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, msg: 'อีเมลไม่ถูกต้อง' };
    if (String(pass || '').length < 6) return { ok: false, msg: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว' };
    const all = users();
    if (all.some((u) => u.email === email)) return { ok: false, msg: 'อีเมลนี้สมัครไว้แล้ว' };
    // เดโมเก็บรหัสผ่านแบบธรรมดา ของจริงต้องแฮชที่ฝั่งเซิร์ฟเวอร์เท่านั้น
    all.push({ email, pass: String(pass), name: String(name || '').trim() || email.split('@')[0] });
    write(K.users, all);
    write(K.ses, { email });
    return { ok: true };
  };
  const login = (email, pass) => {
    email = String(email || '').trim().toLowerCase();
    const u = users().find((x) => x.email === email && x.pass === String(pass));
    if (!u) return { ok: false, msg: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    write(K.ses, { email });
    return { ok: true, user: u };
  };
  const logout = () => { try { localStorage.removeItem(K.ses); } catch {} };
  const currentUser = () => {
    const s = session();
    return s ? users().find((u) => u.email === s.email) || null : null;
  };

  /* ---------- ออเดอร์ ---------- */
  const orders = () => read(K.ord, []);
  const myOrders = () => {
    const u = currentUser();
    return u ? orders().filter((o) => o.email === u.email) : [];
  };
  const placeOrder = (info) => {
    const lines = cartLines();
    if (!lines.length) return { ok: false, msg: 'ตะกร้าว่างอยู่' };
    const all = orders();
    const id = 'GD' + String(10240 + all.length + 1);
    const sub = cartTotal();
    const ship = sub >= 1000 ? 0 : 50;
    const o = {
      id,
      at: new Date().toISOString(),
      email: (currentUser() || {}).email || info.email,
      name: info.name, phone: info.phone, addr: info.addr, pay: info.pay,
      items: lines.map((l) => ({ sku: l.sku, name: l.product.name, price: l.product.price, qty: l.qty })),
      sub, ship, total: sub + ship,
      status: 'รอชำระเงิน',
    };
    all.push(o);
    write(K.ord, all);
    // ตัดสต็อกจริงตอนสั่ง ไม่งั้นเดโมจะขายของชิ้นเดียวกันได้ไม่จำกัด
    lines.forEach((l) => saveProduct(l.sku, { stock: Math.max(0, l.product.stock - l.qty) }));
    clearCart();
    return { ok: true, order: o };
  };
  const setOrderStatus = (id, status) => {
    write(K.ord, orders().map((o) => (o.id === id ? { ...o, status } : o)));
  };

  /* ---------- ตัวเลขบนไอคอนตะกร้าทุกจุดในหน้า ---------- */
  function paintCount() {
    const n = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = n;
      el.style.display = n ? '' : 'none';
    });
  }

  /* ---------- ทาข้อมูลที่หลังบ้านแก้ ทับลงการ์ดที่เขียนไว้ในไฟล์ ----------
     หน้าแรกยังเป็น HTML จริงทุกการ์ด (Google เก็บได้ · เปิดได้แม้ JS พัง)
     ส่วนนี้แค่แก้ตัวเลข/ชื่อให้ตรงกับที่แอดมินเพิ่งเปลี่ยน ไม่ได้สร้างหน้าใหม่ */
  const baht = (n) => '฿' + Number(n).toLocaleString('th-TH');
  function repaintCards() {
    const ov = overrides();
    if (!Object.keys(ov).length) return;
    document.querySelectorAll('[data-sku]').forEach((card) => {
      const p = find(card.dataset.sku);
      if (!p) { card.remove(); return; }
      const name = card.querySelector('.card__name, .console h3');
      if (name && !name.dataset.keep) name.textContent = p.name;
      const now = card.querySelector('.price b');
      if (now) now.textContent = baht(p.price);
      const was = card.querySelector('.price s');
      if (was) was.textContent = p.was ? baht(p.was) : '';
      const stock = card.querySelector('[data-stock]');
      if (stock) stock.textContent = p.stock > 0 ? (p.stock > 9 ? 'พร้อมส่ง' : `เหลือ ${p.stock} ชิ้น`) : 'ของหมด';
    });
  }

  document.addEventListener('DOMContentLoaded', () => { paintCount(); repaintCards(); });

  return {
    products, find, saveProduct, resetProducts,
    cart, cartLines, cartCount, cartTotal, addToCart, setQty, removeLine, clearCart,
    users, signup, login, logout, currentUser,
    orders, myOrders, placeOrder, setOrderStatus,
    baht, paintCount,
  };
})();
