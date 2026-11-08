import { mountLayout } from '../layout.js';
import { $, $$, esc, icon, qs, thDate } from '../util.js';
import { empty } from '../render.js';
import { getAlbum } from '../data.js';

mountLayout();

const album = qs('id') ? await getAlbum(qs('id')) : null;

if (!album) {
  $('#main').innerHTML = `
    <section class="page-hero"><h1 class="page-hero__title display">ไม่พบอัลบั้มนี้</h1></section>
    <section class="block">${empty('อัลบั้มอาจถูกลบหรือยังไม่เผยแพร่')}<p style="text-align:center;margin-top:16px"><a href="media.html" style="color:var(--jr-blue);font-weight:600">กลับไปหน้ามีเดีย</a></p></section>`;
} else {
  document.title = `${album.title} | สมาคมกีฬาตัวอย่าง`;
  const photos = album.photos || [];
  $('#main').innerHTML = `
    <section class="page-hero">
      <p class="page-hero__eyebrow"><a href="media.html#photos">Photo Gallery</a></p>
      <h1 class="page-hero__title display">${esc(album.title)}</h1>
      <p style="opacity:.85">${esc(thDate(album.date, { day: 'numeric', month: 'long', year: 'numeric' }))} · ${photos.length} รูป</p>
    </section>
    <section class="block block--gray">
      ${photos.length ? `<div class="photo-grid">${photos.map((p, i) => `
        <button data-i="${i}" aria-label="ดูรูปที่ ${i + 1}"><img src="${esc(p.thumb || p.url)}" alt="${esc(p.caption)}" loading="lazy"></button>`).join('')}</div>` : empty('ยังไม่มีรูปในอัลบั้มนี้')}
    </section>
    <div class="lightbox" id="lb" role="dialog" aria-modal="true" aria-label="ดูรูป">
      <button class="lightbox__btn lightbox__close" data-lb="close" aria-label="ปิด">${icon.close}</button>
      <button class="lightbox__btn lightbox__prev" data-lb="prev" aria-label="รูปก่อนหน้า">${icon.arrowL}</button>
      <img id="lbImg" alt="">
      <button class="lightbox__btn lightbox__next" data-lb="next" aria-label="รูปถัดไป">${icon.arrowR}</button>
      <div class="lightbox__cap" id="lbCap"></div>
    </div>`;

  const lb = $('#lb');
  let cur = 0;
  const show = i => {
    cur = (i + photos.length) % photos.length;
    $('#lbImg').src = photos[cur].url;
    $('#lbCap').textContent = `${photos[cur].caption ? photos[cur].caption + ' · ' : ''}${cur + 1} / ${photos.length}`;
    lb.classList.add('is-open');
  };
  const close = () => lb.classList.remove('is-open');
  $$('.photo-grid button').forEach(b => b.onclick = () => show(+b.dataset.i));
  $$('[data-lb]', lb).forEach(b => b.onclick = () => ({ close, prev: () => show(cur - 1), next: () => show(cur + 1) })[b.dataset.lb]());
  lb.onclick = e => { if (e.target === lb) close(); };
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  });
}
