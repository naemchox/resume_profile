import { mountLayout } from '../layout.js';
import { $, esc, icon, scrollToHash } from '../util.js';
import { pageHero } from '../render.js';
import { getSiteImage, siteImagePos } from '../data.js';
import { DOWNLOADS } from '../content.js';

mountLayout();

const item = f => {
  const external = f.type === 'LINK';
  return `
  <div class="dl-item">
    <span class="dl-item__icon">${esc(f.type)}</span>
    <div><div class="dl-item__name">${esc(f.name)}</div><div class="dl-item__meta">${esc(f.meta)}</div></div>
    <a class="dl-item__action" href="${esc(f.href)}" ${external ? 'target="_blank" rel="noopener"' : 'download'}>
      ${external ? 'เปิดลิงก์' : 'ดาวน์โหลด'} <span class="pill-arrow pill-arrow--blue">${external ? icon.arrowUR : icon.download}</span>
    </a>
  </div>`;
};

const track = f => `
  <div class="dl-item">
    <span class="dl-item__icon">${esc(f.type)}</span>
    <div><div class="dl-item__name">${esc(f.name)}</div><div class="dl-item__meta">สัญญาณเสียงสำหรับฝึกซ้อม</div></div>
    <div class="dl-item__action">
      <audio controls preload="none" src="${esc(f.href)}"></audio>
      <a href="${esc(f.href)}" download aria-label="ดาวน์โหลด ${esc(f.name)}"><span class="pill-arrow pill-arrow--blue">${icon.download}</span></a>
    </div>
  </div>`;

const section = (id, title, desc, html, gray) => `
  <section class="block ${gray ? 'block--gray' : ''}" id="${id}">
    <h2 class="subhead display">${esc(title)}</h2>
    ${desc ? `<p style="margin:-12px 0 24px;color:var(--jr-text-muted)">${esc(desc)}</p>` : ''}
    <div class="dl-list">${html}</div>
  </section>`;

$('#main').innerHTML = `
  ${pageHero({ eyebrow: 'Downloads', title: 'ดาวน์โหลด', img: await getSiteImage('downloads-hero'), imgPos: siteImagePos('downloads-hero') })}
  ${section('rules', 'IJRU Rules', 'กติกาการแข่งขันสากลของ International Jump Rope Union', DOWNLOADS.rules.map(item).join(''), true)}
  ${section('anti-doping', 'Anti-Doping', 'ข้อมูลสารต้องห้ามและการตรวจสารกระตุ้นสำหรับนักกีฬา', DOWNLOADS.antiDoping.map(item).join(''))}
  ${section('safe-sport', 'Safe Sport', 'นโยบายคุ้มครองนักกีฬาจากการล่วงละเมิดและการกลั่นแกล้ง', DOWNLOADS.safeSport.map(item).join(''), true)}
  ${section('timing', 'Timing Tracks', 'ฟังตัวอย่างหรือดาวน์โหลดสัญญาณเสียงจับเวลาไปใช้ฝึกซ้อม', DOWNLOADS.timing.map(track).join(''))}`;

scrollToHash();
