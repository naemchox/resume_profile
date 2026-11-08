import { mountLayout } from '../layout.js';
import { $, esc, icon } from '../util.js';
import { pageHero } from '../render.js';
import { getSiteImage, siteImagePos, PREVIEW } from '../data.js';
import { SITE } from '../content.js';

mountLayout();

const s = SITE.social;
$('#main').innerHTML = `
  ${pageHero({ eyebrow: 'Contact Us', title: 'ติดต่อเรา', img: await getSiteImage('contact-hero'), imgPos: siteImagePos('contact-hero') })}
  <section class="block">
    <div class="contact-grid">
      <div>
        <h2 class="subhead display">Address</h2>
        <dl class="info-list">
          <div><dt>ที่อยู่</dt><dd>${esc(SITE.name)}<br>${esc(SITE.address)}</dd></div>
          <div><dt>โทรศัพท์</dt><dd>${esc(SITE.phone)}</dd></div>
          <div><dt>อีเมล</dt><dd>${esc(SITE.email)}</dd></div>
          <div><dt>เวลาทำการ</dt><dd>${esc(SITE.hours)}</dd></div>
          <div><dt>Online Channel</dt><dd class="social" style="color:var(--jr-blue);margin-top:8px">
            <a href="${s.facebook}" aria-label="Facebook">${icon.facebook}</a>
            <a href="${s.instagram}" aria-label="Instagram">${icon.instagram}</a>
            <a href="${s.youtube}" aria-label="YouTube">${icon.youtube}</a>
            <a href="${s.tiktok}" aria-label="TikTok">${icon.tiktok}</a>
          </dd></div>
        </dl>
      </div>
      <iframe class="map" src="${esc(SITE.mapEmbed)}" title="แผนที่สมาคม" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>
  </section>
  <section class="block block--gray" id="question">
    <div class="two-col">
      <div>
        <h2 class="subhead display">Send Question</h2>
        <p class="prose" style="font-size:16px">ส่งคำถามถึงสมาคม เจ้าหน้าที่จะตอบกลับทางอีเมลภายใน 2–3 วันทำการ</p>
      </div>
      <form class="form" id="qForm">
        <label>ชื่อ–นามสกุล<input name="name" required autocomplete="name"></label>
        <label>อีเมล<input name="email" type="email" required autocomplete="email"></label>
        <label>หัวข้อ
          <select name="topic">
            <option>สอบถามทั่วไป</option><option>การแข่งขัน / สมัครแข่ง</option><option>สมัครสมาชิกสโมสร</option><option>อบรมผู้ตัดสิน / ผู้ฝึกสอน</option><option>ความร่วมมือ / สปอนเซอร์</option>
          </select>
        </label>
        <label>ข้อความ<textarea name="message" required></textarea></label>
        <button class="btn-wide btn-wide--blue" type="submit">ส่งคำถาม ${icon.arrowR}</button>
        <p class="form__note" id="qNote" role="status"></p>
      </form>
    </div>
  </section>`;

// [รอข้อมูล] ยังไม่มีระบบรับคำถาม จึงเปิดโปรแกรมอีเมลพร้อมข้อความที่กรอกไว้
$('#qForm').onsubmit = e => {
  e.preventDefault();
  if (PREVIEW) { $('#qNote').textContent = 'โหมดตัวอย่าง: ไม่ได้ส่งคำถามจริง'; return; }
  const f = new FormData(e.target);
  const to = SITE.email.replace(/^\[.*?\]\s*/, '');
  const body = `${f.get('message')}\n\n— ${f.get('name')} (${f.get('email')})`;
  location.href = `mailto:${to}?subject=${encodeURIComponent(`[เว็บไซต์] ${f.get('topic')}`)}&body=${encodeURIComponent(body)}`;
  $('#qNote').textContent = 'กำลังเปิดโปรแกรมอีเมลของคุณ…';
};
