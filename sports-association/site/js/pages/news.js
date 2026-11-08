import { mountLayout } from '../layout.js';
import { $, $$, esc, objPos, icon, qs, timeAgo, NEWS_CATEGORIES } from '../util.js';
import { newsCard, pageHero, empty } from '../render.js';
import { getNews, getSiteImage, siteImagePos } from '../data.js';

mountLayout();

const PAGE = 12;
const cats = [['', 'ทั้งหมด'], ...Object.entries(NEWS_CATEGORIES)];
let cat = NEWS_CATEGORIES[qs('cat')] ? qs('cat') : '';
let shown = PAGE;

$('#main').innerHTML = `
  ${pageHero({ eyebrow: 'News', title: 'ข่าว', img: await getSiteImage('news-hero'), imgPos: siteImagePos('news-hero'), extra: `
    <div class="chips" id="chips">${cats.map(([k, t]) => `<button class="chip ${k === cat ? 'is-active' : ''}" data-cat="${k}">${esc(t)}</button>`).join('')}</div>` })}
  <div id="lead"></div>
  <section class="block block--gray" id="newsList">
    <h2 class="subhead display">ข่าวล่าสุด</h2>
    <div class="grid-3" id="grid"></div>
    <div style="text-align:center;margin-top:32px"><button class="btn-wide btn-wide--blue" id="more" hidden>ดูข่าวเพิ่ม ${icon.arrowR}</button></div>
  </section>`;

const all = await getNews();

function draw() {
  const list = all.filter(n => !cat || n.category === cat);
  const [lead, ...rest] = list;
  $('#lead').innerHTML = lead ? `
    <a class="lead-split" href="article.html?id=${encodeURIComponent(lead.id)}">
      <div class="lead-split__img">${lead.coverUrl ? `<img src="${esc(lead.coverUrl)}" alt=""${objPos(lead.coverPos)}>` : ''}</div>
      <div class="lead-split__body">
        <div class="lead-split__time">${esc(timeAgo(lead.publishedAt))}</div>
        <div class="lead-split__cat">${esc(NEWS_CATEGORIES[lead.category] || '')}</div>
        <h2 class="lead-split__title">${esc(lead.title)}</h2>
        <p class="lead-split__desc">${esc(lead.excerpt)}</p>
        <span class="read-link">อ่าน <span class="pill-arrow">${icon.arrowUR}</span></span>
      </div>
    </a>` : '';
  $('#grid').innerHTML = rest.length ? rest.slice(0, shown).map(n => newsCard(n)).join('') : empty(lead ? 'ไม่มีข่าวเพิ่มเติม' : 'ยังไม่มีข่าวในหมวดนี้');
  $('#more').hidden = rest.length <= shown;
}

$$('#chips .chip').forEach(c => c.onclick = () => {
  cat = c.dataset.cat;
  shown = PAGE;
  $$('#chips .chip').forEach(x => x.classList.toggle('is-active', x === c));
  history.replaceState(null, '', cat ? `?cat=${cat}` : location.pathname);
  draw();
});
$('#more').onclick = () => { shown += PAGE; draw(); };
draw();
