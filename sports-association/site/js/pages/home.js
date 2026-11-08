import { mountLayout, tickerHTML } from '../layout.js';
import { $, $$, esc, objPos, posCss, icon, bindCarousel, arrowsHTML, NEWS_CATEGORIES } from '../util.js';
import { getBanners, getNews, getEvents, getAlbums, getSiteImage, siteImagePos } from '../data.js';
import { newsCard, albumMediaCard, eventCard, empty } from '../render.js';
import { CATEGORIES, IMG, PHOTOS } from '../content.js';

mountLayout();

// ไอคอนที่วางไว้ใน HTML
$$('[data-cal]').forEach(el => el.innerHTML = icon.cal);
$$('[data-arr], [data-arrow-ur]').forEach(el => el.innerHTML = icon.arrowUR);
$$('[data-arrow-r]').forEach(el => el.innerHTML = icon.arrowR);
$$('[data-arrows]').forEach(el => el.innerHTML = arrowsHTML());
$$('[data-arrows-light]').forEach(el => el.outerHTML = arrowsHTML(true));

/* ---------- Hero ---------- */
async function renderHero() {
  const hero = $('#hero');
  const banners = await getBanners();
  if (!banners.length) { hero.remove(); return; }
  hero.innerHTML = banners.map((b, i) => `
    <div class="hero__slide ${i === 0 ? 'is-active' : ''}" data-i="${i}">
      <img src="${esc(b.imageUrl)}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}${objPos(b.imagePos)}>
    </div>`).join('') + `
    <div class="hero__content" id="heroContent"></div>
    ${banners.length > 1 ? `<div class="hero__thumbs">${banners.map((b, i) => `
      <button class="hero__thumb ${i === 0 ? 'is-active' : ''}" data-go="${i}" aria-label="${esc(b.title)}"><img src="${esc(b.imageUrl)}" alt="" loading="lazy"${objPos(b.imagePos)}></button>`).join('')}</div>` : ''}`;

  let cur = 0, timer;
  const show = i => {
    cur = (i + banners.length) % banners.length;
    const b = banners[cur];
    $$('.hero__slide', hero).forEach(s => s.classList.toggle('is-active', +s.dataset.i === cur));
    $$('.hero__thumb', hero).forEach(t => t.classList.toggle('is-active', +t.dataset.go === cur));
    $('#heroContent').innerHTML = `
      <div class="hero__meta"><b>${esc(b.subtitle || 'Sample Sports Association')}</b><i></i><span>SAMPLESPORT</span></div>
      <h2 class="hero__title display">${esc(b.title)}</h2>
      ${b.linkUrl ? `<a class="read-link" href="${esc(b.linkUrl)}">${esc(b.linkLabel || 'อ่าน')} <span class="pill-arrow">${icon.arrowUR}</span></a>` : ''}`;
  };
  const auto = () => { clearInterval(timer); timer = setInterval(() => show(cur + 1), 7000); };
  $$('.hero__thumb', hero).forEach(t => t.onclick = () => { show(+t.dataset.go); auto(); });
  show(0);
  if (banners.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) auto();
}

/* ---------- Events ---------- */
async function renderEvents() {
  const grid = $('#eventsGrid');
  const now = new Date(new Date().toDateString());
  const upcoming = (await getEvents()).filter(e => (e.endDate || e.startDate) >= now);
  const draw = type => {
    const list = upcoming.filter(e => type === 'all' || e.type === type).slice(0, 3);
    grid.innerHTML = list.length
      ? list.map((e, i) => eventCard(e, i === 0 ? 'รายการถัดไป' : 'กำลังจะมาถึง')).join('')
      : `<div class="event-card">${empty('ยังไม่มีรายการแข่งขันที่กำลังจะมาถึง')}</div>`;
  };
  $$('.events__tab').forEach(t => t.onclick = () => {
    $$('.events__tab').forEach(x => x.classList.toggle('is-active', x === t));
    draw(t.dataset.type);
  });
  draw('all');
}

/* ---------- News ---------- */
async function renderNews() {
  const news = await getNews({ limit: 12 });
  $('#ticker').outerHTML = tickerHTML(news.slice(0, 4).map(n => n.title));
  const root = $('#latestNews');
  const track = $('#newsTrack');
  const cats = [['', 'ทั้งหมด'], ...Object.entries(NEWS_CATEGORIES)];
  $('#newsChips').innerHTML = cats.map(([k, t], i) => `<button class="chip ${i === 0 ? 'is-active' : ''}" data-cat="${k}">${esc(t)}</button>`).join('');
  const draw = cat => {
    const list = news.filter(n => !cat || n.category === cat);
    track.innerHTML = list.length ? list.map(n => newsCard(n)).join('') : empty('ยังไม่มีข่าวในหมวดนี้');
    track.scrollLeft = 0;
    track.dispatchEvent(new Event('scroll'));
  };
  $$('#newsChips .chip').forEach(c => c.onclick = () => {
    $$('#newsChips .chip').forEach(x => x.classList.toggle('is-active', x === c));
    draw(c.dataset.cat);
  });
  draw('');
  bindCarousel(root);
}

/* ---------- Static carousels ---------- */
function renderCategories() {
  $('#catTrack').innerHTML = CATEGORIES.map(c => `
    <a class="tile" href="about-jump-rope.html#cat-${c.key}">
      <img src="${IMG(c.img, 900)}" alt="" loading="lazy">
      <div class="tile__label">
        <div class="tile__title display">${esc(c.title)}</div>
        <span class="read-link">${esc(c.th)} <span class="pill-arrow">${icon.arrowUR}</span></span>
      </div>
    </a>`).join('');
  bindCarousel($('#catTrack').closest('.carousel'));
}

function renderOrg() {
  const items = [
    ['About Sample Sports', 'organisation.html#about', PHOTOS.outdoor2],
    ['Board of Directors', 'organisation.html#board', PHOTOS.coach],
    ['Judges', 'organisation.html#judges', PHOTOS.arena],
    ['Coaches', 'organisation.html#coaches', PHOTOS.gymMan2],
    ['Club Members', 'organisation.html#clubs', PHOTOS.woman],
    ['Official Affiliations', 'organisation.html#affiliations', PHOTOS.court],
  ];
  $('#orgTrack').innerHTML = items.map(([t, h, img]) => `
    <a class="tile" href="${h}">
      <img src="${IMG(img, 900)}" alt="" loading="lazy">
      <div class="tile__label">
        <div class="tile__title display">${esc(t)}</div>
        <span class="read-link">ดูเพิ่ม <span class="pill-arrow">${icon.arrowUR}</span></span>
      </div>
    </a>`).join('');
  bindCarousel($('#orgTrack').closest('.carousel'));
}

async function renderMedia() {
  const albums = await getAlbums();
  const track = $('#mediaTrack');
  track.innerHTML = albums.length ? albums.slice(0, 8).map((a, i) => albumMediaCard(a, { featured: i === 0 })).join('') : empty('ยังไม่มีอัลบั้มรูป');
  bindCarousel(track.closest('.carousel'));
}

async function renderImages() {
  $('#featImg').src = await getSiteImage('national-team', 1400);
  $('#featImg').style.objectPosition = posCss(siteImagePos('national-team')).replace('object-position:', '');
  $('#promoImg').src = IMG(PHOTOS.rope, 900);
}

renderCategories();
renderOrg();
renderHero();
renderEvents();
renderNews();
renderMedia();
renderImages();
