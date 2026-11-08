// โครงที่ทุกหน้าใช้ร่วมกัน: แถบซ้าย (rail), เมนู, ticker, partners, footer
import { icon, esc, $, $$ } from './util.js';
import { MENU, PARTNERS, SITE } from './content.js';

const logo = `
  <span class="logo-mark" aria-label="${esc(SITE.nameEn)}">
    <span class="logo-mark__badge">JR</span>
    <span class="logo-mark__text">THAILAND</span>
  </span>`;

function railHTML() {
  return `
  <header class="rail">
    <a class="rail__logo" href="index.html">${logo}</a>
    <button class="rail__btn" id="menuBtn" aria-expanded="false" aria-controls="menu">
      <span data-ico>${icon.menu}</span><span data-lbl>Menu</span>
    </button>
    <a class="rail__btn" href="contact.html">${icon.mail}<span>Contact</span></a>
  </header>`;
}

function menuHTML() {
  const items = MENU.map((m, i) => m.sub
    ? `<button class="menu__item ${m.accent ? 'menu__item--accent' : ''}" data-sub="${i}"><span class="display">${esc(m.label)}</span>${icon.arrowR}</button>`
    : `<a class="menu__item ${m.accent ? 'menu__item--accent' : ''}" href="${m.href}"><span class="display">${esc(m.label)}</span>${icon.arrowR}</a>`
  ).join('');
  const subs = MENU.map((m, i) => m.sub ? `
    <div class="menu__sub" data-panel="${i}">
      <button class="menu__back" data-back>${icon.arrowL} กลับ</button>
      <h3 class="display">${esc(m.label)}</h3>
      ${m.sub.map(([t, h]) => `<a href="${h}">${esc(t)}${icon.arrowR}</a>`).join('')}
    </div>` : '').join('');
  return `
  <div class="menu" id="menu" aria-hidden="true">
    <div class="menu__backdrop" data-close></div>
    <button class="menu__close" data-close aria-label="ปิดเมนู">${icon.close}</button>
    <div class="menu__panels">
      <nav class="menu__main" aria-label="เมนูหลัก">
        <div class="menu__list">${items}</div>
        <div class="menu__foot">
          <a href="competition.html#calendar">${icon.cal} ปฏิทินการแข่ง</a>
          <a href="${SITE.marathonUrl}">${icon.arrowUR} JR Marathon</a>
          <a href="downloads.html">${icon.download} ดาวน์โหลด</a>
          <a href="contact.html">${icon.info} ติดต่อเรา</a>
        </div>
      </nav>
      ${subs}
    </div>
  </div>`;
}

export function tickerHTML(items) {
  if (!items.length) return '';
  const row = items.map(t => `<span>${esc(t)}</span>`).join('');
  return `
  <div class="ticker" role="marquee" aria-label="ข่าวล่าสุด">
    <div class="ticker__track"><div class="ticker__inner">${row}${row}</div></div>
    <div class="ticker__partner">${esc(SITE.nameEn)}</div>
  </div>`;
}

function footerHTML() {
  const partners = PARTNERS.map(p => `
    <div class="partner"><span class="partner__mark">${esc(p.mark)}</span><span class="partner__sub">${esc(p.sub)}</span></div>`).join('');
  const s = SITE.social;
  return `
  <section class="partners" aria-label="พันธมิตร">
    <h2 class="partners__title">Official Partners</h2>
    <div class="partners__row">${partners}</div>
  </section>
  <footer class="footer">
    <div class="footer__links">
      <div>
        <a href="${SITE.marathonUrl}">JR Marathon ${icon.arrowUR}</a>
        <a href="competition.html#calendar">ปฏิทินการแข่งขัน ${icon.arrowUR}</a>
        <a href="downloads.html#timing">Timing Tracks ${icon.arrowUR}</a>
      </div>
      <div>
        <a href="contact.html">ติดต่อสมาคม ${icon.arrowUR}</a>
      </div>
    </div>
    <div class="footer__cols">
      <div>
        <h3 class="footer__h">Follow us</h3>
        <div class="social">
          <a href="${s.facebook}" aria-label="Facebook">${icon.facebook}</a>
          <a href="${s.instagram}" aria-label="Instagram">${icon.instagram}</a>
          <a href="${s.youtube}" aria-label="YouTube">${icon.youtube}</a>
          <a href="${s.tiktok}" aria-label="TikTok">${icon.tiktok}</a>
        </div>
      </div>
      <div>
        <h3 class="footer__h">Address</h3>
        <p class="footer__addr">${esc(SITE.name)}<br>${esc(SITE.address)}<br>${esc(SITE.phone)} · ${esc(SITE.email)}</p>
      </div>
      <div>
        <a class="app-card" href="${SITE.marathonUrl}">
          <div class="app-card__t">JR Marathon</div>
          <div class="app-card__s">สมัครเลย</div>
        </a>
      </div>
    </div>
    <nav class="footer__legal" aria-label="ลิงก์ท้ายเว็บ">
      <a href="organisation.html">เกี่ยวกับสมาคม</a>
      <a href="news.html">ข่าว</a>
      <a href="competition.html">การแข่งขัน</a>
      <a href="downloads.html#safe-sport">Safe Sport</a>
      <a href="contact.html">ติดต่อเรา</a>
    </nav>
    <p class="footer__copy">© ${new Date().getFullYear()} ${esc(SITE.name)} (${esc(SITE.nameEn)}). สงวนลิขสิทธิ์</p>
    <button class="backtop" id="backTop">Back To Top ${icon.arrowUp}</button>
  </footer>`;
}

function bindMenu() {
  const menu = $('#menu');
  const btn = $('#menuBtn');
  const list = $('.menu__list', menu);
  const setOpen = open => {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
    $('[data-ico]', btn).innerHTML = open ? icon.close : icon.menu;
    $('[data-lbl]', btn).textContent = open ? 'Close' : 'Menu';
    if (!open) showSub(null);
  };
  const showSub = i => {
    $$('.menu__sub', menu).forEach(p => p.classList.toggle('is-open', p.dataset.panel === String(i)));
    $$('[data-sub]', menu).forEach(b => b.classList.toggle('is-active', b.dataset.sub === String(i)));
    list.classList.toggle('has-active', i !== null);
  };
  btn.onclick = () => setOpen(!menu.classList.contains('is-open'));
  $$('[data-close]', menu).forEach(el => el.onclick = () => setOpen(false));
  $$('[data-sub]', menu).forEach(b => b.onclick = () => showSub(b.dataset.sub));
  $$('[data-back]', menu).forEach(b => b.onclick = () => showSub(null));
  $$('.menu__sub a', menu).forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
}

export function mountLayout() {
  document.body.insertAdjacentHTML('afterbegin', railHTML() + menuHTML());
  document.body.insertAdjacentHTML('beforeend', footerHTML());
  bindMenu();
  $('#backTop').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
}
