import {
  bootPage, status, confirmDialog, setupDialog, withBusy, esc, fmtDate, statusBadge, errorMessage
} from '../ui.js';
import {
  getById, listDocs, newId, updateById, newBatch, docRef, increment, serverTimestamp
} from '../db.js';
import { resizeImage, uploadBlob, deleteFile } from '../upload.js';
import { ready } from '../firebase.js';
import { ALBUM_MAX_SIDE } from '../config.js';
import { loadEvents, albumForm, deleteAlbumDeep, previewAlbum } from '../albums-common.js';

await bootPage('albums');

const $ = id => document.getElementById(id);
const albumId = new URLSearchParams(location.search).get('id');
const photosEl = $('photos');
const form = $('edit-form');
const dialog = setupDialog($('edit-dialog'));
const formCtl = albumForm(form);
const CONCURRENCY = 3;

let album = null;
let photos = [];
let events = [];
let selected = new Set();
let uploading = false;

const photosPath = () => `albums/${albumId}/photos`;

function renderHead() {
  if (!album) return;
  document.title = `${album.title} · Sample Sports Admin`;
  $('album-title').textContent = album.title;
  const ev = events.find(e => e.id === album.eventId);
  $('album-meta').innerHTML = `${fmtDate(album.date)} · ${album.photoCount || 0} รูป · ${statusBadge(album.status)}${ev ? ` · รายการแข่ง: ${esc(ev.title)}` : ''}`;
  const pb = $('publish-btn');
  pb.hidden = false;
  pb.textContent = album.status === 'published' ? 'เปลี่ยนเป็นฉบับร่าง' : 'เผยแพร่อัลบั้มนี้';
  pb.className = album.status === 'published' ? 'btn btn-secondary' : 'btn btn-primary';
}

function renderPhotos() {
  $('empty').hidden = photos.length > 0;
  $('select-bar').hidden = photos.length === 0;
  photosEl.innerHTML = photos.map(p => `
    <div class="photo ${selected.has(p.id) ? 'selected' : ''}" data-id="${esc(p.id)}">
      <input type="checkbox" class="photo-select" data-select="${esc(p.id)}" ${selected.has(p.id) ? 'checked' : ''} aria-label="เลือกรูป">
      ${album?.coverPath === p.path ? '<span class="cover-tag">รูปปก</span>' : ''}
      <img src="${esc(p.url)}" alt="${esc(p.caption || '')}" loading="lazy">
      <div class="photo-foot">
        <input type="text" placeholder="คำบรรยาย" value="${esc(p.caption || '')}" data-caption="${esc(p.id)}" maxlength="200" data-write>
      </div>
      <div class="photo-foot" style="padding-top:0">
        <button class="btn btn-ghost btn-sm" data-cover="${esc(p.id)}" ${album?.coverPath === p.path ? 'disabled' : ''} data-write>ตั้งเป็นปก</button>
        <button class="btn btn-ghost btn-sm danger" data-del="${esc(p.id)}" data-write>ลบ</button>
      </div>
    </div>`).join('');
  updateSelectBar();
}

function updateSelectBar() {
  // ตัดรูปที่ถูกลบไปแล้วออกจากรายการที่เลือก
  selected = new Set([...selected].filter(id => photos.some(p => p.id === id)));
  $('select-count').textContent = selected.size ? `เลือก ${selected.size} รูป` : '';
  $('select-all').checked = photos.length > 0 && selected.size === photos.length;
  if (ready) $('delete-selected').disabled = selected.size === 0 || uploading;
}

async function load() {
  if (!ready) { renderPhotos(); return; }
  try {
    const [a, p, ev] = await Promise.all([getById('albums', albumId), listDocs(photosPath()), loadEvents()]);
    if (!a) {
      $('album-title').textContent = 'ไม่พบอัลบั้มนี้';
      $('album-meta').textContent = 'อาจถูกลบไปแล้ว';
      $('dropzone').hidden = true;
      $('edit-btn').hidden = true;
      $('delete-album-btn').hidden = true;
      return;
    }
    album = a;
    events = ev;
    formCtl.setEvents(events);
    photos = p.sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    renderHead();
    renderPhotos();
  } catch (err) { status.error(err); }
}

/* ---------- อัปโหลดหลายรูป ---------- */
async function uploadFiles(fileList) {
  if (!ready || uploading || !album) return;
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  const skipped = fileList.length - files.length;
  if (!files.length) { status.error(new Error('ไม่มีไฟล์รูปภาพในรายการที่เลือก')); return; }

  uploading = true;
  status.hide();
  $('pick-btn').disabled = true;
  updateSelectBar();
  $('upload-panel').hidden = false;
  $('upload-close-wrap').hidden = true;

  let nextOrder = photos.length ? Math.max(...photos.map(p => p.order ?? 0)) + 1 : 0;
  const needCover = !album.coverPath;
  const tasks = files.map(f => ({ file: f, order: nextOrder++, frac: 0, state: 'รอคิว', cls: '' }));

  $('upload-list').innerHTML = tasks.map((t, i) => `
    <li id="up-${i}">
      <span class="name">${esc(t.file.name)}</span>
      <span class="progress"><div></div></span>
      <span class="state">รอคิว</span>
    </li>`).join('');

  const draw = (i) => {
    const t = tasks[i];
    const li = $(`up-${i}`);
    li.querySelector('.progress > div').style.width = `${Math.round(t.frac * 100)}%`;
    const st = li.querySelector('.state');
    st.textContent = t.state;
    st.className = `state ${t.cls}`;
    if (t.error) st.title = t.error;
    const total = tasks.reduce((s, x) => s + x.frac, 0) / tasks.length;
    const done = tasks.filter(x => x.cls).length;
    $('upload-bar').style.width = `${Math.round(total * 100)}%`;
    $('upload-percent').textContent = `${Math.round(total * 100)}%`;
    $('upload-summary').textContent = `กำลังอัปโหลด ${done}/${tasks.length} รูป…`;
  };

  const runOne = async (i) => {
    const t = tasks[i];
    try {
      t.state = 'กำลังย่อรูป'; draw(i);
      const blob = await resizeImage(t.file, ALBUM_MAX_SIDE);
      const photoId = newId(photosPath());
      const path = `albums/${albumId}/${photoId}.jpg`;
      t.state = 'กำลังอัปโหลด'; draw(i);
      const { url } = await uploadBlob(path, blob, f => { t.frac = f * 0.95; draw(i); });

      // บันทึก doc รูป + เพิ่ม photoCount ในครั้งเดียว
      const batch = newBatch();
      const now = serverTimestamp();
      batch.set(docRef(photosPath(), photoId), { url, path, caption: '', order: t.order, createdAt: now, updatedAt: now });
      batch.update(docRef('albums', albumId), { photoCount: increment(1), updatedAt: now });
      await batch.commit();

      Object.assign(t, { url, path });
      t.frac = 1; t.state = 'สำเร็จ'; t.cls = 'ok'; draw(i);
    } catch (err) {
      t.frac = 1; t.state = 'ไม่สำเร็จ'; t.cls = 'err'; t.error = errorMessage(err); draw(i);
    }
  };

  let cursor = 0;
  const worker = async () => { while (cursor < tasks.length) await runOne(cursor++); };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));

  const failed = tasks.filter(t => t.cls === 'err');
  const okCount = tasks.length - failed.length;

  // อัลบั้มที่ยังไม่มีปก → ใช้รูปแรกตามลำดับ (ไม่ใช่รูปที่อัปโหลดเสร็จก่อน)
  const first = tasks.find(t => t.cls === 'ok');
  if (needCover && first) {
    await updateById('albums', albumId, { coverUrl: first.url, coverPath: first.path }).catch(err => status.error(err));
  }
  $('upload-summary').textContent = `อัปโหลดสำเร็จ ${okCount}/${tasks.length} รูป`;
  $('upload-close-wrap').hidden = false;
  uploading = false;
  $('pick-btn').disabled = false;
  $('file-input').value = '';

  if (failed.length) {
    status.error(new Error(`อัปโหลดไม่สำเร็จ ${failed.length} รูป: ${failed[0].file.name} (${failed[0].error})`));
  } else {
    status.ok(`อัปโหลดแล้ว ${okCount} รูป${skipped ? ` (ข้ามไฟล์ที่ไม่ใช่รูป ${skipped} ไฟล์)` : ''}`);
  }
  await load();
}

/* ---------- ลบรูป ---------- */
async function deletePhotos(ids) {
  const list = photos.filter(p => ids.includes(p.id));
  if (!list.length) return;
  const ok = await confirmDialog({
    title: 'ลบรูป',
    message: list.length === 1 ? 'ลบรูปนี้ ? กู้คืนไม่ได้' : `ลบรูปที่เลือก ${list.length} รูป ? กู้คืนไม่ได้`,
    confirmText: 'ลบ', danger: true
  });
  if (!ok) return;
  try {
    status.saving('กำลังลบ…');
    let done = 0;
    for (const p of list) {
      await deleteFile(p.path);
      if (list.length > 1) status.saving(`กำลังลบ ${++done}/${list.length}…`);
    }
    const batch = newBatch();
    list.forEach(p => batch.delete(docRef(photosPath(), p.id)));
    const albumUpdate = { photoCount: increment(-list.length), updatedAt: serverTimestamp() };
    // ถ้ารูปปกถูกลบ ใช้รูปแรกที่เหลือแทน
    if (list.some(p => p.path === album.coverPath)) {
      const next = photos.find(p => !ids.includes(p.id));
      Object.assign(albumUpdate, { coverUrl: next?.url || '', coverPath: next?.path || '' });
    }
    batch.update(docRef('albums', albumId), albumUpdate);
    await batch.commit();
    list.forEach(p => selected.delete(p.id));
    status.ok(`ลบแล้ว ${list.length} รูป`);
    await load();
  } catch (err) { status.error(err); await load(); }
}

async function setCover(id) {
  const p = photos.find(x => x.id === id);
  if (!p) return;
  try {
    status.saving();
    await updateById('albums', albumId, { coverUrl: p.url, coverPath: p.path });
    status.ok('ตั้งเป็นรูปปกแล้ว');
    await load();
  } catch (err) { status.error(err); }
}

async function saveCaption(id, caption) {
  try {
    status.saving();
    await updateById(photosPath(), id, { caption });
    const p = photos.find(x => x.id === id);
    if (p) p.caption = caption;
    status.ok('บันทึกคำบรรยายแล้ว');
  } catch (err) { status.error(err); }
}

/* ---------- events ---------- */
$('pick-btn').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', e => uploadFiles(e.target.files));

const dz = $('dropzone');
['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('dragover'); }));
dz.addEventListener('drop', e => uploadFiles(e.dataTransfer.files));

$('upload-close').addEventListener('click', () => { $('upload-panel').hidden = true; });

photosEl.addEventListener('click', e => {
  const t = e.target.closest('[data-cover],[data-del]');
  if (!t) return;
  if (t.dataset.cover) setCover(t.dataset.cover);
  if (t.dataset.del) deletePhotos([t.dataset.del]);
});
photosEl.addEventListener('change', e => {
  const sel = e.target.closest('[data-select]');
  if (sel) {
    sel.checked ? selected.add(sel.dataset.select) : selected.delete(sel.dataset.select);
    sel.closest('.photo').classList.toggle('selected', sel.checked);
    updateSelectBar();
  }
  const cap = e.target.closest('[data-caption]');
  if (cap && ready) saveCaption(cap.dataset.caption, cap.value.trim());
});

$('select-all').addEventListener('change', e => {
  selected = e.target.checked ? new Set(photos.map(p => p.id)) : new Set();
  renderPhotos();
});
$('delete-selected').addEventListener('click', () => deletePhotos([...selected]));

$('publish-btn').addEventListener('click', async () => {
  const next = album.status === 'published' ? 'draft' : 'published';
  await withBusy($('publish-btn'), async () => {
    try {
      status.saving();
      await updateById('albums', albumId, { status: next });
      status.ok(next === 'published' ? 'เผยแพร่อัลบั้มแล้ว' : 'เปลี่ยนเป็นฉบับร่างแล้ว');
      await load();
    } catch (err) { status.error(err); }
  });
});

$('edit-btn').addEventListener('click', () => { formCtl.fill(album); dialog.open(); });
$('preview-head-btn').addEventListener('click', () => { if (album) previewAlbum(album, photos); });
$('preview-btn').addEventListener('click', () => previewAlbum({ ...album, ...formCtl.values() }, photos));
form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!ready) return;
  await withBusy(form.querySelector('button[type=submit]'), async () => {
    try {
      if (!await formCtl.save(album)) return;
      status.ok();
      dialog.close();
      await load();
    } catch (err) { status.error(err); }
  });
});

$('delete-album-btn').addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'ลบอัลบั้ม',
    message: `ลบอัลบั้ม "${album.title}" พร้อมรูปทั้งหมด ${photos.length} รูป ? กู้คืนไม่ได้`,
    confirmText: 'ลบทั้งอัลบั้ม', danger: true
  });
  if (!ok) return;
  try {
    status.saving('กำลังลบ…');
    await deleteAlbumDeep(album, (d, n) => status.saving(`กำลังลบรูป ${d}/${n}…`));
    location.href = 'albums.html';
  } catch (err) { status.error(err); await load(); }
});

// กันปิดหน้าระหว่างอัปโหลด
window.addEventListener('beforeunload', e => { if (uploading) { e.preventDefault(); e.returnValue = ''; } });

if (!albumId && ready) {
  $('album-title').textContent = 'ไม่พบอัลบั้ม';
  $('dropzone').hidden = true;
} else {
  await load();
  if (new URLSearchParams(location.search).has('created')) status.ok('สร้างอัลบั้มแล้ว เลือกรูปเพื่ออัปโหลดได้เลย');
}
