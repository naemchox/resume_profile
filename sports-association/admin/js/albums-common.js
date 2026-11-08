// ใช้ร่วมกันระหว่าง albums.html และ album.html: ฟอร์มอัลบั้ม + ลบอัลบั้มทั้งหมด
import { status, esc, fmtRange } from './ui.js';
import {
  listDocs, newId, createDoc, updateById, deleteById, newBatch, docRef,
  dateInputToTs, tsToDateInput, todayInput
} from './db.js';
import { deleteFile } from './upload.js';
import { openPreview, toPlain } from './preview.js';

export async function loadEvents() {
  const events = await listDocs('events');
  return events.sort((a, b) => (b.startDate?.toMillis?.() || 0) - (a.startDate?.toMillis?.() || 0));
}

// ผูก <form> อัลบั้ม (ช่อง f-event, f-title, f-date, radio status)
export function albumForm(form) {
  const $ = id => form.querySelector('#' + id);
  let events = [];

  $('f-event').addEventListener('change', () => {
    const ev = events.find(e => e.id === $('f-event').value);
    if (!ev) return;
    if (!$('f-title').value.trim()) $('f-title').value = ev.title;
    $('f-date').value = tsToDateInput(ev.startDate);
  });

  return {
    setEvents(list) {
      events = list;
      $('f-event').innerHTML = '<option value="">— ไม่ผูก —</option>' + events.map(e =>
        `<option value="${esc(e.id)}">${esc(e.title)} (${fmtRange(e.startDate, e.endDate)})</option>`).join('');
    },
    fill(album) {
      $('f-event').value = album?.eventId && events.some(e => e.id === album.eventId) ? album.eventId : '';
      $('f-title').value = album?.title || '';
      $('f-date').value = album ? tsToDateInput(album.date) : todayInput();
      form.querySelector(`input[name=status][value="${album?.status || 'draft'}"]`).checked = true;
    },
    // ค่าที่กรอกอยู่ในฟอร์มตอนนี้ (ใช้ทำตัวอย่าง)
    values() {
      return {
        title: $('f-title').value.trim(),
        eventId: $('f-event').value,
        date: dateInputToTs($('f-date').value),
        status: form.querySelector('input[name=status]:checked').value
      };
    },
    // คืน id ของอัลบั้มที่บันทึก หรือ null ถ้าข้อมูลไม่ครบ
    async save(album) {
      const title = $('f-title').value.trim();
      const date = $('f-date').value;
      if (!title) { status.error(new Error('กรุณากรอกชื่ออัลบั้ม')); return null; }
      if (!date) { status.error(new Error('กรุณาเลือกวันที่')); return null; }
      status.saving();
      const data = {
        title,
        eventId: $('f-event').value,
        date: dateInputToTs(date),
        status: form.querySelector('input[name=status]:checked').value
      };
      if (album) {
        await updateById('albums', album.id, data);
        return album.id;
      }
      const id = newId('albums');
      await createDoc('albums', id, { ...data, coverUrl: '', coverPath: '', photoCount: 0 });
      return id;
    }
  };
}

// ลบรูปทุกรูป (ไฟล์ + doc) แล้วลบอัลบั้ม
export async function deleteAlbumDeep(album, onProgress) {
  const photos = await listDocs(`albums/${album.id}/photos`);
  let done = 0;
  const queue = [...photos];
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      await deleteFile(p.path);
      onProgress?.(++done, photos.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  for (let i = 0; i < photos.length; i += 400) {
    const batch = newBatch();
    photos.slice(i, i + 400).forEach(p => batch.delete(docRef(`albums/${album.id}/photos`, p.id)));
    await batch.commit();
  }
  await deleteFile(album.coverPath);
  await deleteById('albums', album.id);
}

// ตัวอย่างอัลบั้มบนหน้าเว็บจริง (ฝั่งหลังแก้แสดงเหมือนเผยแพร่แล้ว)
// photos: ใส่เมื่อต้องการให้หน้าอัลบั้มแสดงรูป (หน้าเว็บที่ไม่ได้ล็อกอินอ่านรูปของอัลบั้มร่างไม่ได้)
export function previewAlbum(album, photos) {
  const id = album.id || 'preview-new';
  const doc = toPlain({
    ...album,
    id,
    title: album.title || '(ยังไม่มีชื่ออัลบั้ม)',
    date: album.date || new Date(),
    status: 'published',
    ...(photos ? { photos: photos.map(p => ({ id: p.id, url: p.url, caption: p.caption || '', order: p.order ?? 0 })), photoCount: photos.length } : {})
  });
  const pages = [{ label: 'MEDIA', path: 'media.html' }];
  if (photos) pages.unshift({ label: 'หน้าอัลบั้ม', path: `album.html?id=${encodeURIComponent(id)}` });
  openPreview({
    title: 'ตัวอย่างอัลบั้ม',
    note: album.status === 'published' ? 'ยังไม่ได้บันทึกการแก้ไขในฟอร์ม' : 'อัลบั้มนี้ยังเป็นฉบับร่าง ฝั่งหลังแก้แสดงเหมือนเผยแพร่แล้ว',
    pages,
    patch: { albums: { upsert: [doc] } }
  });
}
