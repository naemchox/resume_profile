import {
  bootPage, status, confirmDialog, setupDialog, withBusy, icon, esc, isHttpUrl, progressText
} from '../ui.js';
import {
  listDocs, newId, createDoc, updateById, deleteById, newBatch, docRef, serverTimestamp
} from '../db.js';
import { uploadImage, deleteFile, bindImageField } from '../upload.js';
import { ready } from '../firebase.js';
import { openPreview, previewImage, toPlain } from '../preview.js';
import { mountLive } from '../live.js';
import { posAttr } from '../focal.js';

await bootPage('banners');
mountLive('banners');

const $ = id => document.getElementById(id);
const listEl = $('list');
const form = $('edit-form');
const dialog = setupDialog($('edit-dialog'));
const image = bindImageField($('image-field'), { frames: 'banner' });

let items = [];
let editing = null;

function render() {
  $('empty').hidden = items.length > 0;
  listEl.innerHTML = items.map((b, i) => `
    <div class="banner-item">
      <div class="order-btns">
        <button class="icon-btn" data-move="-1" data-id="${esc(b.id)}" aria-label="เลื่อนขึ้น" ${i === 0 ? 'disabled' : ''} data-write>${icon('up')}</button>
        <button class="icon-btn" data-move="1" data-id="${esc(b.id)}" aria-label="เลื่อนลง" ${i === items.length - 1 ? 'disabled' : ''} data-write>${icon('down')}</button>
      </div>
      ${b.imageUrl ? `<img class="thumb" src="${esc(b.imageUrl)}" alt="" loading="lazy"${posAttr(b.imagePos)}>` : '<div class="thumb"></div>'}
      <div class="info">
        <strong>${esc(b.title || '(ไม่มีหัวข้อ)')}</strong>
        <small>${esc(b.subtitle || '')}</small>
        ${b.linkUrl ? `<small>ปุ่ม: ${esc(b.linkLabel || 'ลิงก์')} → ${esc(b.linkUrl)}</small>` : ''}
      </div>
      <div class="controls">
        <label class="switch" title="แสดงบนหน้าเว็บ">
          <input type="checkbox" data-toggle="${esc(b.id)}" ${b.active ? 'checked' : ''} data-write>
          <span></span>
        </label>
        <span class="badge ${b.active ? 'badge-active' : 'badge-inactive'}">${b.active ? 'แสดง' : 'ซ่อน'}</span>
        <button class="btn btn-ghost btn-sm" data-edit="${esc(b.id)}">${icon('edit')}แก้ไข</button>
        <button class="btn btn-ghost btn-sm danger" data-del="${esc(b.id)}" data-write>${icon('trash')}ลบ</button>
      </div>
    </div>`).join('');
}

async function load() {
  if (!ready) { render(); return; }
  try {
    items = await listDocs('banners');
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    render();
  } catch (err) { status.error(err); }
}

function openForm(item = null) {
  editing = item;
  $('dlg-title').textContent = item ? 'แก้ไขแบนเนอร์' : 'เพิ่มแบนเนอร์';
  $('f-title').value = item?.title || '';
  $('f-subtitle').value = item?.subtitle || '';
  $('f-link-label').value = item?.linkLabel || '';
  $('f-link-url').value = item?.linkUrl || '';
  $('f-active').checked = item ? !!item.active : true;
  image.reset(item?.imageUrl || '', item?.imagePos);
  dialog.open();
}

async function save(buttons) {
  const linkUrl = $('f-link-url').value.trim();
  if (!editing?.imageUrl && !image.file) { status.error(new Error('กรุณาเลือกรูปแบนเนอร์')); return; }
  if (linkUrl && !isHttpUrl(linkUrl)) { status.error(new Error('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')); return; }

  await withBusy(buttons, async () => {
    try {
      status.saving();
      const id = editing?.id || newId('banners');
      const data = {
        title: $('f-title').value.trim(),
        subtitle: $('f-subtitle').value.trim(),
        linkLabel: $('f-link-label').value.trim(),
        linkUrl,
        active: $('f-active').checked,
        imagePos: image.pos
      };
      const oldPath = editing?.imagePath;
      if (image.file) {
        const up = await uploadImage({
          folder: 'banners', id, file: image.file,
          onProgress: f => status.saving(progressText('กำลังอัปโหลดรูป…', f))
        });
        data.imageUrl = up.url;
        data.imagePath = up.path;
        status.saving();
      }
      if (editing) {
        await updateById('banners', id, data);
      } else {
        data.order = items.length ? Math.max(...items.map(b => b.order ?? 0)) + 1 : 0;
        await createDoc('banners', id, data);
      }
      if (image.file && oldPath) await deleteFile(oldPath).catch(() => {});
      status.ok();
      dialog.close();
      await load();
    } catch (err) { status.error(err); }
  });
}

// สลับลำดับกับแบนเนอร์ข้าง ๆ แล้วเขียนค่า order ใหม่ทั้งหมดใน batch เดียว
async function move(id, dir) {
  const i = items.findIndex(b => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return;
  const reordered = [...items];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  try {
    status.saving('กำลังเรียงลำดับ…');
    const batch = newBatch();
    reordered.forEach((b, idx) => {
      if (b.order !== idx) batch.update(docRef('banners', b.id), { order: idx, updatedAt: serverTimestamp() });
    });
    await batch.commit();
    status.ok('เรียงลำดับแล้ว');
    await load();
  } catch (err) { status.error(err); }
}

async function toggle(id, active, input) {
  try {
    input.disabled = true;
    status.saving();
    await updateById('banners', id, { active });
    status.ok(active ? 'เปิดแสดงแล้ว' : 'ซ่อนแล้ว');
    await load();
  } catch (err) {
    input.checked = !active;
    input.disabled = false;
    status.error(err);
  }
}

async function remove(item) {
  const ok = await confirmDialog({
    title: 'ลบแบนเนอร์',
    message: `ลบแบนเนอร์ "${item.title || '(ไม่มีหัวข้อ)'}" ? รูปจะถูกลบด้วย และกู้คืนไม่ได้`,
    confirmText: 'ลบ', danger: true
  });
  if (!ok) return;
  try {
    status.saving('กำลังลบ…');
    await deleteFile(item.imagePath);
    await deleteById('banners', item.id);
    status.ok('ลบแล้ว');
    await load();
  } catch (err) { status.error(err); }
}

async function preview() {
  try {
    const id = editing?.id || 'preview-new';
    const imageUrl = await previewImage(image.file, editing?.imageUrl || '');
    const doc = toPlain({
      ...(editing || {}),
      id,
      imageUrl,
      imagePos: image.pos,
      title: $('f-title').value.trim(),
      subtitle: $('f-subtitle').value.trim(),
      linkLabel: $('f-link-label').value.trim(),
      linkUrl: $('f-link-url').value.trim(),
      active: $('f-active').checked,
      order: editing ? editing.order : (items.length ? Math.max(...items.map(b => b.order ?? 0)) + 1 : 0)
    });
    openPreview({
      title: 'ตัวอย่างแบนเนอร์',
      note: doc.active ? 'ยังไม่ได้บันทึก' : 'แบนเนอร์นี้ปิดอยู่ จึงไม่แสดงในฝั่งหลังแก้ · ยังไม่ได้บันทึก',
      pages: [{ label: 'หน้าแรก', path: 'index.html' }],
      patch: { banners: { upsert: [doc] } }
    });
  } catch (err) { status.error(err); }
}

$('preview-btn').addEventListener('click', preview);
$('add-btn').addEventListener('click', () => openForm());

listEl.addEventListener('click', e => {
  const t = e.target.closest('[data-edit],[data-del],[data-move]');
  if (!t) return;
  if (t.dataset.edit) openForm(items.find(b => b.id === t.dataset.edit));
  if (t.dataset.del) remove(items.find(b => b.id === t.dataset.del));
  if (t.dataset.move) move(t.dataset.id, Number(t.dataset.move));
});
listEl.addEventListener('change', e => {
  const t = e.target.closest('[data-toggle]');
  if (t) toggle(t.dataset.toggle, t.checked, t);
});

form.addEventListener('submit', e => {
  e.preventDefault();
  if (ready) save([...form.querySelectorAll('button[type=submit]')]);
});

await load();
