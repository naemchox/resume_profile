import { bootPage, status, confirmDialog, esc, progressText } from '../ui.js';
import { listDocs, upsertDoc, deleteById } from '../db.js';
import { uploadImage, deleteFile } from '../upload.js';
import { ready } from '../firebase.js';
import { SITE_IMAGE_KEYS, SITE_IMAGE_PAGES } from '../config.js';
import { openPreview, previewImage } from '../preview.js';
import { mountLive } from '../live.js';
import { focalEditor, framesOf, posAttr, CENTER } from '../focal.js';

await bootPage('site-images');
mountLive('site-images');

const $ = id => document.getElementById(id);
const gridEl = $('grid');
const fileInput = $('file-input');

let docs = {};      // key → doc
let pickingKey = null;
let busyKey = null;

function render() {
  gridEl.innerHTML = SITE_IMAGE_KEYS.map(({ key, label, hint, frames }) => {
    frames = framesOf(frames);
    const d = docs[key];
    const busy = busyKey === key;
    return `
    <div class="tile" data-key="${key}">
      ${d?.url ? `<img class="tile-img" src="${esc(d.url)}" alt="${esc(d.alt || '')}" loading="lazy"${posAttr(d.pos)}>` : '<div class="tile-img placeholder">ยังไม่ได้ตั้งรูป<br>(หน้าเว็บใช้รูปสำรอง)</div>'}
      <div class="tile-body">
        <h3>${esc(label)}</h3>
        <p><code>${key}</code> · ${esc(hint)}</p>
        <div class="field" style="margin:10px 0 0">
          <label for="alt-${key}" style="font-size:13px;font-weight:600">คำอธิบายรูป (alt)</label>
          <input type="text" id="alt-${key}" data-alt="${key}" value="${esc(d?.alt || '')}" maxlength="150" placeholder="เช่น นักกีฬาทีมชาติไทยบนโพเดียม" ${d ? '' : 'disabled'} data-write>
        </div>
      </div>
      <div class="tile-foot">
        <button class="btn btn-primary btn-sm" data-pick="${key}" ${busy ? 'disabled' : ''} data-write>${busy ? 'กำลังอัปโหลด…' : d?.url ? 'เปลี่ยนรูป' : 'ตั้งรูป'}</button>
        ${d?.url && frames?.length ? `<button class="btn btn-ghost btn-sm" data-pos="${key}">ปรับตำแหน่ง</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-preview="${key}">ดูบนเว็บ</button>
        ${d?.url ? `<button class="btn btn-ghost btn-sm danger" data-clear="${key}" data-write>ใช้รูปสำรอง</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function load() {
  if (!ready) { render(); return; }
  try {
    const list = await listDocs('siteImages');
    docs = Object.fromEntries(list.map(d => [d.id, d]));
    render();
  } catch (err) { status.error(err); render(); }
}

async function replaceImage(key, file) {
  const label = SITE_IMAGE_KEYS.find(k => k.key === key)?.label || key;
  const old = docs[key];
  busyKey = key;
  render();
  try {
    status.saving();
    const up = await uploadImage({
      folder: 'site', id: key, file,
      onProgress: f => status.saving(progressText('กำลังอัปโหลดรูป…', f))
    });
    status.saving();
    const alt = old?.alt || label;
    await upsertDoc('siteImages', key, { url: up.url, path: up.path, alt, pos: { ...CENTER } }, !old);
    if (old?.path) await deleteFile(old.path).catch(() => {});
    status.ok(`เปลี่ยนรูป "${label}" แล้ว`);
  } catch (err) {
    status.error(err);
  } finally {
    busyKey = null;
    await load();
  }
}

async function clearImage(key) {
  const label = SITE_IMAGE_KEYS.find(k => k.key === key)?.label || key;
  const ok = await confirmDialog({
    title: 'เอารูปออก',
    message: `เอารูป "${label}" ออก แล้วให้หน้าเว็บกลับไปใช้รูปสำรอง ? ไฟล์รูปจะถูกลบ`,
    confirmText: 'เอารูปออก', danger: true
  });
  if (!ok) return;
  try {
    status.saving('กำลังลบ…');
    await deleteFile(docs[key].path);
    await deleteById('siteImages', key);
    status.ok('เอารูปออกแล้ว');
    await load();
  } catch (err) { status.error(err); }
}

async function saveAlt(key, alt) {
  try {
    status.saving();
    await upsertDoc('siteImages', key, { alt }, false);
    docs[key].alt = alt;
    status.ok('บันทึกคำอธิบายรูปแล้ว');
  } catch (err) { status.error(err); }
}

// ลากปรับตำแหน่งรูปที่ใช้อยู่ แล้วบันทึกเฉพาะ pos
function openPosDialog(key) {
  const k = SITE_IMAGE_KEYS.find(x => x.key === key);
  const d = docs[key];
  if (!k || !d?.url) return;
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <div class="dlg">
      <div class="dlg-head">
        <h2></h2>
        <button type="button" class="dlg-close" data-act="cancel" aria-label="ปิด">×</button>
      </div>
      <div class="dlg-body"><div class="image-field"><img alt=""></div></div>
      <div class="dlg-foot">
        <button type="button" class="btn btn-secondary" data-act="cancel">ยกเลิก</button>
        <button type="button" class="btn btn-secondary" data-act="preview">ดูตัวอย่าง</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-primary" data-act="save" data-write>บันทึกตำแหน่ง</button>
      </div>
    </div>`;
  dlg.querySelector('h2').textContent = `ปรับตำแหน่ง: ${k.label}`;
  const img = dlg.querySelector('img');
  img.src = d.url;
  const focal = focalEditor(img, k.frames);
  focal.set(d.pos);
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dlg.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cancel') close();
    if (act === 'preview') {
      openPreview({
        title: `ตัวอย่างตำแหน่งรูป: ${k.label}`,
        note: 'ยังไม่ได้บันทึกตำแหน่ง',
        pages: pagesOf(key),
        patch: { siteImages: { upsert: [{ id: key, url: d.url, alt: d.alt || k.label, pos: focal.pos }] } }
      });
    }
    if (act === 'save' && ready) {
      try {
        status.saving();
        await upsertDoc('siteImages', key, { pos: focal.pos }, false);
        d.pos = focal.pos;
        close();
        render();
        status.ok('บันทึกตำแหน่งแล้ว');
      } catch (err) { status.error(err); }
    }
  });
  document.body.appendChild(dlg);
  dlg.showModal();
}

const pagesOf = key => (SITE_IMAGE_PAGES[key] || [['หน้าแรก', 'index.html']]).map(([label, path]) => ({ label, path }));

// เลือกรูปแล้ว → ดูตัวอย่างก่อน กด "ใช้รูปนี้" ถึงจะอัปโหลดจริง
async function previewReplace(key, file) {
  const label = SITE_IMAGE_KEYS.find(k => k.key === key)?.label || key;
  try {
    status.saving('กำลังเตรียมตัวอย่าง…');
    const url = await previewImage(file);
    status.hide();
    openPreview({
      title: `ตัวอย่างรูป: ${label}`,
      note: 'ยังไม่ได้เปลี่ยนรูปจริง',
      pages: pagesOf(key),
      patch: { siteImages: { upsert: [{ id: key, url, alt: docs[key]?.alt || label }] } },
      actions: [
        { label: 'ยกเลิก', onClick: dlg => dlg.close() },
        { label: 'ใช้รูปนี้', primary: true, write: true, onClick: dlg => { dlg.close(); replaceImage(key, file); } }
      ]
    });
  } catch (err) { status.error(err); }
}

gridEl.addEventListener('click', e => {
  const pick = e.target.closest('[data-pick]');
  const clear = e.target.closest('[data-clear]');
  const pv = e.target.closest('[data-preview]');
  const pos = e.target.closest('[data-pos]');
  if (pos) openPosDialog(pos.dataset.pos);
  if (pv) {
    openPreview({
      title: SITE_IMAGE_KEYS.find(k => k.key === pv.dataset.preview)?.label || pv.dataset.preview,
      note: 'รูปที่ใช้อยู่ตอนนี้ (สองฝั่งเหมือนกัน)',
      pages: pagesOf(pv.dataset.preview),
      patch: {}
    });
  }
  if (pick) { pickingKey = pick.dataset.pick; fileInput.value = ''; fileInput.click(); }
  if (clear) clearImage(clear.dataset.clear);
});
gridEl.addEventListener('change', e => {
  const alt = e.target.closest('[data-alt]');
  if (alt && ready) saveAlt(alt.dataset.alt, alt.value.trim());
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file && pickingKey) previewReplace(pickingKey, file);
});

await load();
