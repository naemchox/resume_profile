import {
  bootPage, status, confirmDialog, setupDialog, withBusy, icon, esc, fmtRange, statusBadge, isHttpUrl, progressText
} from '../ui.js';
import {
  listDocs, newId, createDoc, updateById, deleteById, dateInputToTs, tsToDateInput
} from '../db.js';
import { uploadImage, deleteFile, bindImageField } from '../upload.js';
import { ready } from '../firebase.js';
import { EVENT_TYPES } from '../config.js';
import { openPreview, previewImage, toPlain } from '../preview.js';
import { mountLive } from '../live.js';
import { posAttr } from '../focal.js';

await bootPage('events');
mountLive('events');

const $ = id => document.getElementById(id);
const rowsEl = $('rows');
const form = $('edit-form');
const dialog = setupDialog($('edit-dialog'));
const cover = bindImageField($('cover-field'), { frames: 'event' });

let items = [];
let editing = null;
let removeCover = false;

$('filter-type').insertAdjacentHTML('beforeend',
  Object.entries(EVENT_TYPES).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(''));

const ms = ts => ts?.toMillis?.() || 0;

function render() {
  const q = $('search').value.trim().toLowerCase();
  const when = $('filter-when').value;
  const type = $('filter-type').value;
  const st = $('filter-status').value;
  const now = Date.now();
  const list = items.filter(e =>
    (!q || `${e.title} ${e.location}`.toLowerCase().includes(q)) &&
    (!when || (when === 'upcoming' ? ms(e.endDate) >= now : ms(e.endDate) < now)) &&
    (!type || e.type === type) &&
    (!st || e.status === st));

  $('empty').hidden = list.length > 0;
  $('empty').textContent = items.length ? 'ไม่พบรายการที่ตรงกับเงื่อนไข' : 'ยังไม่มีข้อมูล';
  rowsEl.innerHTML = list.map(e => `
    <tr>
      <td class="cell-thumb">${e.coverUrl ? `<img class="thumb" src="${esc(e.coverUrl)}" alt="" loading="lazy"${posAttr(e.coverPos)}>` : '<div class="thumb-empty"></div>'}</td>
      <td class="title-cell">${esc(e.title)}<small>${esc(e.location || '')}</small></td>
      <td data-label="วันที่">${fmtRange(e.startDate, e.endDate)}</td>
      <td><span class="badge badge-${esc(e.type)}">${esc(EVENT_TYPES[e.type] || e.type)}</span> ${statusBadge(e.status)}</td>
      <td class="actions">
        <button class="btn btn-ghost btn-sm" data-edit="${esc(e.id)}">${icon('edit')}แก้ไข</button>
        <button class="btn btn-ghost btn-sm danger" data-del="${esc(e.id)}" data-write>${icon('trash')}ลบ</button>
      </td>
    </tr>`).join('');
}

async function load() {
  if (!ready) { render(); return; }
  try {
    items = await listDocs('events');
    // ใกล้วันนี้ก่อน: รายการที่ยังไม่จบเรียงจากใกล้ไปไกล แล้วตามด้วยที่จบแล้ว (ล่าสุดก่อน)
    const now = Date.now();
    items.sort((a, b) => {
      const ua = ms(a.endDate) >= now, ub = ms(b.endDate) >= now;
      if (ua !== ub) return ua ? -1 : 1;
      return ua ? ms(a.startDate) - ms(b.startDate) : ms(b.startDate) - ms(a.startDate);
    });
    render();
  } catch (err) { status.error(err); }
}

function setCoverRemoveBtn() {
  $('cover-remove').hidden = !(editing?.coverUrl) || removeCover || !!cover.file;
}

function openForm(item = null) {
  editing = item;
  removeCover = false;
  $('dlg-title').textContent = item ? 'แก้ไขรายการแข่ง' : 'เพิ่มรายการแข่ง';
  $('f-title').value = item?.title || '';
  form.querySelector(`input[name=type][value="${item?.type || 'major'}"]`).checked = true;
  $('f-start').value = tsToDateInput(item?.startDate);
  $('f-end').value = tsToDateInput(item?.endDate);
  $('f-location').value = item?.location || '';
  $('f-register').value = item?.registerUrl || '';
  $('f-description').value = item?.description || '';
  cover.reset(item?.coverUrl || '', item?.coverPos);
  setCoverRemoveBtn();
  dialog.open();
  $('f-title').focus();
}

async function save(targetStatus, buttons) {
  const title = $('f-title').value.trim();
  const start = $('f-start').value;
  const end = $('f-end').value || start;
  const registerUrl = $('f-register').value.trim();
  if (!title) { status.error(new Error('กรุณากรอกชื่อรายการ')); return; }
  if (!start) { status.error(new Error('กรุณาเลือกวันเริ่ม')); return; }
  if (end < start) { status.error(new Error('วันจบต้องไม่ก่อนวันเริ่ม')); return; }
  if (registerUrl && !isHttpUrl(registerUrl)) { status.error(new Error('ลิงก์สมัครต้องขึ้นต้นด้วย http:// หรือ https://')); return; }

  await withBusy(buttons, async () => {
    try {
      status.saving();
      const id = editing?.id || newId('events');
      const data = {
        title,
        type: form.querySelector('input[name=type]:checked').value,
        startDate: dateInputToTs(start),
        endDate: dateInputToTs(end, true),
        location: $('f-location').value.trim(),
        description: $('f-description').value.replace(/\r\n/g, '\n').trim(),
        registerUrl,
        coverPos: cover.pos,
        status: targetStatus
      };
      const oldPath = editing?.coverPath;
      if (cover.file) {
        const up = await uploadImage({
          folder: 'events', id, file: cover.file,
          onProgress: f => status.saving(progressText('กำลังอัปโหลดรูป…', f))
        });
        data.coverUrl = up.url;
        data.coverPath = up.path;
        status.saving();
      } else if (!editing || removeCover) {
        data.coverUrl = '';
        data.coverPath = '';
      }

      if (editing) await updateById('events', id, data);
      else await createDoc('events', id, data);

      if ((cover.file || removeCover) && oldPath) await deleteFile(oldPath).catch(() => {});

      status.ok(targetStatus === 'published' ? 'เผยแพร่แล้ว' : 'บันทึกร่างแล้ว');
      dialog.close();
      await load();
    } catch (err) { status.error(err); }
  });
}

async function remove(item) {
  const ok = await confirmDialog({
    title: 'ลบรายการแข่ง',
    message: `ลบ "${item.title}" ? รูปปกจะถูกลบด้วย (อัลบั้มที่ผูกไว้จะยังอยู่) และกู้คืนไม่ได้`,
    confirmText: 'ลบ', danger: true
  });
  if (!ok) return;
  try {
    status.saving('กำลังลบ…');
    await deleteFile(item.coverPath);
    await deleteById('events', item.id);
    status.ok('ลบแล้ว');
    await load();
  } catch (err) { status.error(err); }
}

async function preview() {
  try {
    const id = editing?.id || 'preview-new';
    const start = $('f-start').value;
    const end = $('f-end').value || start;
    const coverUrl = removeCover ? '' : await previewImage(cover.file, editing?.coverUrl || '');
    const doc = toPlain({
      ...(editing || {}),
      id,
      title: $('f-title').value.trim() || '(ยังไม่มีชื่อรายการ)',
      type: form.querySelector('input[name=type]:checked').value,
      startDate: dateInputToTs(start) || editing?.startDate || new Date(),
      endDate: dateInputToTs(end, true) || editing?.endDate || new Date(),
      location: $('f-location').value.trim(),
      description: $('f-description').value.replace(/\r\n/g, '\n').trim(),
      registerUrl: $('f-register').value.trim(),
      coverUrl,
      coverPos: cover.pos,
      status: 'published'
    });
    openPreview({
      title: 'ตัวอย่างรายการแข่ง',
      note: 'ฝั่งหลังแก้แสดงเหมือนกดเผยแพร่แล้ว · ยังไม่ได้บันทึก',
      pages: [
        { label: 'ปฏิทินการแข่ง', path: 'competition.html' },
        { label: 'หน้าแรก', path: 'index.html' }
      ],
      patch: { events: { upsert: [doc] } }
    });
  } catch (err) { status.error(err); }
}

$('preview-btn').addEventListener('click', preview);
$('add-btn').addEventListener('click', () => openForm());
['search', 'filter-when', 'filter-type', 'filter-status'].forEach(id => $(id).addEventListener('input', render));
$('f-start').addEventListener('change', () => {
  if (!$('f-end').value || $('f-end').value < $('f-start').value) $('f-end').value = $('f-start').value;
});
$('cover-remove').addEventListener('click', () => {
  removeCover = true;
  cover.reset('');
  setCoverRemoveBtn();
});
$('cover-field').querySelector('input[type=file]').addEventListener('change', () => {
  removeCover = false;
  setCoverRemoveBtn();
});

rowsEl.addEventListener('click', e => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) openForm(items.find(x => x.id === edit.dataset.edit));
  if (del) remove(items.find(x => x.id === del.dataset.del));
});

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!ready) return;
  save(e.submitter?.value || 'draft', [...form.querySelectorAll('button[type=submit]')]);
});

await load();
const params = new URLSearchParams(location.search);
if (params.has('new')) openForm();
if (params.get('edit')) {
  const item = items.find(x => x.id === params.get('edit'));
  if (item) openForm(item);
}
