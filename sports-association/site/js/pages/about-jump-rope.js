import { mountLayout } from '../layout.js';
import { $, esc, objPos, icon, scrollToHash } from '../util.js';
import { pageHero, personCard } from '../render.js';
import { getSiteImage, siteImagePos } from '../data.js';
import { CATEGORIES, BENEFITS, VIDEOS, NATIONAL_TEAM, RESULTS, IMG } from '../content.js';

mountLayout();

const [heroImg, teamImg] = await Promise.all([getSiteImage('about-jumprope-hero'), getSiteImage('national-team', 1400)]);
const clip = VIDEOS[0];

$('#main').innerHTML = `
  ${pageHero({ eyebrow: 'About Jump Rope', title: 'กีฬากระโดดเชือก', img: heroImg, imgPos: siteImagePos('about-jumprope-hero') })}

  <section class="block" id="what">
    <div class="two-col">
      <h2 class="subhead display">What is Jump Rope?</h2>
      <div class="prose">
        <p>กระโดดเชือก (Jump Rope / Rope Skipping) เป็นกีฬาที่ผสานความเร็ว ความแข็งแรง และศิลปะการเคลื่อนไหวเข้าด้วยกัน นักกีฬาแข่งทั้งแบบเดี่ยว คู่ และทีม ภายใต้กติกาสากลของ International Jump Rope Union (IJRU)</p>
        <p>นอกจากการแข่งขัน กระโดดเชือกยังเป็นการออกกำลังกายที่เข้าถึงง่ายที่สุดอย่างหนึ่ง ใช้อุปกรณ์เพียงเชือกเส้นเดียว เหมาะกับทุกวัย</p>
      </div>
    </div>
  </section>

  <section class="block block--gray" id="benefits">
    <div class="two-col">
      <div>
        <h2 class="subhead display">Jump Rope Benefits</h2>
        <p class="prose" style="font-size:16px">ประโยชน์ของการกระโดดเชือกต่อร่างกายและจิตใจ</p>
      </div>
      <div class="video-card__frame">${clip?.youtube
        ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(clip.youtube)}" title="${esc(clip.title)}" loading="lazy" allowfullscreen style="width:100%;height:100%;border:0"></iframe>`
        : `<div style="height:100%;display:grid;place-items:center;color:rgba(255,255,255,.6);font-size:14px">คลิปวิดีโอ (รอใส่ลิงก์ YouTube)</div>`}</div>
    </div>
    <div class="benefits">${BENEFITS.map(([t, d], i) => `
      <div class="benefit"><div class="benefit__n display">${String(i + 1).padStart(2, '0')}</div><div class="benefit__t">${esc(t)}</div><p class="benefit__d">${esc(d)}</p></div>`).join('')}</div>
  </section>

  <section class="block" id="categories">
    <h2 class="subhead display">Jump Rope Categories</h2>
    <div class="cat-grid">${CATEGORIES.map(c => `
      <div class="tile" id="cat-${c.key}" style="scroll-margin-top:80px">
        <img src="${IMG(c.img, 800)}" alt="" loading="lazy">
        <div class="tile__label" style="right:24px">
          <div class="tile__title display">${esc(c.title)}</div>
          <p style="font-size:14px;opacity:.92">${esc(c.desc)}</p>
        </div>
      </div>`).join('')}</div>
  </section>

  <section class="feature" id="national-team" style="margin-top:0">
    <div class="feature__text">
      <h2 class="feature__title" style="font-size:48px">Thailand National Team</h2>
      <p class="feature__desc">นักกีฬาทีมชาติไทยผ่านการคัดเลือกจากผลการแข่งขันชิงแชมป์ประเทศไทย และเป็นตัวแทนประเทศในรายการระดับเอเชียและโลก</p>
      <a class="btn-rect" href="#results">ผลงานระดับนานาชาติ ${icon.arrowR}</a>
    </div>
    <div class="feature__media"><img src="${esc(teamImg)}" alt=""${objPos(siteImagePos('national-team'))}></div>
  </section>
  <section class="block block--gray">
    <div class="grid-4">${NATIONAL_TEAM.map(personCard).join('')}</div>
  </section>

  <section class="block" id="results">
    <h2 class="subhead display">International Results</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>ปี</th><th>รายการ</th><th>นักกีฬา</th><th>ผลงาน</th></tr></thead>
        <tbody>${RESULTS.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  </section>`;

scrollToHash();
