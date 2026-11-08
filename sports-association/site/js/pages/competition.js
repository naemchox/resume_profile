import { mountLayout } from '../layout.js';
import { $, $$, esc, posCss, icon, thDate, thDateRange, paragraphs, scrollToHash } from '../util.js';
import { pageHero, empty } from '../render.js';
import { getEvents, getSiteImage, siteImagePos } from '../data.js';

mountLayout();

const [events, heroImg] = await Promise.all([getEvents(), getSiteImage('competition-hero')]);
const today = new Date(new Date().toDateString());
const isPast = e => (e.endDate || e.startDate) < today;
const upcoming = events.filter(e => !isPast(e));
const past = events.filter(isPast).reverse();

const calItem = e => `
  <a class="cal__item ${isPast(e) ? 'is-past' : ''}" href="#ev-${encodeURIComponent(e.id)}">
    <div class="cal__date">
      <div class="cal__day display">${e.startDate.getDate()}</div>
      <div class="cal__mon">${esc(thDate(e.startDate, { month: 'short', year: '2-digit' }))}</div>
    </div>
    <div>
      <span class="cal__type ${e.type === 'major' ? 'cal__type--major' : ''}">${e.type === 'major' ? 'รายการหลัก' : 'รายการทั่วไป'}</span>
      <div class="cal__title">${esc(e.title)}</div>
      <div class="cal__place">${esc(thDateRange(e.startDate, e.endDate))} · ${esc(e.location)}</div>
    </div>
    <span class="read-link" style="font-size:13px">รายละเอียด <span class="pill-arrow pill-arrow--blue">${icon.arrowR}</span></span>
  </a>`;

const detail = e => `
  <article class="two-col" id="ev-${esc(e.id)}" style="padding:40px 0;border-top:1px solid var(--jr-line);scroll-margin-top:80px">
    <div>
      ${e.coverUrl ? `<img src="${esc(e.coverUrl)}" alt="" loading="lazy" style="width:100%;aspect-ratio:16/10;object-fit:cover;${posCss(e.coverPos)}">` : `<div style="aspect-ratio:16/10;background:var(--jr-sky);display:grid;place-items:center;color:var(--jr-blue)" class="display"><span style="font-size:64px">JR</span></div>`}
    </div>
    <div>
      <span class="cal__type ${e.type === 'major' ? 'cal__type--major' : ''}">${e.type === 'major' ? 'รายการหลัก' : 'รายการทั่วไป'}</span>
      <h3 class="display" style="font-size:40px;text-transform:none;margin:8px 0 12px">${esc(e.title)}</h3>
      <dl class="info-list" style="margin:0 0 24px">
        <div><dt>วันที่</dt><dd>${esc(thDateRange(e.startDate, e.endDate))}</dd></div>
        <div><dt>สถานที่</dt><dd>${esc(e.location)}</dd></div>
      </dl>
      <div class="prose" style="font-size:16px">${paragraphs(e.description)}</div>
      ${e.registerUrl && !isPast(e) ? `<a class="btn-wide btn-wide--blue" style="margin-top:28px" href="${esc(e.registerUrl)}" target="_blank" rel="noopener">สมัครเข้าร่วม ${icon.arrowUR}</a>` : ''}
    </div>
  </article>`;

$('#main').innerHTML = `
  ${pageHero({ eyebrow: 'Competition', title: 'การแข่งขัน', img: heroImg, imgPos: siteImagePos('competition-hero'), extra: `
    <div class="chips" id="chips">
      <button class="chip is-active" data-show="upcoming">กำลังจะมาถึง</button>
      <button class="chip" data-show="past">ที่ผ่านมา</button>
    </div>` })}
  <section class="block block--gray" id="calendar">
    <h2 class="subhead display">Event Calendar</h2>
    <p style="margin:-12px 0 24px;color:var(--jr-text-muted)">รายการหลักจัดปีละ 2 ครั้ง ครั้งละ 4 วัน และมีรายการระดับภูมิภาคประมาณทุก 2 เดือน · กำหนดการอาจเปลี่ยนแปลงได้</p>
    <div class="cal" id="cal"></div>
  </section>
  <section class="block" id="details">
    <h2 class="subhead display">Competition Details</h2>
    <div id="detailList">${upcoming.length ? upcoming.map(detail).join('') : empty('ยังไม่มีรายการแข่งขันที่กำลังจะมาถึง')}</div>
    <div id="pastDetails">${past.map(detail).join('')}</div>
  </section>`;

const drawCal = which => {
  const list = which === 'past' ? past : upcoming;
  $('#cal').innerHTML = list.length ? list.map(calItem).join('') : empty(which === 'past' ? 'ยังไม่มีรายการที่ผ่านมา' : 'ยังไม่มีรายการที่กำลังจะมาถึง');
};
$$('#chips .chip').forEach(c => c.onclick = () => {
  $$('#chips .chip').forEach(x => x.classList.toggle('is-active', x === c));
  drawCal(c.dataset.show);
  $('#calendar').scrollIntoView({ behavior: 'smooth' });
});
drawCal('upcoming');
scrollToHash();
