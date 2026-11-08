import { mountLayout } from '../layout.js';
import { $, esc, scrollToHash } from '../util.js';
import { pageHero, albumCard, empty } from '../render.js';
import { getAlbums, getSiteImage, siteImagePos } from '../data.js';
import { VIDEOS } from '../content.js';

mountLayout();

const [albums, heroImg] = await Promise.all([getAlbums(), getSiteImage('media-hero')]);

const video = v => `
  <div class="video-card">
    <div class="video-card__frame">${v.youtube
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(v.youtube)}" title="${esc(v.title)}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
      : `<div style="height:100%;display:grid;place-items:center;color:rgba(255,255,255,.6);font-size:14px">รอใส่ลิงก์ YouTube</div>`}</div>
    <div class="album-card__body" style="background:#fff"><div class="album-card__title">${esc(v.title)}</div></div>
  </div>`;

$('#main').innerHTML = `
  ${pageHero({ eyebrow: 'Media', title: 'มีเดีย', img: heroImg, imgPos: siteImagePos('media-hero') })}
  <section class="block block--gray" id="photos">
    <h2 class="subhead display">Photo Gallery</h2>
    <div class="grid-3" style="gap:24px">${albums.length ? albums.map(albumCard).join('') : empty('ยังไม่มีอัลบั้มรูป')}</div>
  </section>
  <section class="block" id="videos">
    <h2 class="subhead display">Video Gallery</h2>
    <div class="grid-3" style="gap:24px">${VIDEOS.map(video).join('')}</div>
  </section>`;

scrollToHash();
