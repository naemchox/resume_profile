import { mountLayout } from '../layout.js';
import { $, esc, objPos, qs, thDate, paragraphs, NEWS_CATEGORIES } from '../util.js';
import { newsCard, empty } from '../render.js';
import { getNews, getNewsById } from '../data.js';

mountLayout();

const id = qs('id');
const n = id ? await getNewsById(id) : null;

if (!n) {
  $('#main').innerHTML = `
    <section class="page-hero"><h1 class="page-hero__title display">ไม่พบข่าวนี้</h1></section>
    <section class="block">${empty('ข่าวอาจถูกลบหรือยังไม่เผยแพร่')}<p style="text-align:center;margin-top:16px"><a href="news.html" style="color:var(--jr-blue);font-weight:600">กลับไปหน้าข่าว</a></p></section>`;
} else {
  document.title = `${n.title} | สมาคมกีฬาตัวอย่าง`;
  const related = (await getNews({ category: n.category })).filter(x => x.id !== n.id).slice(0, 3);
  $('#main').innerHTML = `
    <section class="page-hero">
      <p class="page-hero__eyebrow"><a href="news.html?cat=${esc(n.category)}">${esc(NEWS_CATEGORIES[n.category] || 'ข่าว')}</a></p>
      <h1 class="page-hero__title display" style="max-width:1000px">${esc(n.title)}</h1>
    </section>
    <article class="article">
      ${n.coverUrl ? `<div class="article__hero"><img src="${esc(n.coverUrl)}" alt=""${objPos(n.coverPos)}></div>` : '<div style="height:40px"></div>'}
      <div class="article__meta"><b>${esc(NEWS_CATEGORIES[n.category] || '')}</b><span>${esc(thDate(n.publishedAt, { day: 'numeric', month: 'long', year: 'numeric' }))}</span></div>
      <div class="prose">${paragraphs(n.body || n.excerpt)}</div>
    </article>
    ${related.length ? `
    <section class="block block--gray">
      <h2 class="subhead display">ข่าวที่เกี่ยวข้อง</h2>
      <div class="grid-3">${related.map(r => newsCard(r)).join('')}</div>
    </section>` : ''}`;
}
