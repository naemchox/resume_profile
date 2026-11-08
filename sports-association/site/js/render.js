// ชิ้นส่วน HTML ที่หลายหน้าใช้ซ้ำ
import { esc, objPos, icon, timeAgo, thDate, thDateRange, NEWS_CATEGORIES } from './util.js';

export function newsCard(n, { featured = false } = {}) {
  return `
  <a class="news-card ${featured ? 'is-featured' : ''}" href="article.html?id=${encodeURIComponent(n.id)}">
    <div class="news-card__img">${n.coverUrl ? `<img src="${esc(n.coverUrl)}" alt="" loading="lazy"${objPos(n.coverPos)}>` : ''}</div>
    <div class="news-card__body">
      <span class="news-card__cat">${esc(NEWS_CATEGORIES[n.category] || n.category)}</span>
      <h3 class="news-card__title">${esc(n.title)}</h3>
      <span class="news-card__time">${esc(timeAgo(n.publishedAt))}</span>
    </div>
  </a>`;
}

export function albumMediaCard(a, { featured = false } = {}) {
  return `
  <a class="news-card ${featured ? 'is-featured' : ''}" href="album.html?id=${encodeURIComponent(a.id)}">
    <div class="news-card__img">
      ${a.coverUrl ? `<img src="${esc(a.coverUrl)}" alt="" loading="lazy">` : ''}
      <span class="media-badge">${icon.camera} ${Number(a.photoCount) || 0}</span>
    </div>
    <div class="news-card__body">
      <span class="news-card__cat">อัลบั้มรูป</span>
      <h3 class="news-card__title">${esc(a.title)}</h3>
      <span class="news-card__time">${esc(thDate(a.date))}</span>
    </div>
  </a>`;
}

export function albumCard(a) {
  return `
  <a class="album-card" href="album.html?id=${encodeURIComponent(a.id)}">
    <div class="album-card__img">
      ${a.coverUrl ? `<img src="${esc(a.coverUrl)}" alt="" loading="lazy">` : ''}
      <span class="media-badge">${icon.camera} ${Number(a.photoCount) || 0}</span>
    </div>
    <div class="album-card__body">
      <div class="album-card__title">${esc(a.title)}</div>
      <div class="album-card__meta">${esc(thDate(a.date))}</div>
    </div>
  </a>`;
}

export function eventCard(e, label) {
  return `
  <article class="event-card">
    <div class="event-card__top"><span>${esc(label)} - ${esc(thDateRange(e.startDate, e.endDate))}</span><span>${e.type === 'major' ? 'รายการหลัก' : 'รายการทั่วไป'}</span></div>
    <div class="event-card__body">
      <span class="event-card__badge">SA</span>
      <div>
        <h3 class="event-card__title">${esc(e.title)}</h3>
        <p class="event-card__place">${esc(e.location)}</p>
      </div>
    </div>
    <a class="event-card__cta" href="competition.html#ev-${encodeURIComponent(e.id)}">รายละเอียด <span class="pill-arrow pill-arrow--blue">${icon.arrowUR}</span></a>
  </article>`;
}

export function personCard(p) {
  const initials = String(p.name).replace(/\[.*?\]\s*/, '').trim().slice(0, 2);
  return `
  <div class="person">
    <div class="person__img">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : `<span class="initials">${esc(initials)}</span>`}</div>
    <div class="person__body"><div class="person__name">${esc(p.name)}</div><div class="person__role">${esc(p.role)}</div></div>
  </div>`;
}

export function pageHero({ eyebrow, title, img, imgPos, extra = '' }) {
  return `
  <section id="pageHero" class="page-hero ${img ? 'page-hero--img' : ''}">
    ${img ? `<img src="${esc(img)}" alt=""${objPos(imgPos)}>` : ''}
    ${eyebrow ? `<p class="page-hero__eyebrow">${esc(eyebrow)}</p>` : ''}
    <h1 class="page-hero__title display">${esc(title)}</h1>
    ${extra}
  </section>`;
}

export const empty = msg => `<div class="empty">${esc(msg)}</div>`;
