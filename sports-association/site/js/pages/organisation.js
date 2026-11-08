import { mountLayout } from '../layout.js';
import { $, esc, paragraphs, scrollToHash } from '../util.js';
import { pageHero, personCard } from '../render.js';
import { getSiteImage, siteImagePos } from '../data.js';
import { ABOUT_TEXT, AFFILIATIONS, BOARD, JUDGES, COACHES, CLUBS, SITE } from '../content.js';

mountLayout();

const box = (p, top = false) => `<div class="org__box ${top ? 'org__box--top' : ''}"><b>${esc(p.name)}</b><span>${esc(p.role)}</span></div>`;

$('#main').innerHTML = `
  ${pageHero({ eyebrow: 'Organisation', title: 'เกี่ยวกับสมาคม', img: await getSiteImage('organisation-hero'), imgPos: siteImagePos('organisation-hero') })}

  <section class="block" id="about">
    <div class="two-col">
      <h2 class="subhead display">About Sample Sports</h2>
      <div class="prose">${paragraphs(ABOUT_TEXT)}</div>
    </div>
  </section>

  <section class="block block--gray" id="affiliations">
    <h2 class="subhead display">Official Affiliations</h2>
    <div class="aff">${AFFILIATIONS.map(a => `
      <div class="aff__card">
        <div class="aff__abbr display">${esc(a.abbr)}</div>
        <div class="aff__name">${esc(a.name)}</div>
        <p class="aff__desc">${esc(a.desc)}</p>
      </div>`).join('')}</div>
  </section>

  <section class="block block--gray" id="board" style="padding-top:0">
    <h2 class="subhead display">Board of Directors</h2>
    <div class="org">
      <div class="org__row">${box(BOARD.president, true)}</div>
      <div class="org__row">${BOARD.vice.map(p => box(p)).join('')}</div>
      <div class="org__row">${BOARD.members.map(p => box(p)).join('')}</div>
    </div>
  </section>

  <section class="block" id="judges">
    <h2 class="subhead display">Judges</h2>
    <div class="grid-4">${JUDGES.map(personCard).join('')}</div>
  </section>

  <section class="block block--gray" id="coaches">
    <h2 class="subhead display">Coaches</h2>
    <div class="grid-4">${COACHES.map(personCard).join('')}</div>
  </section>

  <section class="block" id="clubs">
    <h2 class="subhead display">Club Members</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>#</th><th>สโมสร</th><th>จังหวัด</th></tr></thead>
        <tbody>${CLUBS.map(([n, p], i) => `<tr><td>${i + 1}</td><td>${esc(n)}</td><td>${esc(p)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <p style="margin-top:16px;font-size:14px;color:var(--jr-text-muted)">สโมสรที่ต้องการสมัครเป็นสมาชิก ติดต่อ ${esc(SITE.email)}</p>
  </section>`;

scrollToHash();
