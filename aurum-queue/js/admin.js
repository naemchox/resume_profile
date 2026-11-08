/* ============================================================
   AURUM — admin.js
   PHASE 3 · THE CONTROL   — day board + staff roster
   PHASE 4 · THE ASSISTANT — reminder queue + webhook
   PHASE 5 · THE BRAIN     — analytics, CRM, white-label
   ============================================================ */

import { shell, toast, enhance, applyBrand, $, $$, el, esc, reduced } from './ui.js';
import {
  listServices, listStaff, listAppointments, listAppointmentsSync, listClosures,
  addClosure, removeClosure, getSettingsSync, saveSettings, upsertStaff, upsertService,
  removeService, setAppointmentStatus, removeAppointment, addTimeOff, removeTimeOff,
  exportDB, importDB, resetDB, todayISO, addDays, fromISO, toISO, toMin, toHHMM,
  fmtDateTH, fmtTHB, TH_DOW, TH_DOW_S, uid,
} from './store.js';
import { slotsFor, freeIntervals, book, reschedule, cancel, utilisation, isSalonClosed } from './availability.js';
import { reconcile, listReminders, dispatch, startScheduler, compose, testWebhook } from './reminders.js';

shell({ nav: false, footer: false });

let SERVICES = [], STAFF = [], SET = getSettingsSync();
let view = location.hash.slice(1) || 'board';
let boardDate = todayISO();

const svc = id => SERVICES.find(s => s.id === id);
const stf = id => STAFF.find(s => s.id === id);
const VIEWS = [
  ['board', 'กระดานคิว', 'Phase 3'],
  ['roster', 'ตารางทีมงาน', 'Phase 3'],
  ['services', 'บริการและราคา', 'Phase 3'],
  ['reminders', 'แจ้งเตือนอัตโนมัติ', 'Phase 4'],
  ['insights', 'สถิติและลูกค้า', 'Phase 5'],
  ['brand', 'แบรนด์และข้อมูล', 'Phase 5'],
];

/* ---------------- shell ---------------- */
function renderSidebar() {
  const host = $('#sidenav'); host.innerHTML = '';
  VIEWS.forEach(([k, label, phase]) => {
    host.append(el('button', {
      type: 'button', 'aria-current': view === k ? 'page' : false,
      onclick: () => go(k),
    },
      el('span', { class: 'motif', style: 'width:13px;height:13px;background:currentColor;-webkit-mask:var(--motif-mask) center/contain no-repeat;mask:var(--motif-mask) center/contain no-repeat;flex:none' }),
      el('span', { style: 'flex:1;text-align:left' }, label),
      el('span', { style: 'font-family:var(--f-mono);font-size:.56rem;opacity:.5;letter-spacing:.1em' }, phase)));
  });
}
function go(k) { view = k; location.hash = k; renderSidebar(); render(); }
window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (k && k !== view) go(k); });

function head(title, sub, actions = []) {
  return el('div', { class: 'adminhd' },
    el('div', {}, el('p', { class: 'eyebrow' }, 'AURUM CONTROL'), el('h1', { style: 'margin-top:8px' }, title),
      sub ? el('p', { class: 'hint', style: 'margin-top:6px;max-width:66ch' }, sub) : null),
    el('div', { class: 'row row-end' }, ...actions));
}

/* ============================================================
   VIEW 1 · BOARD (Phase 3)
   ============================================================ */
function renderBoard() {
  const m = $('#main');
  const appts = listAppointmentsSync().filter(a => a.date === boardDate && a.status !== 'cancelled');
  const closed = isSalonClosed(boardDate);

  const dateInput = el('input', { class: 'input', type: 'date', value: boardDate, style: 'width:auto',
    onchange: e => { boardDate = e.target.value; render(); } });

  m.innerHTML = '';
  m.append(head('กระดานคิว ' + fmtDateTH(boardDate),
    'ทั้งวันในหน้าจอเดียว — แถบเทาลายทแยงคือเวลาที่ช่างไม่รับคิว (พัก ลา หรือนอกกะ) ช่องว่างสีพื้นคือเวลาที่ยังขายได้',
    [
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { boardDate = addDays(boardDate, -1); render(); } }, '←'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { boardDate = todayISO(); render(); } }, 'วันนี้'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { boardDate = addDays(boardDate, 1); render(); } }, '→'),
      dateInput,
      el('button', { class: 'btn btn-gold btn-sm', onclick: openWalkIn }, '+ เพิ่มคิวหน้าร้าน'),
    ]));

  /* --- stat row --- */
  const revenue = appts.filter(a => a.status !== 'noshow').reduce((n, a) => n + a.price, 0);
  const util = STAFF.map(s => utilisation(s.id, boardDate));
  const openMin = util.reduce((n, u) => n + u.open, 0);
  const bookedMin = util.reduce((n, u) => n + u.booked, 0);
  const free = STAFF.reduce((n, s) => n + freeIntervals(s.id, boardDate).reduce((k, iv) => k + (iv.e - iv.s), 0), 0);
  m.append(el('div', { class: 'stats', style: 'margin-bottom:var(--s6)', 'data-stagger': 'rise' },
    stat('คิววันนี้', appts.length, `${appts.filter(a => a.status === 'done').length} เสร็จแล้ว`, true),
    stat('รายรับคาดการณ์', '฿' + fmtTHB(revenue), 'ไม่รวมคิวที่ไม่มาตามนัด'),
    stat('อัตราการใช้เวลาช่าง', (openMin ? Math.round(bookedMin / openMin * 100) : 0) + '%', `${Math.round(bookedMin / 60)} จาก ${Math.round(openMin / 60)} ชม.`),
    stat('เวลาที่ยังขายได้', Math.round(free / 60) + ' ชม.', 'นับเฉพาะช่วงที่จองได้จริง')));

  if (closed) {
    m.append(el('div', { class: 'card', style: 'border-color:var(--c-warn-bd);background:color-mix(in oklab,var(--c-warn-bg) 40%,transparent)' },
      el('h3', {}, 'วันนี้ร้านปิดทำการ'),
      el('p', { class: 'hint', style: 'margin-top:6px' }, 'ระบบจะไม่เปิดให้ลูกค้าจองในวันนี้ · ปลดวันปิดได้ที่ “ตารางทีมงาน”')));
  }

  /* --- timeline --- */
  const dow = fromISO(boardDate).getDay();
  const spans = STAFF.flatMap(s => (s.hours[dow] || []).map(w => [toMin(w.start), toMin(w.end)]));
  const dayS = spans.length ? Math.min(...spans.map(x => x[0])) : 600;
  const dayE = spans.length ? Math.max(...spans.map(x => x[1])) : 1200;
  const pct = (min) => ((min - dayS) / (dayE - dayS) * 100);

  const board = el('div', { class: 'board' });
  const hours = el('div', { class: 'hoursbar' });
  for (let h = Math.ceil(dayS / 60); h <= Math.floor(dayE / 60); h++) {
    hours.append(el('span', { style: `left:${pct(h * 60).toFixed(2)}%` }, String(h).padStart(2, '0') + ':00'));
  }
  board.append(el('div', { class: 'laneshead' }, el('span', { class: 'lbl' }, 'ผู้ให้บริการ'), hours));

  STAFF.forEach(st => {
    const lane = el('div', { class: 'lane' });
    const u = utilisation(st.id, boardDate);
    lane.append(el('div', { class: 'lane-who' },
      el('span', { class: 'portrait', style: 'width:34px;height:34px;font-size:.95rem' }, st.initial),
      el('div', { style: 'min-width:0' },
        el('div', { class: 'nm' }, st.name),
        el('div', { class: 'rl' }, u.open ? `${Math.round(u.pct * 100)}% ของกะ` : 'ไม่เข้ากะ'))));

    const track = el('div', { class: 'lane-track' });
    // hour gridlines
    for (let h = Math.ceil(dayS / 60); h <= Math.floor(dayE / 60); h++)
      track.append(el('span', { class: 'grid-h', style: `left:${pct(h * 60).toFixed(2)}%` }));
    // unavailable hatching = the inverse of free ∪ booked
    const busyCover = [];
    (st.hours[dow] || []).forEach(w => busyCover.push([toMin(w.start), toMin(w.end)]));
    const openSet = busyCover;
    let cursor = dayS;
    const marks = [];
    openSet.sort((a, b) => a[0] - b[0]).forEach(([s, e]) => { if (s > cursor) marks.push([cursor, s]); cursor = Math.max(cursor, e); });
    if (cursor < dayE) marks.push([cursor, dayE]);
    (st.breaks || []).forEach(b => { if (b.dow === 'all' || +b.dow === dow) marks.push([toMin(b.start), toMin(b.end)]); });
    (st.timeOff || []).forEach(t => { if (t.date === boardDate) marks.push(t.allDay ? [dayS, dayE] : [toMin(t.start), toMin(t.end)]); });
    marks.forEach(([s, e]) => track.append(el('span', { class: 'off', style: `left:${pct(s).toFixed(2)}%;width:${(pct(e) - pct(s)).toFixed(2)}%` })));

    appts.filter(a => a.staffId === st.id).forEach(a => {
      const sv = svc(a.serviceId);
      const box = el('button', {
        class: 'appt', 'data-status': a.status, type: 'button',
        style: `left:${pct(toMin(a.start)).toFixed(2)}%;width:${(pct(toMin(a.end)) - pct(toMin(a.start))).toFixed(2)}%`,
        onclick: () => openAppt(a),
        title: `${a.customer.name} · ${sv?.nameTh} · ${a.start}–${a.end}`,
      },
        el('div', { class: 't' }, `${a.start}–${a.end}`),
        el('div', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, a.customer.name));
      track.append(box);
    });

    if (boardDate === todayISO()) {
      const now = new Date().getHours() * 60 + new Date().getMinutes();
      if (now >= dayS && now <= dayE) track.append(el('span', { class: 'nowline', style: `left:${pct(now).toFixed(2)}%` }));
    }
    lane.append(track);
    board.append(lane);
  });
  m.append(board);

  /* --- list --- */
  m.append(el('h3', { style: 'margin:var(--s7) 0 var(--s4)' }, 'รายการคิวของวันนี้'));
  if (!appts.length) {
    m.append(el('div', { class: 'state' }, el('div', { class: 'motif-loader', style: 'animation:none;opacity:.3' }),
      el('h3', {}, 'ยังไม่มีคิวในวันนี้'), el('p', { class: 'hint' }, 'กด “เพิ่มคิวหน้าร้าน” เพื่อบันทึกลูกค้าที่เดินเข้ามา')));
  } else {
    const rows = appts.slice().sort((a, b) => a.start.localeCompare(b.start)).map(a => {
      const sv = svc(a.serviceId), st = stf(a.staffId);
      const tr = el('tr');
      tr.innerHTML = `<td class="num">${a.start}–${a.end}</td>
        <td><strong>${esc(a.customer.name)}</strong><br><span class="hint num">${esc(a.customer.phone)}</span></td>
        <td>${esc(sv?.nameTh || '-')}</td><td>${esc(st?.name || '-')}</td>
        <td class="num">฿${fmtTHB(a.price)}</td>
        <td>${statusTag(a.status)}</td>`;
      const td = el('td');
      td.append(el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openAppt(a) }, 'จัดการ'));
      tr.append(td);
      return tr;
    });
    const t = el('table', { class: 'tbl' });
    t.innerHTML = '<thead><tr><th>เวลา</th><th>ลูกค้า</th><th>บริการ</th><th>ช่าง</th><th>ราคา</th><th>สถานะ</th><th></th></tr></thead>';
    const tb = el('tbody'); rows.forEach(r => tb.append(r)); t.append(tb);
    m.append(el('div', { class: 'tblwrap' }, t));
  }
  enhance(m);
}
function stat(k, v, d, gold) {
  return el('div', { class: 'stat' + (gold ? ' gold' : '') },
    el('p', { class: 'k' }, k), el('p', { class: 'v' }, String(v)), el('p', { class: 'd' }, d));
}
function statusTag(s) {
  return ({ booked: '<span class="tag tag-gold">รอรับบริการ</span>',
    confirmed: '<span class="tag tag-info">ยืนยันแล้ว</span>',
    done: '<span class="tag tag-ok">เสร็จสิ้น</span>',
    noshow: '<span class="tag tag-err">ไม่มาตามนัด</span>',
    cancelled: '<span class="tag">ยกเลิก</span>' })[s] || '';
}

/* ---- appointment drawer ---- */
function openAppt(a) {
  const sv = svc(a.serviceId), st = stf(a.staffId);
  const body = $('#mBody');
  $('#mTitle').textContent = `คิว ${a.code}`;
  body.innerHTML = `
    <div class="row" style="align-items:flex-start;margin-bottom:var(--s5)">
      <span class="portrait">${esc(st?.initial || '✦')}</span>
      <div style="flex:1"><h3>${esc(a.customer.name)}</h3>
      <p class="hint num">${esc(a.customer.phone)}${a.customer.email ? ' · ' + esc(a.customer.email) : ''}</p></div>
      <div>${statusTag(a.status)}</div>
    </div>
    <div class="ledger-row"><span class="k">บริการ</span><span class="dots"></span><span class="v">${esc(sv?.nameTh)}</span></div>
    <div class="ledger-row"><span class="k">ช่าง</span><span class="dots"></span><span class="v">${esc(st?.name)}</span></div>
    <div class="ledger-row"><span class="k">วันเวลา</span><span class="dots"></span><span class="v">${fmtDateTH(a.date)} ${a.start}–${a.end}</span></div>
    <div class="ledger-row"><span class="k">ค่าบริการ</span><span class="dots"></span><span class="v">฿${fmtTHB(a.price)}</span></div>
    ${a.customer.note ? `<p class="hint" style="margin-top:var(--s4);padding-left:12px;border-left:2px solid var(--c-border)">${esc(a.customer.note)}</p>` : ''}`;

  const acts = el('div', { class: 'row', style: 'margin-top:var(--s5);flex-wrap:wrap' });
  const set = async (s, msg) => { await setAppointmentStatus(a.id, s); reconcile(); $('#modal').close(); toast(msg, 'ok'); render(); };
  if (a.status !== 'done') acts.append(el('button', { class: 'btn btn-sm btn-gold', onclick: () => set('done', 'บันทึกว่ารับบริการเสร็จแล้ว') }, 'รับบริการเสร็จ'));
  if (a.status === 'booked') acts.append(el('button', { class: 'btn btn-sm btn-ghost', onclick: () => set('confirmed', 'ยืนยันคิวแล้ว') }, 'ยืนยันคิว'));
  if (a.status !== 'noshow') acts.append(el('button', { class: 'btn btn-sm btn-ghost', onclick: () => set('noshow', 'บันทึกว่าไม่มาตามนัด — ช่องเวลาถูกปล่อยคืนแล้ว') }, 'ไม่มาตามนัด'));
  acts.append(el('button', {
    class: 'btn btn-sm btn-danger', onclick: () => {
      if (!confirm('ยกเลิกคิวนี้?')) return;
      cancel(a.id); reconcile(); $('#modal').close(); toast('ยกเลิกคิวแล้ว', 'ok'); render();
    }
  }, 'ยกเลิกคิว'));
  body.append(acts);
  $('#modal').showModal();
}

/* ---- walk-in ---- */
function openWalkIn() {
  const body = $('#mBody');
  $('#mTitle').textContent = 'เพิ่มคิวหน้าร้าน';
  body.innerHTML = '';
  const st = { serviceId: SERVICES[0]?.id, staffId: null, time: null };
  const svSel = el('select', { class: 'select', onchange: e => { st.serviceId = e.target.value; st.time = null; draw(); } },
    ...SERVICES.map(s => el('option', { value: s.id }, `${s.nameTh} · ${s.dur} นาที · ฿${fmtTHB(s.price)}`)));
  const stSel = el('select', { class: 'select', onchange: e => { st.staffId = e.target.value || null; st.time = null; draw(); } });
  const slotHost = el('div', { style: 'margin-top:var(--s3)' });
  const name = el('input', { class: 'input', placeholder: 'ชื่อลูกค้า' });
  const phone = el('input', { class: 'input', placeholder: '081-234-5678', inputmode: 'tel' });

  function draw() {
    const sv = svc(st.serviceId);
    stSel.innerHTML = '';
    stSel.append(el('option', { value: '' }, 'ช่างคนไหนก็ได้'));
    sv.staff.map(stf).filter(Boolean).forEach(s => stSel.append(el('option', { value: s.id, selected: st.staffId === s.id }, s.name)));
    const slots = slotsFor(st.serviceId, boardDate, st.staffId ? { staffId: st.staffId } : {});
    slotHost.innerHTML = '';
    if (!slots.length) { slotHost.append(el('p', { class: 'hint' }, 'ไม่มีเวลาว่างในวันนี้สำหรับบริการนี้')); return; }
    const g = el('div', { class: 'slots' });
    slots.forEach(s => g.append(el('button', { class: 'slot', type: 'button', 'aria-pressed': st.time === s.time,
      onclick: () => { st.time = s.time; st.pickStaff = s.staffIds[0]; draw(); } }, s.time)));
    slotHost.append(g);
  }
  body.append(
    el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'บริการ'), svSel),
    el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'ช่าง'), stSel),
    el('div', { class: 'field', style: 'margin-top:var(--s4)' }, el('span', { class: 'lbl' }, `เวลาว่าง ${fmtDateTH(boardDate)}`), slotHost),
    el('div', { class: 'grid g2', style: 'margin-top:var(--s4)' },
      el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'ชื่อลูกค้า'), name),
      el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'เบอร์โทร'), phone)),
    el('div', { class: 'row', style: 'margin-top:var(--s5)' },
      el('button', {
        class: 'btn btn-gold', onclick: () => {
          try {
            const staffId = st.staffId || st.pickStaff;
            if (!st.time || !staffId) throw new Error('กรุณาเลือกเวลา');
            book({ serviceId: st.serviceId, staffId, date: boardDate, start: st.time,
              customer: { name: name.value, phone: phone.value }, source: 'walk-in' });
            $('#modal').close(); toast('เพิ่มคิวเรียบร้อย', 'ok'); render();
          } catch (e) { toast(e.message, 'err'); }
        }
      }, 'บันทึกคิว')));
  draw();
  $('#modal').showModal();
}

/* ============================================================
   VIEW 2 · ROSTER (Phase 3)
   ============================================================ */
async function renderRoster() {
  const m = $('#main'); m.innerHTML = '';
  m.append(head('ตารางทีมงาน', 'เปิด–ปิดกะรายวันของช่างแต่ละคน ลงวันลา และปิดร้านทั้งร้าน — ทุกการเปลี่ยนแปลงมีผลกับเวลาว่างที่ลูกค้าเห็นทันที',
    [el('button', { class: 'btn btn-gold btn-sm', onclick: openNewStaff }, '+ เพิ่มพนักงาน')]));

  STAFF.forEach(st => {
    const card = el('div', { class: 'card card-foil', style: 'margin-bottom:var(--s4)' });
    card.append(el('div', { class: 'row', style: 'margin-bottom:var(--s5)' },
      el('span', { class: 'portrait' }, st.initial),
      el('div', { style: 'flex:1;min-width:0' }, el('h3', {}, st.name), el('p', { class: 'hint' }, st.title)),
      el('label', { class: 'switch row-end' },
        el('input', { type: 'checkbox', checked: st.active, onchange: async e => { await upsertStaff({ id: st.id, active: e.target.checked }); toast(e.target.checked ? 'เปิดรับคิวแล้ว' : 'ปิดรับคิวชั่วคราว', 'ok'); await load(); render(); } }),
        el('span', { class: 'track' }), el('span', { class: 'hint' }, st.active ? 'รับคิวอยู่' : 'พักรับคิว'))));

    // per-day shift editor
    const days = el('div', { class: 'grid', style: 'grid-template-columns:repeat(7,1fr);gap:8px' });
    for (let d = 0; d < 7; d++) {
      const w = (st.hours[d] || [])[0];
      const on = !!w;
      const cell = el('div', { style: `padding:10px;border:1px solid var(--c-border);border-radius:var(--r-md);background:${on ? 'var(--c-surface)' : 'var(--c-sunken)'};text-align:center` });
      cell.append(el('div', { class: 'lbl', style: 'justify-content:center' }, TH_DOW_S[d]));
      const s = el('input', { class: 'input', type: 'time', value: w?.start || '10:00', style: 'margin-top:6px;padding:5px;font-size:.74rem;text-align:center', disabled: !on });
      const e = el('input', { class: 'input', type: 'time', value: w?.end || '20:00', style: 'margin-top:4px;padding:5px;font-size:.74rem;text-align:center', disabled: !on });
      const commit = async () => { await upsertStaff({ id: st.id, hours: { ...st.hours, [d]: [{ start: s.value, end: e.value }] } }); await load(); toast(`อัปเดตกะวัน${TH_DOW[d]}แล้ว`, 'ok'); };
      s.onchange = e.onchange = commit;
      const tog = el('label', { class: 'switch', style: 'margin-top:8px;justify-content:center' },
        el('input', {
          type: 'checkbox', checked: on, onchange: async ev => {
            await upsertStaff({ id: st.id, hours: { ...st.hours, [d]: ev.target.checked ? [{ start: s.value, end: e.value }] : [] } });
            await load(); render();
          }
        }), el('span', { class: 'track', style: 'width:32px;height:18px' }));
      cell.append(s, e, tog);
      days.append(cell);
    }
    card.append(el('p', { class: 'lbl', style: 'margin-bottom:8px' }, 'เวลาทำงานรายวัน'), days);

    // breaks
    card.append(el('p', { class: 'lbl', style: 'margin:var(--s5) 0 8px' }, 'เวลาพักประจำวัน'));
    const brow = el('div', { class: 'row' });
    (st.breaks || []).forEach((b, i) => brow.append(el('span', { class: 'tag' }, `${b.label} ${b.start}–${b.end}`,
      el('button', { class: 'btn btn-sm', style: 'border:none;padding:0 0 0 6px;background:none', title: 'ลบ',
        onclick: async () => { const bs = st.breaks.filter((_, j) => j !== i); await upsertStaff({ id: st.id, breaks: bs }); await load(); render(); } }, '×'))));
    const bs = el('input', { class: 'input', type: 'time', value: '14:00', style: 'width:auto' });
    const be = el('input', { class: 'input', type: 'time', value: '15:00', style: 'width:auto' });
    brow.append(bs, be, el('button', {
      class: 'btn btn-ghost btn-sm', onclick: async () => {
        await upsertStaff({ id: st.id, breaks: [...(st.breaks || []), { dow: 'all', start: bs.value, end: be.value, label: 'พัก' }] });
        await load(); toast('เพิ่มเวลาพักแล้ว', 'ok'); render();
      }
    }, '+ เพิ่มเวลาพัก'));
    card.append(brow);

    // time off
    card.append(el('p', { class: 'lbl', style: 'margin:var(--s5) 0 8px' }, 'วันลา / วันหยุดเฉพาะคน'));
    const trow = el('div', { class: 'row' });
    (st.timeOff || []).forEach(t => trow.append(el('span', { class: 'tag tag-warn' },
      `${fmtDateTH(t.date, { dow: false })}${t.allDay ? ' ทั้งวัน' : ` ${t.start}–${t.end}`}`,
      el('button', { style: 'border:none;background:none;cursor:pointer;padding-left:6px;color:inherit',
        onclick: async () => { await removeTimeOff(st.id, t.id); await load(); render(); } }, '×'))));
    const td = el('input', { class: 'input', type: 'date', value: todayISO(), style: 'width:auto' });
    trow.append(td, el('button', {
      class: 'btn btn-ghost btn-sm', onclick: async () => {
        await addTimeOff(st.id, { date: td.value, allDay: true, reason: 'ลา' });
        await load(); toast('ลงวันลาแล้ว — คิวที่จองไว้เดิมยังอยู่ กรุณาตรวจกระดานคิว', 'warn', 6000); render();
      }
    }, '+ ลงวันลา (ทั้งวัน)'));
    card.append(trow);
    m.append(card);
  });

  /* salon-wide closures */
  const closures = await listClosures();
  const cc = el('div', { class: 'card', style: 'background:var(--c-sunken)' },
    el('h3', {}, 'วันปิดร้าน (ทั้งร้าน)'),
    el('p', { class: 'hint', style: 'margin-top:6px' }, 'วันที่อยู่ในรายการนี้จะไม่มีเวลาว่างให้จองเลย ไม่ว่าช่างคนไหน'));
  const crow = el('div', { class: 'row', style: 'margin-top:var(--s4)' });
  closures.forEach(c => crow.append(el('span', { class: 'tag tag-err' }, fmtDateTH(c.date, { dow: false }),
    el('button', { style: 'border:none;background:none;cursor:pointer;padding-left:6px;color:inherit',
      onclick: async () => { await removeClosure(c.id); render(); } }, '×'))));
  const cd = el('input', { class: 'input', type: 'date', value: todayISO(), style: 'width:auto' });
  crow.append(cd, el('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await addClosure(cd.value, 'ปิดร้าน'); toast('เพิ่มวันปิดร้านแล้ว', 'ok'); render(); } }, '+ เพิ่มวันปิดร้าน'));
  cc.append(crow);
  m.append(cc);
  enhance(m);
}

function openNewStaff() {
  $('#mTitle').textContent = 'เพิ่มพนักงาน';
  const b = $('#mBody'); b.innerHTML = '';
  const name = el('input', { class: 'input', placeholder: 'ชื่อ–นามสกุล' });
  const title = el('input', { class: 'input', placeholder: 'เช่น Senior Colourist' });
  const bio = el('textarea', { class: 'textarea', placeholder: 'ประสบการณ์ / ความถนัด' });
  b.append(el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'ชื่อ'), name),
    el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'ตำแหน่ง'), title),
    el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'แนะนำตัวสั้น ๆ'), bio),
    el('div', { class: 'row', style: 'margin-top:var(--s5)' }, el('button', {
      class: 'btn btn-gold', onclick: async () => {
        if (!name.value.trim()) return toast('กรุณากรอกชื่อ', 'warn');
        await upsertStaff({
          name: name.value.trim(), title: title.value.trim() || 'Stylist', initial: name.value.trim()[0],
          bio: bio.value.trim(), active: true,
          hours: { 0: [{ start: '11:00', end: '19:00' }], 1: [], 2: [{ start: '10:00', end: '20:00' }], 3: [{ start: '10:00', end: '20:00' }], 4: [{ start: '10:00', end: '20:00' }], 5: [{ start: '10:00', end: '21:00' }], 6: [{ start: '10:00', end: '21:00' }] },
          breaks: [{ dow: 'all', start: '14:00', end: '15:00', label: 'พัก' }], timeOff: [],
        });
        await load(); $('#modal').close(); toast('เพิ่มพนักงานแล้ว — อย่าลืมผูกกับบริการในหน้า “บริการและราคา”', 'ok', 6000); render();
      }
    }, 'บันทึก')));
  $('#modal').showModal();
}

/* ============================================================
   VIEW 3 · SERVICES
   ============================================================ */
async function renderServices() {
  const m = $('#main'); m.innerHTML = '';
  const all = await listServices({ includeInactive: true });
  m.append(head('บริการและราคา', 'ระยะเวลาที่ตั้งไว้คือสิ่งที่เครื่องคำนวณเวลาว่างใช้จริง — แก้ที่นี่แล้วตารางคิวเปลี่ยนตามทั้งระบบ',
    [el('button', { class: 'btn btn-gold btn-sm', onclick: () => openService(null) }, '+ เพิ่มบริการ')]));
  const t = el('table', { class: 'tbl' });
  t.innerHTML = '<thead><tr><th>บริการ</th><th>หมวด</th><th>เวลา</th><th>ราคา</th><th>ช่างที่ทำได้</th><th>สถานะ</th><th></th></tr></thead>';
  const tb = el('tbody');
  all.forEach(sv => {
    const tr = el('tr');
    tr.innerHTML = `<td><strong>${esc(sv.nameTh)}</strong><br><span class="hint">${esc(sv.name)}</span></td>
      <td>${esc(sv.cat)}</td><td class="num">${sv.dur} น.</td><td class="num">฿${fmtTHB(sv.price)}</td>
      <td class="hint">${sv.staff.map(id => esc(stf(id)?.name || '?')).join(', ')}</td>
      <td>${sv.active ? '<span class="tag tag-ok">เปิดขาย</span>' : '<span class="tag">ปิด</span>'}</td>`;
    const td = el('td', { class: 'row' });
    td.append(el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openService(sv) }, 'แก้ไข'),
      el('button', { class: 'btn btn-sm btn-danger', onclick: async () => { if (confirm('ลบบริการนี้? คิวเดิมจะยังอยู่')) { await removeService(sv.id); await load(); render(); } } }, 'ลบ'));
    tr.append(td); tb.append(tr);
  });
  t.append(tb); m.append(el('div', { class: 'tblwrap' }, t));
  enhance(m);
}
function openService(sv) {
  $('#mTitle').textContent = sv ? 'แก้ไขบริการ' : 'เพิ่มบริการ';
  const b = $('#mBody'); b.innerHTML = '';
  const f = {
    nameTh: el('input', { class: 'input', value: sv?.nameTh || '' }),
    name: el('input', { class: 'input', value: sv?.name || '' }),
    cat: el('input', { class: 'input', value: sv?.cat || 'Hair' }),
    dur: el('input', { class: 'input', type: 'number', min: 15, step: 15, value: sv?.dur || 60 }),
    price: el('input', { class: 'input', type: 'number', min: 0, step: 100, value: sv?.price || 1500 }),
    desc: el('textarea', { class: 'textarea', value: sv?.desc || '' }),
  };
  b.append(
    el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'ชื่อภาษาไทย'), f.nameTh),
    el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'ชื่อภาษาอังกฤษ'), f.name),
    el('div', { class: 'grid g3', style: 'margin-top:var(--s3)' },
      el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'หมวด'), f.cat),
      el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'นาที'), f.dur),
      el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'ราคา (฿)'), f.price)),
    el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'คำอธิบาย'), f.desc));
  b.append(el('p', { class: 'lbl', style: 'margin:var(--s4) 0 8px' }, 'ช่างที่ให้บริการนี้ได้'));
  const picks = el('div', { class: 'row' });
  const chosen = new Set(sv?.staff || []);
  STAFF.forEach(s => {
    const btn = el('button', { class: 'btn btn-sm ' + (chosen.has(s.id) ? 'btn-gold' : 'btn-ghost'), type: 'button',
      onclick: () => { chosen.has(s.id) ? chosen.delete(s.id) : chosen.add(s.id); btn.className = 'btn btn-sm ' + (chosen.has(s.id) ? 'btn-gold' : 'btn-ghost'); } }, s.name);
    picks.append(btn);
  });
  b.append(picks);
  b.append(el('div', { class: 'row', style: 'margin-top:var(--s5)' }, el('button', {
    class: 'btn btn-gold', onclick: async () => {
      if (!f.nameTh.value.trim()) return toast('กรุณากรอกชื่อบริการ', 'warn');
      if (!chosen.size) return toast('เลือกช่างอย่างน้อย 1 คน มิฉะนั้นจะไม่มีเวลาว่างให้จอง', 'warn', 6000);
      await upsertService({
        id: sv?.id, nameTh: f.nameTh.value.trim(), name: f.name.value.trim() || f.nameTh.value.trim(),
        cat: f.cat.value.trim() || 'Hair', dur: +f.dur.value, price: +f.price.value,
        desc: f.desc.value.trim(), staff: [...chosen], active: sv?.active ?? true, vip: sv?.vip ?? false,
      });
      await load(); $('#modal').close(); toast('บันทึกบริการแล้ว', 'ok'); render();
    }
  }, 'บันทึก')));
  $('#modal').showModal();
}

/* ============================================================
   VIEW 4 · REMINDERS (Phase 4)
   ============================================================ */
function renderReminders() {
  reconcile();
  const m = $('#main'); m.innerHTML = '';
  const list = listReminders();
  const s = getSettingsSync();
  m.append(head('แจ้งเตือนอัตโนมัติ',
    `ทุกคิวที่จองสำเร็จจะถูกตั้งเวลาแจ้งเตือนล่วงหน้า ${s.reminderHours} ชั่วโมงโดยอัตโนมัติ ระบบกวาดคิวที่ถึงกำหนดทุกนาทีขณะเปิดหน้านี้`,
    [el('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { const r = await import('./reminders.js'); const out = await r.runDue(); toast(out.length ? `ส่งแล้ว ${out.length} รายการ` : 'ยังไม่มีรายการถึงกำหนด', out.length ? 'ok' : ''); render(); } }, 'กวาดคิวเดี๋ยวนี้')]));

  const cnt = k => list.filter(r => r.status === k).length;
  m.append(el('div', { class: 'stats', style: 'margin-bottom:var(--s6)' },
    stat('รอส่ง', cnt('scheduled'), 'ตั้งเวลาไว้แล้ว', true),
    stat('ส่งแล้ว', cnt('sent'), s.webhookEnabled ? 'ยิงผ่าน webhook จริง' : 'โหมดทดลอง — บันทึกข้อความไว้ให้ตรวจ'),
    stat('ล้มเหลว', cnt('failed'), 'กดส่งซ้ำได้ในตาราง'),
    stat('ยกเลิก/ข้าม', cnt('cancelled') + cnt('skipped'), 'คิวถูกยกเลิกหรือจองกระชั้นเกิน')));

  /* webhook config */
  const wUrl = el('input', { class: 'input', value: s.webhookUrl, placeholder: 'https://hooks.example.com/aurum' });
  const wOn = el('input', { type: 'checkbox', checked: s.webhookEnabled });
  m.append(el('div', { class: 'card', style: 'margin-bottom:var(--s6);background:var(--c-sunken)' },
    el('h3', {}, 'ปลายทางการส่ง (Webhook)'),
    el('p', { class: 'hint', style: 'margin-top:6px;max-width:70ch' },
      'ระบบยิง JSON แบบ POST ไปยัง URL นี้ ต่อกับ LINE Messaging API, SMS gateway, Make หรือ Zapier ได้โดยตรง ถ้าปิดไว้ ระบบจะทำงานในโหมดทดลองและเก็บข้อความที่จะส่งไว้ให้ตรวจสอบ'),
    el('div', { class: 'field', style: 'margin-top:var(--s4)' }, el('span', { class: 'lbl' }, 'URL ปลายทาง'), wUrl),
    el('div', { class: 'row', style: 'margin-top:var(--s4)' },
      el('label', { class: 'switch' }, wOn, el('span', { class: 'track' }), el('span', { class: 'hint' }, 'เปิดใช้งานจริง')),
      el('button', {
        class: 'btn btn-ghost btn-sm', onclick: async () => {
          await saveSettings({ webhookUrl: wUrl.value.trim(), webhookEnabled: wOn.checked });
          toast('บันทึกการตั้งค่าปลายทางแล้ว', 'ok');
        }
      }, 'บันทึก'),
      el('button', {
        class: 'btn btn-ghost btn-sm', onclick: async () => {
          await saveSettings({ webhookUrl: wUrl.value.trim(), webhookEnabled: wOn.checked });
          try { await testWebhook(); toast('ปลายทางตอบกลับสำเร็จ', 'ok'); }
          catch (e) { toast('ทดสอบไม่สำเร็จ: ' + e.message, 'err', 7000); }
        }
      }, 'ยิงทดสอบ'))));

  const t = el('table', { class: 'tbl' });
  t.innerHTML = '<thead><tr><th>กำหนดส่ง</th><th>ลูกค้า</th><th>คิว</th><th>สถานะ</th><th></th></tr></thead>';
  const tb = el('tbody');
  list.forEach(r => {
    const d = new Date(r.sendAt);
    const tr = el('tr');
    tr.innerHTML = `<td class="num">${d.toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
      <td>${esc(r.appt.customer.name)}<br><span class="hint num">${esc(r.appt.customer.phone)}</span></td>
      <td class="hint">${esc(r.appt.code)} · ${fmtDateTH(r.appt.date, { dow: false })} ${r.appt.start}</td>
      <td>${({ scheduled: '<span class="tag tag-gold">รอส่ง</span>', sent: `<span class="tag tag-ok">ส่งแล้ว${r.dryRun ? ' (ทดลอง)' : ''}</span>`,
        failed: '<span class="tag tag-err">ล้มเหลว</span>', cancelled: '<span class="tag">ยกเลิก</span>',
        skipped: '<span class="tag tag-warn">ข้าม</span>' })[r.status] || ''}</td>`;
    const td = el('td', { class: 'row' });
    td.append(el('button', { class: 'btn btn-ghost btn-sm', onclick: () => previewMsg(r) }, 'ดูข้อความ'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await dispatch(r.id, { force: true }); toast('ส่งแล้ว', 'ok'); render(); } }, 'ส่งเดี๋ยวนี้'));
    tr.append(td); tb.append(tr);
  });
  t.append(tb);
  m.append(list.length ? el('div', { class: 'tblwrap' }, t)
    : el('div', { class: 'state' }, el('div', { class: 'motif-loader', style: 'animation:none;opacity:.3' }), el('h3', {}, 'ยังไม่มีคิวแจ้งเตือน')));
  enhance(m);
}
function previewMsg(r) {
  $('#mTitle').textContent = 'ข้อความที่ลูกค้าจะได้รับ';
  $('#mBody').innerHTML = `<pre style="white-space:pre-wrap;font-family:var(--f-body);font-size:.9rem;line-height:1.8;background:var(--c-sunken);border:1px solid var(--c-border);border-radius:var(--r-md);padding:var(--s4)">${esc(compose(r.appt))}</pre>
  <p class="hint" style="margin-top:var(--s4)">ส่งถึง <span class="num">${esc(r.appt.customer.phone)}</span> · ช่องทาง ${esc(r.channel)}</p>`;
  $('#modal').showModal();
}

/* ============================================================
   VIEW 5 · INSIGHTS (Phase 5)
   ============================================================ */
function renderInsights() {
  const m = $('#main'); m.innerHTML = '';
  const all = listAppointmentsSync();
  const from = addDays(todayISO(), -30);
  const win = all.filter(a => a.date >= from && a.date <= todayISO());
  const earned = win.filter(a => a.status === 'done');
  const revenue = earned.reduce((n, a) => n + a.price, 0);
  const noshow = win.filter(a => a.status === 'noshow').length;
  const rate = win.length ? (noshow / win.length * 100) : 0;

  m.append(head('สถิติและลูกค้า', 'ข้อมูล 30 วันย้อนหลัง — ตัวเลขทั้งหมดคำนวณสดจากคิวจริงในระบบ ไม่ใช่ตัวอย่าง'));
  m.append(el('div', { class: 'stats', style: 'margin-bottom:var(--s6)' },
    stat('รายรับ 30 วัน', '฿' + fmtTHB(revenue), `จาก ${earned.length} คิวที่ให้บริการแล้ว`, true),
    stat('ค่าเฉลี่ยต่อคิว', '฿' + fmtTHB(earned.length ? revenue / earned.length : 0), 'ยอดขายเฉลี่ยต่อลูกค้าหนึ่งครั้ง'),
    stat('ไม่มาตามนัด', rate.toFixed(1) + '%', `${noshow} คิว — เปิดแจ้งเตือนช่วยลดตัวเลขนี้`),
    stat('ลูกค้าที่กลับมาซ้ำ', repeatCount(all) + ' คน', 'จองมากกว่า 1 ครั้ง')));

  /* revenue by service */
  const bySv = {};
  earned.forEach(a => { const k = svc(a.serviceId)?.nameTh || '—'; bySv[k] = (bySv[k] || 0) + a.price; });
  m.append(chartCard('รายรับแยกตามบริการ', bySv, v => '฿' + fmtTHB(v)));

  /* bookings by staff */
  const bySt = {};
  win.filter(a => a.status !== 'cancelled').forEach(a => { const k = stf(a.staffId)?.name || '—'; bySt[k] = (bySt[k] || 0) + 1; });
  m.append(chartCard('จำนวนคิวแยกตามช่าง', bySt, v => v + ' คิว'));

  /* busiest hours */
  const byHr = {};
  win.forEach(a => { const h = a.start.slice(0, 2) + ':00'; byHr[h] = (byHr[h] || 0) + 1; });
  m.append(chartCard('ช่วงเวลาที่คนจองมากที่สุด', Object.fromEntries(Object.entries(byHr).sort()), v => v + ' คิว'));

  /* CRM */
  const cust = {};
  all.forEach(a => {
    const k = a.customer.phone;
    cust[k] ||= { name: a.customer.name, phone: k, visits: 0, spend: 0, last: '', noshow: 0 };
    if (a.status === 'done') { cust[k].visits++; cust[k].spend += a.price; }
    if (a.status === 'noshow') cust[k].noshow++;
    if (a.date > cust[k].last) cust[k].last = a.date;
  });
  const rows = Object.values(cust).sort((a, b) => b.spend - a.spend);
  m.append(el('h3', { style: 'margin:var(--s7) 0 var(--s4)' }, 'ลูกค้าเรียงตามยอดใช้จ่าย'));
  const t = el('table', { class: 'tbl' });
  t.innerHTML = '<thead><tr><th>ลูกค้า</th><th>เบอร์โทร</th><th>มาแล้ว</th><th>ยอดสะสม</th><th>ครั้งล่าสุด</th><th>ไม่มาตามนัด</th><th>ระดับ</th></tr></thead>';
  const tb = el('tbody');
  rows.forEach(c => {
    const tier = c.spend >= 15000 ? '<span class="tag tag-gold">VVIP</span>' : c.spend >= 6000 ? '<span class="tag tag-info">ลูกค้าประจำ</span>' : '<span class="tag">ทั่วไป</span>';
    const tr = el('tr');
    tr.innerHTML = `<td><strong>${esc(c.name)}</strong></td><td class="num">${esc(c.phone)}</td>
      <td class="num">${c.visits}</td><td class="num">฿${fmtTHB(c.spend)}</td>
      <td class="num">${fmtDateTH(c.last, { dow: false })}</td>
      <td class="num">${c.noshow || '—'}</td><td>${tier}</td>`;
    tb.append(tr);
  });
  t.append(tb); m.append(el('div', { class: 'tblwrap' }, t));
  enhance(m);
}
function repeatCount(all) {
  const c = {}; all.forEach(a => c[a.customer.phone] = (c[a.customer.phone] || 0) + 1);
  return Object.values(c).filter(n => n > 1).length;
}
function chartCard(title, obj, fmt) {
  const entries = Object.entries(obj);
  const max = Math.max(1, ...entries.map(e => e[1]));
  const card = el('div', { class: 'card', style: 'margin-bottom:var(--s4)' }, el('h3', {}, title));
  const bars = el('div', { class: 'bars' });
  if (!entries.length) { card.append(el('p', { class: 'hint', style: 'margin-top:var(--s3)' }, 'ยังไม่มีข้อมูลในช่วงนี้')); return card; }
  entries.forEach(([k, v]) => bars.append(el('div', { class: 'b' },
    el('div', { class: 'bcol' },
      el('b', {}, fmt(v)),
      el('i', { style: `--v:${reduced() ? (v / max * 100) : 0}%` })),
    el('span', { title: k }, k))));
  card.append(bars);
  if (!reduced()) setTimeout(() =>
    [...bars.querySelectorAll('i')].forEach((n, i) => n.style.setProperty('--v', (entries[i][1] / max * 100) + '%')), 80);
  return card;
}

/* ============================================================
   VIEW 6 · BRAND & DATA (Phase 5 white-label)
   ============================================================ */
function renderBrand() {
  const m = $('#main'); m.innerHTML = '';
  const s = getSettingsSync();
  m.append(head('แบรนด์และข้อมูล', 'เปลี่ยนชื่อ สี และโทนของทั้งระบบให้เป็นของร้านคุณเอง มีผลทันทีทุกหน้า รวมถึงไอคอนบนแท็บเบราว์เซอร์'));

  const f = {
    wordmark: el('input', { class: 'input', value: s.wordmark }),
    tagline: el('input', { class: 'input', value: s.tagline }),
    tagTh: el('input', { class: 'input', value: s.tagTh }),
    phone: el('input', { class: 'input', value: s.phone }),
    line: el('input', { class: 'input', value: s.line }),
    address: el('input', { class: 'input', value: s.address }),
    hue: el('input', { type: 'range', min: 0, max: 360, value: s.hue, style: 'width:100%' }),
    chroma: el('input', { type: 'range', min: 0.02, max: 0.22, step: 0.005, value: s.chroma, style: 'width:100%' }),
    field: el('select', { class: 'select' }, el('option', { value: 'dark', selected: s.field !== 'cream' }, 'พื้นเข้ม (Noir)'), el('option', { value: 'cream', selected: s.field === 'cream' }, 'พื้นครีม (Ivoire)')),
  };
  const live = () => {
    document.documentElement.style.setProperty('--h', f.hue.value);
    document.documentElement.style.setProperty('--ca', f.chroma.value);
    document.documentElement.dataset.field = f.field.value;
    $('#hueVal').textContent = f.hue.value + '°';
    $('#chVal').textContent = (+f.chroma.value).toFixed(3);
  };
  f.hue.oninput = f.chroma.oninput = live; f.field.onchange = live;

  const presets = [['ทอง', 78, .105], ['กุหลาบทอง', 30, .095], ['มรกต', 165, .085], ['หมึกน้ำเงิน', 255, .12], ['พลัม', 330, .11], ['ดินเผา', 45, .12]];
  const prow = el('div', { class: 'row' });
  presets.forEach(([n, h, c]) => prow.append(el('button', {
    class: 'btn btn-sm btn-ghost', type: 'button',
    style: `border-color:oklch(.7 ${c} ${h});color:oklch(.78 ${c} ${h})`,
    onclick: () => { f.hue.value = h; f.chroma.value = c; live(); },
  }, n)));

  m.append(el('div', { class: 'grid g2', style: 'align-items:start' },
    el('div', { class: 'card' }, el('h3', {}, 'ตัวตนของร้าน'),
      el('div', { class: 'field', style: 'margin-top:var(--s4)' }, el('span', { class: 'lbl' }, 'ชื่อร้าน (Wordmark)'), f.wordmark),
      el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'ข้อความใต้ชื่อ (อังกฤษ)'), f.tagline),
      el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'ข้อความใต้ชื่อ (ไทย)'), f.tagTh),
      el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'โทรศัพท์'), f.phone),
      el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'LINE'), f.line),
      el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'ที่อยู่'), f.address)),
    el('div', { class: 'card' }, el('h3', {}, 'สีและโทน'),
      el('p', { class: 'hint', style: 'margin-top:6px' }, 'สีทั้งระบบสร้างจากเฉดสีเดียวด้วยสูตรเก้าระดับ จึงเปลี่ยนได้ทั้งชุดโดยยังคงค่าความต่างของสีตัวอักษรไว้'),
      el('div', { class: 'row', style: 'margin-top:var(--s4)' }, el('span', { class: 'lbl' }, 'ชุดสำเร็จ')), prow,
      el('div', { class: 'field', style: 'margin-top:var(--s4)' },
        el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'เฉดสี'), el('span', { class: 'num row-end', id: 'hueVal' }, s.hue + '°')), f.hue),
      el('div', { class: 'field', style: 'margin-top:var(--s3)' },
        el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'ความเข้ม'), el('span', { class: 'num row-end', id: 'chVal' }, (+s.chroma).toFixed(3))), f.chroma),
      el('div', { class: 'field', style: 'margin-top:var(--s3)' }, el('span', { class: 'lbl' }, 'พื้นหลัง'), f.field),
      el('div', { class: 'ledger', style: 'position:static;margin-top:var(--s5)' },
        el('div', { class: 'wm' }),
        el('div', { class: 'ledger-hd' }, el('div', {}, el('p', { class: 'lbl' }, 'ตัวอย่าง'),
          el('h3', { class: 'foil-text', style: 'margin-top:4px' }, f.wordmark.value || 'AURUM'))),
        el('div', { class: 'ledger-row' }, el('span', { class: 'k' }, 'บริการ'), el('span', { class: 'dots' }), el('span', { class: 'v' }, 'ตัด–จัดทรง')),
        el('div', { class: 'ledger-total' }, el('span', { class: 'lbl' }, 'รวม'), el('span', { class: 'amt' }, '฿1,800'))))));

  m.append(el('div', { class: 'row', style: 'margin-top:var(--s5)' },
    el('button', {
      class: 'btn btn-gold', onclick: async () => {
        await saveSettings({
          wordmark: f.wordmark.value.trim() || 'AURUM', salonName: f.wordmark.value.trim() || 'AURUM',
          tagline: f.tagline.value, tagTh: f.tagTh.value, phone: f.phone.value, line: f.line.value,
          address: f.address.value, hue: +f.hue.value, chroma: +f.chroma.value, field: f.field.value,
        });
        applyBrand(); toast('บันทึกแบรนด์แล้ว — ทุกหน้าเปลี่ยนตามทันที', 'ok'); render();
      }
    }, 'บันทึกแบรนด์'),
    el('button', { class: 'btn btn-ghost', onclick: () => { applyBrand(getSettingsSync()); render(); } }, 'ย้อนกลับ')));

  /* operating rules */
  const g = {
    slotStep: el('input', { class: 'input', type: 'number', min: 5, step: 5, value: s.slotStep }),
    buffer: el('input', { class: 'input', type: 'number', min: 0, step: 5, value: s.buffer }),
    leadMinutes: el('input', { class: 'input', type: 'number', min: 0, step: 30, value: s.leadMinutes }),
    horizonDays: el('input', { class: 'input', type: 'number', min: 1, max: 120, value: s.horizonDays }),
    cancelHours: el('input', { class: 'input', type: 'number', min: 0, value: s.cancelHours }),
    reminderHours: el('input', { class: 'input', type: 'number', min: 1, value: s.reminderHours }),
  };
  const lbl = { slotStep: 'ระยะห่างของช่องเวลา (นาที)', buffer: 'เวลาเก็บงานระหว่างคิว (นาที)', leadMinutes: 'ห้ามจองกระชั้นกว่า (นาที)', horizonDays: 'จองล่วงหน้าได้ (วัน)', cancelHours: 'ยกเลิกเองได้ก่อน (ชม.)', reminderHours: 'แจ้งเตือนล่วงหน้า (ชม.)' };
  const gr = el('div', { class: 'grid g3', style: 'margin-top:var(--s4)' });
  Object.entries(g).forEach(([k, node]) => gr.append(el('div', { class: 'field' }, el('span', { class: 'lbl' }, lbl[k]), node)));
  m.append(el('div', { class: 'card', style: 'margin-top:var(--s6)' }, el('h3', {}, 'กติกาการจอง'),
    el('p', { class: 'hint', style: 'margin-top:6px' }, 'ค่าเหล่านี้ถูกใช้โดยเครื่องคำนวณเวลาว่างโดยตรง เปลี่ยนแล้วเวลาที่ลูกค้าเห็นจะเปลี่ยนทันที'),
    gr, el('div', { class: 'row', style: 'margin-top:var(--s4)' }, el('button', {
      class: 'btn btn-gold btn-sm', onclick: async () => {
        await saveSettings(Object.fromEntries(Object.entries(g).map(([k, n]) => [k, +n.value])));
        toast('บันทึกกติกาการจองแล้ว', 'ok'); render();
      }
    }, 'บันทึกกติกา'))));

  /* data */
  m.append(el('div', { class: 'card', style: 'margin-top:var(--s6);background:var(--c-sunken)' },
    el('h3', {}, 'ข้อมูลของร้าน'),
    el('p', { class: 'hint', style: 'margin-top:6px;max-width:72ch' }, 'ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์เครื่องนี้ ส่งออกเป็นไฟล์เดียวได้ทุกเมื่อ และนำกลับเข้ามาได้เหมือนเดิม'),
    el('div', { class: 'row', style: 'margin-top:var(--s4)' },
      el('button', {
        class: 'btn btn-ghost btn-sm', onclick: () => {
          const blob = new Blob([exportDB()], { type: 'application/json' });
          const a = el('a', { href: URL.createObjectURL(blob), download: `aurum-${todayISO()}.json` });
          document.body.append(a); a.click(); a.remove(); toast('ส่งออกข้อมูลแล้ว', 'ok');
        }
      }, 'ส่งออกข้อมูล (JSON)'),
      el('label', { class: 'btn btn-ghost btn-sm', style: 'cursor:pointer' }, 'นำเข้าข้อมูล',
        el('input', {
          type: 'file', accept: 'application/json', style: 'display:none',
          onchange: async e => {
            const file = e.target.files[0]; if (!file) return;
            try { await importDB(await file.text()); await load(); applyBrand(); toast('นำเข้าข้อมูลเรียบร้อย', 'ok'); render(); }
            catch (ex) { toast('นำเข้าไม่สำเร็จ: ' + ex.message, 'err'); }
          }
        })),
      el('button', {
        class: 'btn btn-sm btn-danger row-end', onclick: async () => {
          if (!confirm('รีเซ็ตกลับเป็นข้อมูลตัวอย่าง? ข้อมูลปัจจุบันจะหายทั้งหมด')) return;
          await resetDB(); await load(); applyBrand(); toast('รีเซ็ตข้อมูลแล้ว', 'ok'); render();
        }
      }, 'รีเซ็ตเป็นข้อมูลตัวอย่าง'))));
  enhance(m);
}

/* ============================================================
   BOOT
   ============================================================ */
async function load() {
  [SERVICES, STAFF] = await Promise.all([listServices({ includeInactive: true }), listStaff({ includeInactive: true })]);
  SET = getSettingsSync();
}
function render() {
  ({ board: renderBoard, roster: renderRoster, services: renderServices,
     reminders: renderReminders, insights: renderInsights, brand: renderBrand }[view] || renderBoard)();
}
(async function init() {
  await load();
  renderSidebar();
  render();
  startScheduler((sent) => toast(`ส่งแจ้งเตือนอัตโนมัติแล้ว ${sent.length} รายการ`, 'ok'), 60000);
  $('#modal').addEventListener('close', () => { $('#mBody').innerHTML = ''; });
})();
