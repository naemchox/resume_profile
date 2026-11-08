import { bootPage, status, icon, esc, fmtRange } from '../ui.js';
import { listDocs, Timestamp, where } from '../db.js';
import { ready } from '../firebase.js';
import { SITE_URL, EVENT_TYPES } from '../config.js';

await bootPage('dashboard');

document.getElementById('site-link').href = SITE_URL;
document.getElementById('quick').innerHTML = [
  ['news.html?new=1', 'plus', 'เพิ่มข่าว'],
  ['albums.html?new=1', 'album', 'สร้างอัลบั้ม'],
  ['events.html?new=1', 'calendar', 'เพิ่มรายการแข่ง'],
  ['banners.html', 'banner', 'จัดการแบนเนอร์'],
  ['site-images.html', 'image', 'เปลี่ยนรูปประจำหน้า']
].map(([href, ic, label]) => `<a class="btn btn-secondary" href="${href}">${icon(ic)}${label}</a>`).join('');

const set = (id, text) => { document.getElementById(id).textContent = text; };

if (ready) {
  try {
    // ข้อมูลไม่เยอะ (ข่าวเดือนละครั้ง อัลบั้มปีละไม่กี่อัน) ดึงมานับเองได้
    const [news, albums, upcoming] = await Promise.all([
      listDocs('news'),
      listDocs('albums'),
      listDocs('events', where('endDate', '>=', Timestamp.now()))
    ]);
    const pub = news.filter(n => n.status === 'published').length;
    set('stat-news', news.length);
    set('stat-news-sub', `เผยแพร่ ${pub} · ร่าง ${news.length - pub}`);

    const photos = albums.reduce((s, a) => s + (a.photoCount || 0), 0);
    set('stat-albums', albums.length);
    set('stat-albums-sub', `รวม ${photos} รูป`);

    upcoming.sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis());
    set('stat-events', upcoming.length);
    set('stat-events-sub', upcoming.length ? `ถัดไป: ${upcoming[0].title}` : 'ยังไม่มีรายการ');

    if (upcoming.length) {
      document.getElementById('upcoming').innerHTML = `
        <div class="table-wrap" style="box-shadow:none">
          <table class="list no-thumb"><tbody>
            ${upcoming.slice(0, 5).map(e => `
              <tr>
                <td class="title-cell">${esc(e.title)}<small>${esc(e.location || '')}</small></td>
                <td data-label="วันที่">${fmtRange(e.startDate, e.endDate)}</td>
                <td><span class="badge badge-${esc(e.type)}">${esc(EVENT_TYPES[e.type] || e.type)}</span></td>
                <td class="actions"><a class="btn btn-ghost btn-sm" href="events.html?edit=${encodeURIComponent(e.id)}">แก้ไข</a></td>
              </tr>`).join('')}
          </tbody></table>
        </div>`;
    }
  } catch (err) {
    status.error(err);
  }
}
