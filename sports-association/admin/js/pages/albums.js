import { bootPage, status, confirmDialog, setupDialog, withBusy, icon, esc, fmtDate, statusBadge } from '../ui.js';
import { listDocs } from '../db.js';
import { ready } from '../firebase.js';
import { loadEvents, albumForm, deleteAlbumDeep, previewAlbum } from '../albums-common.js';
import { mountLive } from '../live.js';

await bootPage('albums');
mountLive('albums');

const $ = id => document.getElementById(id);
const gridEl = $('grid');
const form = $('edit-form');
const dialog = setupDialog($('edit-dialog'));

let items = [];
let events = [];
let editing = null;
const formCtl = albumForm(form);

function render() {
  const q = $('search').value.trim().toLowerCase();
  const st = $('filter-status').value;
  const list = items.filter(a =>
    (!q || (a.title || '').toLowerCase().includes(q)) && (!st || a.status === st));

  $('empty').hidden = list.length > 0;
  $('empty').textContent = items.length ? 'ไม่พบอัลบั้มที่ตรงกับเงื่อนไข' : 'ยังไม่มีข้อมูล';
  gridEl.innerHTML = list.map(a => {
    const ev = events.find(e => e.id === a.eventId);
    return `
    <div class="tile">
      <a href="album.html?id=${encodeURIComponent(a.id)}">
        ${a.coverUrl ? `<img class="tile-img" src="${esc(a.coverUrl)}" alt="" loading="lazy">` : '<div class="tile-img placeholder">ยังไม่มีรูปปก</div>'}
      </a>
      <div class="tile-body">
        <h3>${esc(a.title)}</h3>
        <p>${fmtDate(a.date)} · ${a.photoCount || 0} รูป</p>
        ${ev ? `<p>รายการแข่ง: ${esc(ev.title)}</p>` : ''}
        <p style="margin-top:6px">${statusBadge(a.status)}</p>
      </div>
      <div class="tile-foot">
        <a class="btn btn-primary btn-sm" href="album.html?id=${encodeURIComponent(a.id)}">${icon('upload')}จัดการรูป</a>
        <button class="btn btn-ghost btn-sm" data-edit="${esc(a.id)}">${icon('edit')}แก้ไข</button>
        <button class="btn btn-ghost btn-sm danger" data-del="${esc(a.id)}" data-write>${icon('trash')}ลบ</button>
      </div>
    </div>`;
  }).join('');
}

async function load() {
  if (!ready) { render(); return; }
  try {
    [items, events] = await Promise.all([listDocs('albums'), loadEvents()]);
    items.sort((a, b) => (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0));
    formCtl.setEvents(events);
    render();
  } catch (err) { status.error(err); }
}

function openForm(item = null) {
  editing = item;
  $('dlg-title').textContent = item ? 'แก้ไขอัลบั้ม' : 'สร้างอัลบั้ม';
  formCtl.fill(item);
  dialog.open();
}

async function remove(item) {
  const ok = await confirmDialog({
    title: 'ลบอัลบั้ม',
    message: `ลบอัลบั้ม "${item.title}" พร้อมรูปทั้งหมด ${item.photoCount || 0} รูป ? กู้คืนไม่ได้`,
    confirmText: 'ลบทั้งอัลบั้ม', danger: true
  });
  if (!ok) return;
  try {
    status.saving('กำลังลบ…');
    await deleteAlbumDeep(item, (d, n) => status.saving(`กำลังลบรูป ${d}/${n}…`));
    status.ok('ลบอัลบั้มแล้ว');
    await load();
  } catch (err) { status.error(err); await load(); }
}

$('preview-btn').addEventListener('click', () => previewAlbum({ ...(editing || {}), ...formCtl.values() }));
$('add-btn').addEventListener('click', () => openForm());
['search', 'filter-status'].forEach(id => $(id).addEventListener('input', render));

gridEl.addEventListener('click', e => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) openForm(items.find(a => a.id === edit.dataset.edit));
  if (del) remove(items.find(a => a.id === del.dataset.del));
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!ready) return;
  await withBusy(form.querySelector('button[type=submit]'), async () => {
    try {
      const wasNew = !editing;
      const id = await formCtl.save(editing);
      if (!id) return;
      dialog.close();
      if (wasNew) {
        // สร้างเสร็จ → ไปหน้าอัปโหลดรูปเลย
        location.href = `album.html?id=${encodeURIComponent(id)}&created=1`;
        return;
      }
      status.ok();
      await load();
    } catch (err) { status.error(err); }
  });
});

await load();
if (new URLSearchParams(location.search).has('new')) openForm();
