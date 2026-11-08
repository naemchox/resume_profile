/* ============================================================
   AURUM — booking.js
   PHASE 2 · THE GATEWAY — the one-page booking desk.

   Three panes, one screen, no wizard:
     01  left    calendar + the times free on that day
     02  middle  the service
     03  right   the artisan free for that day/time/service, then confirm

   The guest may work in any order. Every pane re-reads the same
   day matrix from the Phase 1 engine after every change, so what
   is shown is always what can actually be booked — and the
   confirm button re-validates once more before it writes.
   ============================================================ */

import { shell, toast, enhance, $, $$, el, esc, reduced } from './ui.js';
import {
  listServices, listStaff, getSettingsSync, todayISO, addDays, fromISO,
  fmtDateTH, fmtTHB, TH_MON, toMin, toHHMM,
} from './store.js';
import { daySlotMatrix, monthGrid, dayIsBookable, slotsFor, book } from './availability.js';

shell({ active: 'book' });

const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const MON_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
                'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

let SERVICES = [], STAFF = [], SET = getSettingsSync();
const S = {
  date: todayISO(),
  view: null,          // {y, m} of the month on screen
  time: null,
  serviceId: null,
  staffId: 'any',
  customer: { name: '', phone: '', email: '', note: '' },
};
let MATRIX = new Map();   // Map<"HH:MM", Map<serviceId, staffId[]>>
let selfWrite = false;    // our own save must not look like someone else's change
let finished = false;

const svc = (id = S.serviceId) => SERVICES.find(s => s.id === id);
const stf = (id) => STAFF.find(s => s.id === id);

/* ---------- derived ---------- */
/** Times offered in the left pane — narrowed to the chosen service when there is one. */
function timesForPane() {
  const out = [];
  for (const [t, byService] of MATRIX) {
    if (S.serviceId && !byService.has(S.serviceId)) continue;
    out.push({ time: t, services: byService });
  }
  return out;
}
/** Artisans able to take the current date + time + service. */
function artisansAvailable() {
  if (!S.serviceId) return null;
  if (S.time) return (MATRIX.get(S.time)?.get(S.serviceId) || []).map(stf).filter(Boolean);
  const set = new Set();
  for (const [, byService] of MATRIX) (byService.get(S.serviceId) || []).forEach(id => set.add(id));
  return [...set].map(stf).filter(Boolean);
}
function endTime() {
  const sv = svc();
  return sv && S.time ? toHHMM(toMin(S.time) + sv.dur) : null;
}
function ready() {
  return !!(S.date && S.time && S.serviceId && S.customer.name.trim() && S.customer.phone.trim());
}

/* ============================================================
   WAYS OUT — no dead end may be shown without its own exit.
   A guest who is told "nothing is free" has been handed work.
   Every empty state below carries a button that lands them on
   a slot that really exists, one tap, nothing to hunt for.
   ============================================================ */
let WAYOUT = new Map();   // the forward scan is not cheap; cleared on every refresh

/** Bookable start times on any date, for the chosen service (or for anything). */
function timesOn(dateISO, serviceId = S.serviceId) {
  if (dateISO === S.date && serviceId === S.serviceId) return timesForPane().map(t => t.time);
  return serviceId ? slotsFor(serviceId, dateISO).map(s => s.time)
                   : [...daySlotMatrix(dateISO).keys()];
}

/** The soonest (date, time) that can really be booked, scanning forward day by day. */
function nextOpening({ from = S.date, skipFirst = true, serviceId = S.serviceId } = {}) {
  const key = `n|${from}|${skipFirst}|${serviceId || ''}`;
  if (WAYOUT.has(key)) return WAYOUT.get(key);
  const last = addDays(todayISO(), SET.horizonDays);
  let found = null;
  for (let i = skipFirst ? 1 : 0; i <= SET.horizonDays; i++) {
    const d = addDays(from, i);
    if (d > last) break;
    const t = timesOn(d, serviceId);
    if (t.length) { found = { date: d, time: t[0] }; break; }
  }
  WAYOUT.set(key, found);
  return found;
}

/** The offered time closest to the one the guest wanted, on the day already on screen. */
function nearestTime(ref) {
  const list = timesForPane().map(t => t.time);
  if (!list.length) return null;
  if (!ref) return list[0];
  return list.reduce((best, t) =>
    Math.abs(toMin(t) - toMin(ref)) < Math.abs(toMin(best) - toMin(ref)) ? t : best);
}

/** "พรุ่งนี้" reads better on a button than "พฤ 4 ก.ย. 69". */
function relDay(iso) {
  const t = todayISO();
  if (iso === t) return 'วันนี้';
  if (iso === addDays(t, 1)) return 'พรุ่งนี้';
  if (iso === addDays(t, 2)) return 'มะรืนนี้';
  return fmtDateTH(iso, { short: true });
}

/** Move the whole desk onto a slot that exists — instead of telling the guest to go find one. */
function goTo(date, time = null) {
  S.date = date;
  S.time = time;
  const d = fromISO(date);
  S.view = { y: d.getFullYear(), m: d.getMonth() };
  refresh();
  toast(time ? `ย้ายให้แล้ว · ${fmtDateTH(date, { short: true })} ${time} น.`
             : `ย้ายให้แล้ว · ${fmtDateTH(date, { short: true })}`, 'ok');
  if (innerWidth <= 1180) focusPane(time ? '#paneArtisan' : '#paneWhen');
}

/** An empty state, plus the buttons that get out of it. Falsy actions are dropped. */
function deadEnd(title, hint, actions = []) {
  const box = el('div', { class: 'state dead' },
    el('div', { class: 'motif-loader', style: 'animation:none;opacity:.3' }),
    el('h3', { style: 'font-size:1.05rem' }, title));
  if (hint) box.append(el('p', { class: 'hint', style: 'max-width:34ch' }, hint));
  const list = actions.filter(Boolean);
  if (list.length) {
    const acts = el('div', { class: 'wayout' });
    list.forEach((a, i) => {
      const cls = `btn btn-block ${i === 0 ? 'btn-gold' : 'btn-ghost'}`;
      acts.append(a.href
        ? el('a', { class: cls, href: a.href }, a.label)
        : el('button', { class: cls, type: 'button', onclick: a.run }, a.label));
    });
    box.append(acts);
  }
  return box;
}

/** Last resort when the whole booking horizon is full — a phone number is still a way out. */
function callShop() {
  return SET.phone ? { href: 'tel:' + SET.phone.replace(/[^0-9+]/g, ''), label: `โทรหาร้าน · ${SET.phone}` } : null;
}

/** Drop any choice the latest data no longer supports, and say so once. */
function reconcileSelection(reason) {
  let lost = null;
  if (S.time && !MATRIX.has(S.time)) { S.time = null; lost = 'เวลา'; }
  if (S.time && S.serviceId && !MATRIX.get(S.time).has(S.serviceId)) { S.time = null; lost = 'เวลา'; }
  const list = artisansAvailable();
  if (S.staffId !== 'any' && list && !list.some(x => x.id === S.staffId)) { S.staffId = 'any'; lost ||= 'ช่าง'; }
  if (lost && reason) toast(`${reason} — ${lost}ที่เลือกไว้ไม่ว่างแล้ว กรุณาเลือกใหม่`, 'warn');
}

/* ============================================================
   PANE 01 — calendar + times
   ============================================================ */
function renderWhen() {
  const pane = $('#paneWhen');
  pane.dataset.done = !!(S.date && S.time);
  const body = $('#whenBody');
  body.innerHTML = '';

  /* --- month header --- */
  const { y, m } = S.view;
  const today = fromISO(todayISO());
  const lastAllowed = fromISO(addDays(todayISO(), SET.horizonDays));
  const atFirst = y === today.getFullYear() && m === today.getMonth();
  const atLast = y === lastAllowed.getFullYear() && m === lastAllowed.getMonth();

  body.append(el('div', { class: 'cal-hd' },
    el('span', { class: 'mon' }, `${MON_EN[m]} ${y + 543}`),
    el('button', { class: 'cal-nav', type: 'button', disabled: atFirst, 'aria-label': 'เดือนก่อนหน้า',
      onclick: () => { S.view = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }; renderWhen(); } }, '‹'),
    el('button', { class: 'cal-nav', type: 'button', disabled: atLast, 'aria-label': 'เดือนถัดไป',
      onclick: () => { S.view = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }; renderWhen(); } }, '›')));

  /* --- month grid --- */
  const grid = el('div', { class: 'cal-grid', role: 'grid', 'aria-label': 'เลือกวันที่' });
  DOW.forEach(d => grid.append(el('div', { class: 'cal-dow' }, d)));
  monthGrid(y, m, { serviceId: S.serviceId }).forEach(c => {
    if (!c.inMonth) { grid.append(el('span', { class: 'cal-day out', 'aria-hidden': 'true' })); return; }
    grid.append(el('button', {
      class: 'cal-day' + (c.isToday ? ' today' : ''),
      type: 'button', disabled: !c.bookable, 'aria-pressed': S.date === c.date,
      title: c.closed ? 'ร้านปิดทำการ' : c.bookable ? 'มีคิวว่าง' : 'ไม่มีคิวว่าง',
      onclick: () => { S.date = c.date; S.time = null; refresh(); },
    }, String(c.day)));
  });
  body.append(grid);
  body.append(el('div', { class: 'cal-legend' },
    el('span', {}, el('i', { style: 'background:var(--c-action)' }), 'วันนี้'),
    el('span', { style: 'opacity:.55' }, 'ตัวเลขจาง = ไม่มีคิวว่าง'),
    el('span', { class: 'row-end' }, `จองล่วงหน้าได้ ${SET.horizonDays} วัน`)));

  /* --- times --- */
  body.append(el('div', { class: 'pane-sub' }, `เวลา · ${fmtDateTH(S.date)}`));
  const times = timesForPane();
  if (!times.length) {
    const sv0 = svc();
    const nx = nextOpening();
    const elsewhereToday = !!(sv0 && MATRIX.size);   // the day has work, just not this service
    body.append(deadEnd(
      sv0 ? `${sv0.nameTh} เต็มแล้วในวันที่ ${fmtDateTH(S.date, { dow: false })}`
          : `วันที่ ${fmtDateTH(S.date, { dow: false })} เต็มแล้ว`,
      nx ? 'กดปุ่มเดียว ระบบย้ายให้ทันที'
         : 'ไม่มีคิวว่างเหลือในช่วงที่เปิดจองล่วงหน้า',
      [
        nx && { label: `คิวว่างที่ใกล้ที่สุด · ${relDay(nx.date)} ${nx.time} น.`,
                run: () => goTo(nx.date, nx.time) },
        elsewhereToday && { label: `ดูบริการอื่นที่ว่าง ${relDay(S.date)}`,
                run: () => { S.serviceId = null; S.staffId = 'any'; refresh(); focusPane('#paneService'); } },
        !nx && callShop(),
      ]));
    return;
  }
  const groups = { 'ช่วงเช้า': [], 'ช่วงบ่าย': [], 'ช่วงเย็น': [] };
  times.forEach(t => {
    const h = +t.time.slice(0, 2);
    groups[h < 12 ? 'ช่วงเช้า' : h < 17 ? 'ช่วงบ่าย' : 'ช่วงเย็น'].push(t);
  });
  Object.entries(groups).forEach(([label, list]) => {
    if (!list.length) return;
    body.append(el('div', { class: 'slotgroup-hd', style: 'margin-top:var(--s4)' },
      el('span', { class: 'lbl' }, label), el('span', { class: 'ln' }),
      el('span', { class: 'lbl' }, `${list.length}`)));
    const wrap = el('div', { class: 'slots' });
    list.forEach(t => {
      const nStaff = S.serviceId ? (t.services.get(S.serviceId) || []).length : 0;
      wrap.append(el('button', {
        class: 'slot' + (S.serviceId && nStaff === 1 ? ' scarce' : ''),
        type: 'button', 'aria-pressed': S.time === t.time,
        title: S.serviceId ? `ว่าง ${nStaff} ช่าง` : `${t.services.size} บริการที่ว่างช่วงนี้`,
        onclick: () => { S.time = S.time === t.time ? null : t.time; refresh(); },
      }, t.time));
    });
    body.append(wrap);
  });
}

/* ============================================================
   PANE 02 — the service
   ============================================================ */
function renderService() {
  const pane = $('#paneService');
  pane.dataset.done = !!S.serviceId;
  const body = $('#serviceBody');
  body.innerHTML = '';

  const atTime = S.time ? MATRIX.get(S.time) : null;
  const cats = [...new Set(SERVICES.map(s => s.cat))];

  cats.forEach(cat => {
    body.append(el('div', { class: 'pane-sub' }, cat));
    SERVICES.filter(s => s.cat === cat).forEach(sv => {
      const onDay = MATRIX.size ? [...MATRIX.values()].some(m => m.has(sv.id)) : false;
      const atSlot = atTime ? atTime.has(sv.id) : onDay;
      const free = atTime && atSlot ? `ว่าง ${atTime.get(sv.id).length} ช่าง`
                 : !onDay ? 'เต็มทั้งวัน'
                 : atTime ? 'ไม่ว่างเวลานี้' : 'มีคิวว่าง';
      body.append(el('button', {
        class: 'svc', type: 'button', disabled: !onDay, 'aria-pressed': S.serviceId === sv.id,
        onclick: () => {
          S.serviceId = S.serviceId === sv.id ? null : sv.id;
          if (S.time && S.serviceId && !MATRIX.get(S.time)?.has(S.serviceId)) {
            S.time = null;
            toast('บริการนี้ไม่ว่างในเวลาที่เลือกไว้ กรุณาเลือกเวลาใหม่ทางซ้าย', 'warn');
          }
          S.staffId = 'any';
          refresh();
        },
      },
        el('span', { class: 'n' }, sv.nameTh),
        el('span', { class: 'p' }, '฿' + fmtTHB(sv.price)),
        el('span', { class: 'm' }, `${sv.name} · ${sv.dur} นาที`),
        el('span', { class: 's' }, free),
        el('span', { class: 'd' }, sv.desc)));
    });
  });
}

/* ============================================================
   PANE 03 — the artisan, then confirm
   ============================================================ */
function renderArtisan() {
  const pane = $('#paneArtisan');
  pane.dataset.done = ready();
  const body = $('#artisanBody');
  body.innerHTML = '';

  const sv = svc();
  if (!sv) {
    body.append(deadEnd('เลือกบริการก่อน',
      'เมื่อเลือกบริการแล้ว ระบบจะแสดงเฉพาะช่างที่ว่างจริงในวันและเวลาที่คุณเลือก',
      [{ label: 'ไปเลือกบริการ', run: () => focusPane('#paneService') }]));
  } else {
    const list = artisansAvailable() || [];
    if (list.length) body.append(el('p', { class: 'pane-note' }, S.time
      ? `ช่างที่ว่างจริงวันที่ ${fmtDateTH(S.date, { dow: false })} เวลา ${S.time} น.`
      : 'ยังไม่ได้เลือกเวลา — นี่คือช่างทุกคนที่รับบริการนี้ในวันดังกล่าว'));

    if (!list.length) {
      const near = nearestTime(S.time);            // still something free on the day on screen
      const nx = near ? null : nextOpening();      // otherwise the soonest day that has anything
      body.append(deadEnd('ไม่มีช่างว่างในช่วงนี้',
        near ? 'ยังมีเวลาอื่นในวันเดียวกันที่จองบริการนี้ได้'
             : nx ? 'กดปุ่มเดียว ระบบย้ายให้ทันที'
                  : 'ไม่มีคิวว่างเหลือในช่วงที่เปิดจองล่วงหน้า',
        [
          near && { label: `เวลาที่ใกล้เคียงที่สุด · ${near} น.`,
                    run: () => { S.time = near; refresh(); } },
          nx && { label: `คิวว่างที่ใกล้ที่สุด · ${relDay(nx.date)} ${nx.time} น.`,
                  run: () => goTo(nx.date, nx.time) },
          !near && !nx && callShop(),
        ]));
    } else {
      body.append(el('button', {
        class: 'who', type: 'button', 'aria-pressed': S.staffId === 'any',
        onclick: () => { S.staffId = 'any'; refresh(); },
      },
        el('span', { class: 'portrait', style: 'width:42px;height:42px;font-size:.95rem' }, '✦'),
        el('span', { style: 'flex:1;min-width:0' },
          el('span', { class: 'nm', style: 'display:block' }, 'ช่างคนไหนก็ได้'),
          el('span', { class: 'tt' }, `ระบบจัดช่างที่ว่างให้ (${list.length} คน)`))));

      list.forEach(st => body.append(el('button', {
        class: 'who', type: 'button', 'aria-pressed': S.staffId === st.id,
        onclick: () => { S.staffId = st.id; refresh(); },
      },
        el('span', { class: 'portrait', style: 'width:42px;height:42px;font-size:.95rem' }, st.initial),
        el('span', { style: 'flex:1;min-width:0' },
          el('span', { class: 'nm', style: 'display:block' }, st.name),
          el('span', { class: 'tt' }, st.title)))));
    }
  }

  /* ---- confirm block ---- */
  const box = el('div', { class: 'confirm' });
  const row = (k, v, filled) => el('div', { class: 'ledger-row' + (filled ? '' : ' pending') },
    el('span', { class: 'k' }, k), el('span', { class: 'dots' }), el('span', { class: 'v' }, v));
  box.append(
    row('วันที่', S.date ? fmtDateTH(S.date) : '—', !!S.date),
    row('เวลา', S.time ? `${S.time} – ${endTime()} น.` : 'ยังไม่ได้เลือก', !!S.time),
    row('บริการ', sv ? sv.nameTh : 'ยังไม่ได้เลือก', !!sv),
    row('ช่าง', S.staffId === 'any' ? (sv ? 'ช่างคนไหนก็ได้' : 'ยังไม่ได้เลือก') : stf(S.staffId)?.name || '—', !!sv),
    el('div', { class: 'ledger-total' },
      el('span', { class: 'lbl' }, 'รวมชำระที่ร้าน'),
      el('span', { class: 'amt' }, sv ? '฿' + fmtTHB(sv.price) : '฿—')));

  const f = el('form', { class: 'stack', style: 'margin-top:var(--s5)', novalidate: true });
  const name = el('input', { class: 'input', id: 'cName', placeholder: 'ชื่อผู้จอง', autocomplete: 'name', value: S.customer.name });
  const phone = el('input', { class: 'input', id: 'cPhone', placeholder: '081-234-5678', inputmode: 'tel', autocomplete: 'tel', value: S.customer.phone });
  const email = el('input', { class: 'input', id: 'cEmail', type: 'email', placeholder: 'อีเมล (ไม่บังคับ)', autocomplete: 'email', value: S.customer.email });
  const note = el('textarea', { class: 'textarea', id: 'cNote', style: 'min-height:64px', placeholder: 'สิ่งที่อยากให้ช่างทราบล่วงหน้า (ไม่บังคับ)' });
  note.value = S.customer.note;
  [name, phone, email, note].forEach((n, i) => n.addEventListener('input', () => {
    S.customer[['name', 'phone', 'email', 'note'][i]] = n.value;
    updateCTA();
  }));

  /* the last two seconds before payment is decided — these two fields must not
     disappear into the page ground, so they get their own lit panel */
  f.append(el('div', { class: 'guest' },
    el('div', { class: 'guest-hd' },
      el('span', { class: 'lbl' }, 'ข้อมูลผู้จอง'),
      el('span', { class: 'req-note' }, 'จำเป็น 2 ช่อง')),
    el('div', { class: 'mini-grid' },
      el('div', { class: 'field req' }, el('label', { for: 'cName' }, 'ชื่อผู้จอง'), name),
      el('div', { class: 'field req' }, el('label', { for: 'cPhone' }, 'เบอร์โทร'), phone)),
    el('div', { class: 'field' }, el('label', { for: 'cEmail' }, 'อีเมล'), email),
    el('div', { class: 'field' }, el('label', { for: 'cNote' }, 'หมายเหตุ'), note)));

  const err = el('p', { class: 'err-text', id: 'formErr', role: 'alert', style: 'min-height:1.1em' });
  const cta = el('button', { class: 'btn btn-gold btn-block', id: 'cta', type: 'submit' }, 'ยืนยันการจอง');
  f.append(err, cta,
    el('p', { class: 'hint', style: 'text-align:center' },
      `ไม่ต้องมัดจำ · ยกเลิกเองได้ถึง ${SET.cancelHours} ชม. ก่อนถึงคิว`));

  f.addEventListener('submit', (e) => { e.preventDefault(); attemptSubmit(); });
  box.append(f);
  body.append(box);
  updateCTA();
}

/** What is still missing, as a label plus the pane that fixes it. */
function missingStep() {
  if (!S.serviceId) return { pane: '#paneService', cta: 'เลือกบริการ', label: 'เลือกบริการก่อน' };
  if (!S.time) return { pane: '#paneWhen', cta: 'เลือกเวลา', label: 'เลือกวันและเวลาก่อน' };
  if (!S.customer.name.trim() || !S.customer.phone.trim())
    return { pane: '#paneArtisan', cta: 'กรอกข้อมูล', label: 'กรอกชื่อและเบอร์โทร', focus: '#cName' };
  return null;
}

/** Bring a step into view under the fixed nav — the mobile bar's guidance. */
function focusPane(sel, focusField) {
  const n = $(sel); if (!n) return;
  const y = n.getBoundingClientRect().top + scrollY - (innerWidth <= 840 ? 60 : 92);
  scrollTo({ top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth' });
  if (focusField) setTimeout(() => $(focusField)?.focus({ preventScroll: true }), reduced() ? 0 : 420);
}

/** Keep both call-to-actions (the form's and the mobile bar's) in step. */
function updateCTA() {
  const miss = missingStep();
  const cta = $('#cta');
  if (cta) {
    cta.setAttribute('aria-disabled', !!miss);
    cta.textContent = miss ? miss.label : 'ยืนยันการจอง';
  }
  const bar = $('#deskbar'), title = $('#barTitle'), sub = $('#barSub'), bcta = $('#barCta');
  if (!bar || finished) return;
  const sv = svc();
  bcta.textContent = miss ? miss.cta : 'ยืนยันการจอง';
  bcta.classList.toggle('btn-ghost', !!miss);
  bcta.classList.toggle('btn-gold', !miss);
  title.textContent = sv ? sv.nameTh : 'ยังไม่ได้เลือกบริการ';
  const bits = [fmtDateTH(S.date, { short: true })];
  if (S.time) bits.push(`${S.time}–${endTime()} น.`);
  if (sv) bits.push('฿' + fmtTHB(sv.price));
  if (S.staffId !== 'any') bits.push(stf(S.staffId)?.name || '');
  sub.textContent = bits.filter(Boolean).join(' · ');
}

/* ---------- the write ---------- */
function attemptSubmit() {
  const miss = missingStep();
  if (miss) { toast(miss.label, 'warn'); focusPane(miss.pane, miss.focus); return; }
  const err = $('#formErr');
  if (err) err.textContent = '';
  const buttons = [$('#cta'), $('#barCta')].filter(Boolean);
  buttons.forEach(b => { b.disabled = true; b.textContent = 'กำลังตรวจสอบ…'; });
  setTimeout(() => {
    try {
      const pool = MATRIX.get(S.time)?.get(S.serviceId) || [];
      const staffId = S.staffId === 'any' ? pool[0] : S.staffId;
      if (!staffId) throw new Error('ขออภัย เวลานี้เพิ่งถูกจองไปเมื่อครู่ กรุณาเลือกเวลาอื่น');
      let appt;
      selfWrite = true;
      try {
        appt = book({ serviceId: S.serviceId, staffId, date: S.date, start: S.time, customer: S.customer });
      } finally { selfWrite = false; }
      finished = true;
      done(appt);
    } catch (ex) {
      if (err) err.textContent = ex.message;
      $('#cPhone')?.setAttribute('aria-invalid', /เบอร์โทร/.test(ex.message));
      toast(ex.message, 'err');
      buttons.forEach(b => { b.disabled = false; });
      refresh();
      if (/เวลา/.test(ex.message)) focusPane('#paneWhen');
    }
  }, 380);
}

/* ---------- success ---------- */
function done(appt) {
  const sv = svc(appt.serviceId), st = stf(appt.staffId);
  $('#deskbar')?.remove();   // its clearance is scoped with :has(), so it goes too
  const host = $('#desk');
  host.style.display = 'block';
  host.innerHTML = '';
  const rows = [['บริการ', sv.nameTh], ['ผู้ให้บริการ', st.name],
                ['วันที่', fmtDateTH(appt.date)], ['เวลา', `${appt.start} – ${appt.end} น.`]];
  const card = el('div', { class: 'ledger', style: 'position:static;max-width:560px;margin-inline:auto' },
    el('div', { class: 'wm', 'aria-hidden': 'true' }),
    el('div', { style: 'text-align:center;margin-bottom:var(--s5)' },
      el('div', { class: 'portrait portrait-lg', style: 'margin-inline:auto' }, '✦'),
      el('h2', { style: 'margin-top:var(--s4)' }, 'จองคิวเรียบร้อย'),
      el('p', { class: 'hint', style: 'margin-top:6px' }, 'บันทึกรหัสนี้ไว้สำหรับตรวจสอบ เลื่อน หรือยกเลิกคิว')),
    el('div', { style: 'text-align:center;padding:var(--s4);border:1px dashed var(--c-line);border-radius:var(--r-md);margin-bottom:var(--s5)' },
      el('p', { class: 'lbl' }, 'รหัสยืนยัน'),
      el('p', { class: 'num', style: 'font-size:2.1rem;color:var(--c-action);letter-spacing:.1em;margin-top:4px' }, appt.code)),
    el('div', {}, ...rows.map(([k, v]) => el('div', { class: 'ledger-row' },
      el('span', { class: 'k' }, k), el('span', { class: 'dots' }), el('span', { class: 'v' }, v)))),
    el('div', { class: 'ledger-total' },
      el('span', { class: 'lbl' }, 'ชำระที่ร้าน'),
      el('span', { class: 'amt' }, '฿' + fmtTHB(appt.price))),
    el('p', { class: 'hint', style: 'margin-top:var(--s5)' },
      `เราจะส่งข้อความแจ้งเตือนล่วงหน้า ${SET.reminderHours} ชั่วโมงไปที่ ${esc(appt.customer.phone)} · ยกเลิกเองได้ถึง ${SET.cancelHours} ชม. ก่อนถึงคิว`),
    el('div', { class: 'row', style: 'margin-top:var(--s5)' },
      el('a', { class: 'btn btn-gold', href: 'manage.html?code=' + appt.code }, 'ดู / จัดการคิวนี้'),
      el('a', { class: 'btn btn-ghost', href: 'book.html' }, 'จองอีกคิว')));
  host.append(card);
  card.querySelectorAll('.ledger-row').forEach((r, i) => setTimeout(() => r.classList.add('filled'), i * 70));
  toast(`จองคิวสำเร็จ · รหัส <strong>${appt.code}</strong>`, 'ok', 7000);
  scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  history.replaceState(null, '', 'book.html#done');
}

/* ---------- the single re-render everything goes through ---------- */
function refresh(reason) {
  MATRIX = daySlotMatrix(S.date);
  WAYOUT = new Map();          // availability may have moved since the last look
  reconcileSelection(reason);
  renderWhen(); renderService(); renderArtisan();
  enhance($('#desk'));
}

/* ---------- boot ---------- */
(async function init() {
  [SERVICES, STAFF] = await Promise.all([listServices(), listStaff()]);
  SET = getSettingsSync();

  /* land on the first day that actually has something free */
  let d = todayISO();
  for (let i = 0; i < SET.horizonDays && !dayIsBookable(d); i++) d = addDays(todayISO(), i + 1);
  S.date = d;
  const dd = fromISO(d);
  S.view = { y: dd.getFullYear(), m: dd.getMonth() };

  const pre = new URLSearchParams(location.search).get('service');
  if (pre && SERVICES.some(s => s.id === pre)) S.serviceId = pre;

  $('#barCta').addEventListener('click', attemptSubmit);
  refresh();
  /* another tab (or the shop's own screen) changed the data — re-read, but never
     react to the write this page just made itself */
  window.addEventListener('aurum:changed', () => {
    if (selfWrite || finished) return;
    refresh('มีการเปลี่ยนแปลงคิว');
  });
})();
