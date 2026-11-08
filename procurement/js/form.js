// ฟอร์มในกล่องโต้ตอบ — ใช้ร่วมกันทุกหน้า
//
// แยกออกมาเป็นไฟล์ใหม่แทนที่จะไปเพิ่มใน ui.js เพราะตอนนี้มีมากกว่าหนึ่งคนแก้ ui.js อยู่
// admin.html ยังมีสำเนาของตัวเองอยู่ ค่อยย้ายมาใช้ตัวนี้ทีหลังเมื่อไม่มีใครค้างงานในไฟล์นั้น
//
// ทำไมไม่ใช้ modal() จาก ui.js: modal() ปิดกล่องทุกครั้งที่กดปุ่ม ห้ามยับยั้งไม่ได้
// ฟอร์มที่กรอกไม่ครบต้อง "ค้างกล่องเดิมไว้" ไม่ใช่ปิดแล้วเปิดใหม่
// (เคยทำแบบปิดแล้วเปิดใหม่ ผลคือกล่องใหม่โดนคลิกเดิมปิดซ้ำทันทีในจังหวะเดียวกัน)
import { t } from './i18n.js';
import { el, errText } from './ui.js';
import { toSatang, toBaht } from './money.js';
import { uploadFile, openFile, checkFile, fileLabel, ACCEPT } from './storage.js';

// fields: [{ k, label, type, required, options, placeholder, hint, wide, step, rows, folder }]
// type: text | textarea | num | money | date | bool | select | file
// ---------------------------------------------------------------------------
// ช่องแนบไฟล์
//
// ค่าจริงของช่องคือ "ที่อยู่ไฟล์ในคลัง" ไม่ใช่ตัวไฟล์
// อัปโหลดตอนกดบันทึก ไม่ใช่ตอนเลือกไฟล์ เพราะถ้าผู้ใช้กดยกเลิกกลางทาง
// จะได้ไม่มีไฟล์ขยะค้างอยู่ในคลังโดยไม่มีใบไหนอ้างถึง
// ---------------------------------------------------------------------------
function fileField(f, current) {
  // ใช้ input hidden เป็นตัวเก็บค่า เพื่อให้ขั้นตอนตรวจ "ห้ามว่าง" ใช้ n.value ร่วมกับช่องอื่นได้
  const box    = el('input', { type: 'hidden' });
  box.value    = current ?? '';
  const picker = el('input', { type: 'file', class: 'hidden', accept: f.accept ?? ACCEPT });
  const name   = el('span', { class: 'file-name' });
  const err    = el('small', { class: 'err-line hidden' });

  const view = el('button', { type: 'button', class: 'btn small link',
    onclick: () => openFile(box.value).catch((e) => show(errText(e))) }, t('file.view'));
  const clear = el('button', { type: 'button', class: 'btn small link rm',
    onclick: () => { picker.value = ''; box.value = ''; box.pendingFile = null; render(); } },
    t('file.remove'));

  const show = (msg) => {
    err.textContent = msg ?? '';
    err.classList.toggle('hidden', !msg);
  };

  const render = () => {
    const picked = box.pendingFile;
    name.textContent = picked ? picked.name
                     : box.value ? fileLabel(box.value)
                     : t('file.none');
    name.classList.toggle('faint', !picked && !box.value);
    // ไฟล์ที่เพิ่งเลือกยังไม่ได้อัปโหลด จึงยังเปิดดูจากคลังไม่ได้
    view.classList.toggle('hidden', !box.value || !!picked);
    clear.classList.toggle('hidden', !box.value && !picked);
    box.dispatchEvent(new Event('change'));
  };

  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      checkFile(file);              // เตือนตั้งแต่ตอนเลือก ดีกว่าปล่อยให้กรอกจนจบแล้วค่อยพัง
      show(null);
      box.pendingFile = file;
    } catch (e) {
      picker.value = '';
      box.pendingFile = null;
      show(errText(e));
    }
    render();
  });

  box.pendingFile = null;
  box.folder = f.folder ?? 'misc';
  box.wrap = el('div', { class: 'file-field' },
    el('button', { type: 'button', class: 'btn small',
      onclick: () => picker.click() }, t('file.choose')),
    name, view, clear, picker, box, err);
  render();
  return box;
}

// extras = ก้อน DOM ที่ต่อท้ายฟอร์มในกล่องเดียวกัน (เช่น ตารางราคา ช่องติ๊กเงื่อนไข)
// ผู้เรียกเป็นคนบันทึกก้อนพวกนี้เอง formModal แค่พามันมาแสดงในกล่องเดียวกับฟอร์ม
export function formModal(title, fields, values = {}, extras = []) {
  return new Promise((resolve) => {
    const nodes = {};
    const shells = {};   // กล่องที่ห่อ input ของแต่ละช่อง (ช่องไฟล์เท่านั้นที่ต่างจากตัว input)
    const grid = el('div', { class: 'form-grid' });

    for (const f of fields) {
      let input;
      if (f.type === 'select') {
        // ต้องมีตัวเลือกว่างเสมอ ไม่งั้นเบราว์เซอร์เลือกตัวแรกให้เงียบๆ
        // แล้วผู้ใช้ได้ค่าที่ไม่ได้ตั้งใจเลือกโดยไม่รู้ตัว
        input = el('select', {},
          el('option', { value: '' }, t(f.placeholder ?? 'common.selectPlaceholder')),
          ...f.options.map((o) => el('option', { value: String(o.value) }, o.label)));
        input.value = values[f.k] == null ? '' : String(values[f.k]);
      } else if (f.type === 'bool') {
        input = el('input', { type: 'checkbox' });
        input.checked = values[f.k] ?? f.default ?? false;
      } else if (f.type === 'file') {
        input = fileField(f, values[f.k]);
      } else if (f.type === 'textarea') {
        input = el('textarea', { rows: f.rows ?? 3 });
        input.value = values[f.k] ?? '';
      } else {
        const type = f.type === 'date' ? 'date'
                   : (f.type === 'money' || f.type === 'num') ? 'number' : 'text';
        input = el('input', {
          type,
          step: f.step ?? (type === 'number' ? 'any' : null),
          class: type === 'number' ? 'num' : null,
        });
        input.value = f.type === 'money'
          ? (values[f.k] == null ? '' : toBaht(values[f.k]))
          : (values[f.k] ?? '');
      }
      // ช่องไฟล์ห่อ input จริงไว้ในกล่อง ต้องเอากล่องไปวางและทำกรอบแดงที่กล่อง
      // เช็คด้วย f.type ตรงๆ ห้ามใช้ input.wrap เพราะ <textarea> มี property ชื่อ wrap ของตัวเอง
      // ที่คืนค่า "" (ไม่ใช่ undefined) — `input.wrap ?? input` จึงได้สตริงว่าง แล้ว textarea หายไปทั้งช่อง
      const shell = f.type === 'file' ? input.wrap : input;
      // พอผู้ใช้เริ่มแก้ ให้กรอบแดงหายไปเอง ไม่ต้องรอกดบันทึกอีกรอบ
      const mark = shell;
      input.addEventListener('input', () => mark.classList.remove('invalid'));
      input.addEventListener('change', () => mark.classList.remove('invalid'));

      nodes[f.k] = input;
      shells[f.k] = shell;
      grid.append(el('div', { class: 'field' + (f.wide ? ' wide' : '') },
        el('label', {}, t(f.label)),
        shell,
        f.hint ? el('small', { class: 'faint' }, t(f.hint)) : null));
    }

    const err = el('p', { class: 'err-line hidden' }, t('common.required'));
    grid.append(el('div', { class: 'wide' }, err));

    const close = (v) => { back.remove(); resolve(v); };

    const saveBtn = el('button', { class: 'btn primary' }, t('common.save'));

    const submit = async () => {
      const out = {};
      const uploads = [];
      let firstBad = null;
      for (const f of fields) {
        const n = nodes[f.k];
        if (f.type === 'bool') { out[f.k] = n.checked; continue; }
        // ไฟล์ที่เพิ่งเลือกยังไม่มีที่อยู่ในคลัง แต่ถือว่า "กรอกแล้ว"
        const raw = f.type === 'file' && n.pendingFile ? 'pending' : String(n.value).trim();
        if (f.required && !raw) {
          shells[f.k].classList.add('invalid');
          firstBad = firstBad ?? f.k;
          continue;
        }
        if (f.type === 'file') {
          if (n.pendingFile) uploads.push([f.k, n]);
          out[f.k] = n.value || null;
          continue;
        }
        out[f.k] = !raw ? null
                 : f.type === 'money' ? toSatang(raw)
                 : f.type === 'num'   ? Number(raw)
                 : raw;
      }
      if (firstBad) {
        err.classList.remove('hidden');
        const bad = nodes[firstBad];
        // ช่องไฟล์ซ่อน input จริงไว้ ต้องโฟกัสปุ่มเลือกไฟล์ในกล่องแทน
        (shells[firstBad] === bad ? bad : shells[firstBad].querySelector('button') ?? bad).focus();
        return;
      }

      // อัปโหลดหลังตรวจฟอร์มผ่านแล้วเท่านั้น ไม่งั้นกรอกผิดหนึ่งช่องก็จะมีไฟล์ค้างในคลังทุกรอบ
      if (uploads.length) {
        saveBtn.disabled = true;
        saveBtn.textContent = t('file.uploading');
        try {
          for (const [k, n] of uploads) out[k] = await uploadFile(n.pendingFile, n.folder);
        } catch (e) {
          err.textContent = errText(e);
          err.classList.remove('hidden');
          saveBtn.disabled = false;
          saveBtn.textContent = t('common.save');
          return;
        }
      }
      close(out);
    };

    saveBtn.addEventListener('click', submit);

    const extraBox = extras.length
      ? el('div', { class: 'form-extra' }, ...extras)
      : null;

    const box = el('div', { class: 'modal wide' },
      el('header', {}, title),
      el('section', {}, grid, extraBox),
      el('footer', {},
        saveBtn,
        el('button', { class: 'btn ghost', onclick: () => close(null) }, t('common.cancel'))));

    const back = el('div', { class: 'backdrop',
      onclick: (e) => { if (e.target === back) close(null); } }, box);

    // Enter = บันทึก ยกเว้นใน textarea ที่ต้องขึ้นบรรทัดใหม่ได้ · Esc = ยกเลิก
    // ในก้อนเสริมไม่เอาด้วย เพราะคนคีย์ราคาทีละหลายช่องมักกด Enter เพื่อไปช่องถัดไป
    // ถ้าปล่อยให้บันทึก กล่องจะปิดกลางคันตั้งแต่บรรทัดแรก
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA'
          && !e.target.closest('.form-extra')) { e.preventDefault(); submit(); }
      if (e.key === 'Escape') close(null);
    });

    document.body.append(back);
    setTimeout(() => grid.querySelector('input,textarea,select')?.focus(), 30);
  });
}
