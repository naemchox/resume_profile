import {
  bootPage, status, confirmDialog, setupDialog, withBusy, icon, esc, fmtDate, statusBadge, progressText
} from '../ui.js';
import {
  listDocs, newId, createDoc, updateById, deleteById, dateInputToTs, tsToDateInput, todayInput, Timestamp
} from '../db.js';
import { uploadImage, deleteFile, bindImageField } from '../upload.js';
import { ready } from '../firebase.js';
import { NEWS_CATEGORIES } from '../config.js';
import { openPreview, previewImage, toPlain } from '../preview.js';
import { mountLive } from '../live.js';
import { posAttr } from '../focal.js';

await bootPage('news');
mountLive('news');

const $ = id => document.getElementById(id);
const rowsEl = $('rows');
const form = $('edit-form');
const dialog = setupDialog($('edit-dialog'));
const cover = bindImageField($('cover-field'), { frames: 'news' });

let items = [];
let editing = null; // doc ที่กำลังแก้ หรือ null = เพิ่มใหม่

const catOptions = Object.entries(NEWS_CATEGORIES).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
$('filter-category').insertAdjacentHTML('beforeend', catOptions);
$('f-category').innerHTML = catOptions;

function render() {
  const q = $('search').value.trim().toLowerCase();
  const cat = $('filter-category').value;
  const st = $('filter-status').value;
  const list = items.filter(n =>
    (!q || (n.title || '').toLowerCase().includes(q)) &&
    (!cat || n.category === cat) &&
    (!st || n.status === st));

  $('empty').hidden = list.length > 0;
  $('empty').textContent = items.length ? 'ไม่พบข่าวที่ตรงกับเงื่อนไข' : 'ยังไม่มีข้อมูล';
  rowsEl.innerHTML = list.map(n => `
    <tr>
      <td class="cell-thumb">${n.coverUrl ? `<img class="thumb" src="${esc(n.coverUrl)}" alt="" loading="lazy"${posAttr(n.coverPos)}>` : '<div class="thumb-empty"></div>'}</td>
      <td class="title-cell">${esc(n.title)}${n.featured ? ` <span class="badge badge-featured">ข่าวเด่น</span>` : ''}<small>${esc(n.excerpt || '')}</small></td>
      <td><span class="badge badge-cat">${esc((NEWS_CATEGORIES[n.category] || n.category || '').split(' (')[0])}</span></td>
      <td>${statusBadge(n.status)}</td>
      <td data-label="เผยแพร่">${fmtDate(n.publishedAt)}</td>
      <td class="actions">
        <button class="btn btn-ghost btn-sm" data-edit="${esc(n.id)}">${icon('edit')}แก้ไข</button>
        <button class="btn btn-ghost btn-sm danger" data-del="${esc(n.id)}" data-write>${icon('trash')}ลบ</button>
      </td>
    </tr>`).join('');
}

async function load() {
  if (!ready) { render(); return; }
  try {
    items = await listDocs('news');
    items.sort((a, b) => (b.publishedAt?.toMillis?.() || 0) - (a.publishedAt?.toMillis?.() || 0));
    render();
  } catch (err) { status.error(err); }
}

function updateCounter() {
  const n = $('f-excerpt').value.length;
  $('excerpt-count').textContent = `${n}/200`;
  $('excerpt-count').classList.toggle('over', n > 200);
}

function openForm(item = null) {
  editing = item;
  $('dlg-title').textContent = item ? 'แก้ไขข่าว' : 'เพิ่มข่าว';
  $('f-title').value = item?.title || '';
  $('f-category').value = item?.category || 'announcement';
  $('f-date').value = item ? tsToDateInput(item.publishedAt) : todayInput();
  $('f-excerpt').value = item?.excerpt || '';
  $('f-body').value = item?.body || '';
  $('f-featured').checked = !!item?.featured;
  cover.reset(item?.coverUrl || '', item?.coverPos);
  updateCounter();
  dialog.open();
  $('f-title').focus();
}

async function save(targetStatus, buttons) {
  const title = $('f-title').value.trim();
  const excerpt = $('f-excerpt').value.trim();
  if (!title) { status.error(new Error('กรุณากรอกชื่อข่าว')); $('f-title').focus(); return; }
  if (excerpt.length > 200) { status.error(new Error('สรุปสั้นต้องไม่เกิน 200 ตัวอักษร')); return; }

  await withBusy(buttons, async () => {
    try {
      status.saving();
      const id = editing?.id || newId('news');
      const data = {
        title,
        category: $('f-category').value,
        excerpt,
        body: $('f-body').value.replace(/\r\n/g, '\n').trim(),
        featured: $('f-featured').checked,
        coverPos: cover.pos,
        status: targetStatus,
        publishedAt: dateInputToTs($('f-date').value) || Timestamp.now()
      };
      const oldPath = editing?.coverPath;
      if (cover.file) {
        const up = await uploadImage({
          folder: 'news', id, file: cover.file,
          onProgress: f => status.saving(progressText('กำลังอัปโหลดรูป…', f))
        });
        data.coverUrl = up.url;
        data.coverPath = up.path;
        status.saving();
      } else if (!editing) {
        data.coverUrl = '';
        data.coverPath = '';
      }

      if (editing) await updateById('news', id, data);
      else await createDoc('news', id, data);

      // ลบรูปเก่าหลังบันทึก doc สำเร็จแล้วเท่านั้น
      if (cover.file && oldPath) await deleteFile(oldPath).catch(() => {});

      status.ok(targetStatus === 'published' ? 'เผยแพร่แล้ว' : 'บันทึกร่างแล้ว');
      dialog.close();
      await load();
    } catch (err) { status.error(err); }
  });
}

async function remove(item) {
  const ok = await confirmDialog({
    title: 'ลบข่าว',
    message: `ลบ "${item.title}" ? รูปหน้าปกจะถูกลบด้วย และกู้คืนไม่ได้`,
    confirmText: 'ลบ', danger: true
  });
  if (!ok) return;
  try {
    status.saving('กำลังลบ…');
    await deleteFile(item.coverPath);
    await deleteById('news', item.id);
    status.ok('ลบแล้ว');
    await load();
  } catch (err) { status.error(err); }
}

// ตัวอย่างบนหน้าเว็บจริง: ฝั่งหลังแก้แสดงเหมือนกดเผยแพร่แล้ว
async function preview() {
  try {
    const id = editing?.id || 'preview-new';
    const coverUrl = await previewImage(cover.file, editing?.coverUrl || '');
    const doc = toPlain({
      ...(editing || {}),
      id,
      title: $('f-title').value.trim() || '(ยังไม่มีชื่อข่าว)',
      category: $('f-category').value,
      excerpt: $('f-excerpt').value.trim(),
      body: $('f-body').value.replace(/\r\n/g, '\n').trim(),
      featured: $('f-featured').checked,
      coverUrl,
      coverPos: cover.pos,
      status: 'published',
      publishedAt: dateInputToTs($('f-date').value) || Timestamp.now()
    });
    openPreview({
      title: 'ตัวอย่างข่าว',
      note: 'ฝั่งหลังแก้แสดงเหมือนกดเผยแพร่แล้ว · ยังไม่ได้บันทึก',
      pages: [
        { label: 'หน้าอ่านข่าว', path: `article.html?id=${encodeURIComponent(id)}` },
        { label: 'หน้ารวมข่าว', path: 'news.html' },
        { label: 'หน้าแรก', path: 'index.html' }
      ],
      patch: { news: { upsert: [doc] } }
    });
  } catch (err) { status.error(err); }
}

$('preview-btn').addEventListener('click', preview);
$('add-btn').addEventListener('click', () => openForm());
['search', 'filter-category', 'filter-status'].forEach(id => $(id).addEventListener('input', render));
$('f-excerpt').addEventListener('input', updateCounter);

rowsEl.addEventListener('click', e => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) openForm(items.find(n => n.id === edit.dataset.edit));
  if (del) remove(items.find(n => n.id === del.dataset.del));
});

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!ready) return;
  const btns = [...form.querySelectorAll('button[type=submit]')];
  save(e.submitter?.value || 'draft', btns);
});

await load();
if (new URLSearchParams(location.search).has('new')) openForm();
