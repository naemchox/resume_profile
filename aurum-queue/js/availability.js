/* ============================================================
   AURUM — availability.js
   PHASE 1 · THE CORE — the availability engine.

   This is the file that has to be right. Everything else is
   presentation. Two guarantees:

   1. A slot is offered only if the whole appointment (service
      duration + clean-down buffer) fits inside a real free
      window of a real member of staff on that date.
   2. Booking is re-validated against live data at write time,
      so a slot that went stale while the guest was choosing is
      REJECTED rather than double-booked.
   ============================================================ */

import {
  _rawDB, _save, uid, toMin, toHHMM, todayISO, fromISO, addDays,
} from './store.js';

const BLOCKING = new Set(['booked', 'confirmed', 'done']);   // 'cancelled' / 'noshow' free the slot

/* merge overlapping [a,b) intervals, minutes-from-midnight */
function merge(list) {
  const s = list.filter(x => x.e > x.s).sort((a, b) => a.s - b.s);
  const out = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv.s <= last.e) last.e = Math.max(last.e, iv.e);
    else out.push({ ...iv });
  }
  return out;
}
/* subtract a set of busy intervals from a set of open intervals */
function subtract(open, busy) {
  let cur = merge(open);
  for (const b of merge(busy)) {
    const next = [];
    for (const o of cur) {
      if (b.e <= o.s || b.s >= o.e) { next.push(o); continue; }
      if (b.s > o.s) next.push({ s: o.s, e: b.s });
      if (b.e < o.e) next.push({ s: b.e, e: o.e });
    }
    cur = next;
  }
  return cur.filter(iv => iv.e > iv.s);
}

/** Windows the salon-wide calendar closes. */
export function isSalonClosed(dateISO) {
  return _rawDB().closures.some(c => c.date === dateISO);
}

/**
 * Free intervals (in minutes from midnight) for one member of staff on one date,
 * with every constraint applied: roster · breaks · time off · booked work · buffer.
 */
export function freeIntervals(staffId, dateISO, { ignoreApptId = null } = {}) {
  const db = _rawDB();
  const st = db.staff.find(s => s.id === staffId);
  if (!st || !st.active) return [];
  if (isSalonClosed(dateISO)) return [];

  const dow = fromISO(dateISO).getDay();
  const open = (st.hours[dow] || []).map(w => ({ s: toMin(w.start), e: toMin(w.end) }));
  if (!open.length) return [];

  const busy = [];

  // breaks — 'all' applies every working day, or a specific dow
  for (const b of st.breaks || []) {
    if (b.dow === 'all' || Number(b.dow) === dow) busy.push({ s: toMin(b.start), e: toMin(b.end) });
  }
  // time off
  for (const t of st.timeOff || []) {
    if (t.date !== dateISO) continue;
    busy.push(t.allDay ? { s: 0, e: 1440 } : { s: toMin(t.start), e: toMin(t.end) });
  }
  // existing work + clean-down buffer on both sides
  const buf = db.settings.buffer || 0;
  for (const a of db.appointments) {
    if (a.staffId !== staffId || a.date !== dateISO) continue;
    if (!BLOCKING.has(a.status)) continue;
    if (ignoreApptId && a.id === ignoreApptId) continue;
    busy.push({ s: toMin(a.start) - buf, e: toMin(a.end) + buf });
  }
  // lead time — nothing bookable within `leadMinutes` of right now
  if (dateISO === todayISO()) {
    const now = new Date();
    busy.push({ s: 0, e: now.getHours() * 60 + now.getMinutes() + (db.settings.leadMinutes || 0) });
  }

  return subtract(open, busy);
}

/**
 * Bookable start times for a service on a date.
 * @returns {{time:string, staffIds:string[], scarce:boolean}[]}
 */
export function slotsFor(serviceId, dateISO, { staffId = null } = {}) {
  const db = _rawDB();
  const sv = db.services.find(s => s.id === serviceId);
  if (!sv) return [];

  const step = db.settings.slotStep || 15;
  const need = sv.dur;                         // buffer already carved out of neighbours
  const pool = (staffId ? [staffId] : sv.staff).filter(id => {
    const st = db.staff.find(s => s.id === id); return st && st.active;
  });

  const byTime = new Map();
  for (const id of pool) {
    for (const iv of freeIntervals(id, dateISO)) {
      // align the first candidate up to the grid
      const first = Math.ceil(iv.s / step) * step;
      for (let t = first; t + need <= iv.e; t += step) {
        const key = toHHMM(t);
        if (!byTime.has(key)) byTime.set(key, []);
        byTime.get(key).push(id);
      }
    }
  }

  const total = pool.length || 1;
  return [...byTime.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, staffIds]) => ({ time, staffIds, scarce: staffIds.length === 1 && total > 1 }));
}

/** How many bookable starts exist on a date — powers the date rail. */
export function dayCapacity(serviceId, dateISO, opts = {}) {
  return slotsFor(serviceId, dateISO, opts).length;
}

/** The next N dates from `fromISO` with their free-slot counts. */
export function dateRail(serviceId, fromDate, days, opts = {}) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(fromDate, i);
    out.push({ date: d, free: dayCapacity(serviceId, d, opts), closed: isSalonClosed(d) });
  }
  return out;
}

/**
 * THE GUARD. Re-checks against live data, then writes.
 * Throws with a human message when the slot is no longer real.
 */
export function book({ serviceId, staffId, date, start, customer, source = 'web' }) {
  const db = _rawDB();
  const sv = db.services.find(s => s.id === serviceId);
  if (!sv) throw new Error('ไม่พบบริการที่เลือก');
  if (!sv.staff.includes(staffId)) throw new Error('ช่างท่านนี้ไม่ได้ให้บริการรายการนี้');
  if (!customer?.name?.trim()) throw new Error('กรุณากรอกชื่อผู้จอง');
  if (!/^0\d{1,2}[- ]?\d{3}[- ]?\d{4}$/.test((customer.phone || '').trim()))
    throw new Error('เบอร์โทรไม่ถูกต้อง (ตัวอย่าง 081-234-5678)');

  const horizon = db.settings.horizonDays || 30;
  if (date < todayISO() || date > addDays(todayISO(), horizon))
    throw new Error(`จองได้ล่วงหน้าไม่เกิน ${horizon} วัน`);

  const s = toMin(start), e = s + sv.dur;
  const fits = freeIntervals(staffId, date).some(iv => s >= iv.s && e <= iv.e);
  if (!fits) throw new Error('ขออภัย เวลานี้เพิ่งถูกจองไปเมื่อครู่ กรุณาเลือกเวลาอื่น');

  const appt = {
    id: uid('ap'),
    code: 'AU-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    serviceId, staffId, date, start, end: toHHMM(e), price: sv.price,
    status: 'booked',
    customer: {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      email: (customer.email || '').trim(),
      note: (customer.note || '').trim(),
    },
    createdAt: new Date().toISOString(), source, reminders: [],
  };
  db.appointments.push(appt);

  // PHASE 4 hand-off: queue the 24h reminder the moment the slot is real
  const remindAt = new Date(fromISO(date));
  remindAt.setMinutes(toMin(start) - (db.settings.reminderHours || 24) * 60);
  db.reminders.push({
    id: uid('rm'), apptId: appt.id, sendAt: remindAt.toISOString(),
    kind: 'reminder-24h', status: remindAt > new Date() ? 'scheduled' : 'skipped',
    channel: 'line', attempts: 0, sentAt: null, error: null,
  });

  _save();
  return JSON.parse(JSON.stringify(appt));
}

/** Move an existing appointment — same guard, ignoring its own block. */
export function reschedule(apptId, { date, start, staffId }) {
  const db = _rawDB();
  const a = db.appointments.find(x => x.id === apptId);
  if (!a) throw new Error('ไม่พบคิวนี้');
  const sv = db.services.find(s => s.id === a.serviceId);
  const st = staffId || a.staffId;
  const s = toMin(start), e = s + sv.dur;
  const fits = freeIntervals(st, date, { ignoreApptId: apptId }).some(iv => s >= iv.s && e <= iv.e);
  if (!fits) throw new Error('ช่วงเวลาใหม่ไม่ว่างสำหรับช่างท่านนี้');
  a.date = date; a.start = start; a.end = toHHMM(e); a.staffId = st;

  /* move the reminder with the appointment — and re-arm one that had been skipped
     because the original booking sat inside the reminder window */
  const rm = db.reminders.find(r => r.apptId === apptId && r.status !== 'sent' && r.status !== 'failed');
  if (rm) {
    const t = new Date(fromISO(date));
    t.setMinutes(s - (db.settings.reminderHours || 24) * 60);
    rm.sendAt = t.toISOString();
    rm.status = t > new Date() ? 'scheduled' : 'skipped';
  }
  _save();
  return JSON.parse(JSON.stringify(a));
}

/** Cancel — respects the cancellation window for guest-initiated cancels. */
export function cancel(apptId, { byGuest = false } = {}) {
  const db = _rawDB();
  const a = db.appointments.find(x => x.id === apptId);
  if (!a) throw new Error('ไม่พบคิวนี้');
  if (byGuest) {
    const when = fromISO(a.date); when.setMinutes(toMin(a.start));
    const hrs = (when - new Date()) / 36e5;
    if (hrs < (db.settings.cancelHours || 12))
      throw new Error(`ยกเลิกเองได้ก่อนถึงคิวอย่างน้อย ${db.settings.cancelHours} ชม. กรุณาโทรหาร้าน`);
  }
  a.status = 'cancelled';
  db.reminders.forEach(r => { if (r.apptId === apptId && r.status === 'scheduled') r.status = 'cancelled'; });
  _save();
  return JSON.parse(JSON.stringify(a));
}

/* ============================================================
   Views for the one-page booking desk (three panes, any order)
   ============================================================ */

/**
 * Everything bookable on one date, indexed by start time:
 *   Map<"HH:MM", Map<serviceId, staffId[]>>
 * One pass gives all three panes what they need — which times exist,
 * which services fit a chosen time, and who is free for that pair.
 */
export function daySlotMatrix(dateISO) {
  const db = _rawDB();
  const out = new Map();
  for (const sv of db.services) {
    if (!sv.active) continue;
    for (const s of slotsFor(sv.id, dateISO)) {
      if (!out.has(s.time)) out.set(s.time, new Map());
      out.get(s.time).set(sv.id, s.staffIds);
    }
  }
  return new Map([...out.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Cheap "is anything bookable at all here" test — powers the month grid. */
export function dayIsBookable(dateISO, { serviceId = null } = {}) {
  const db = _rawDB();
  if (isSalonClosed(dateISO)) return false;
  if (serviceId) return slotsFor(serviceId, dateISO).length > 0;
  for (const st of db.staff) {
    if (!st.active) continue;
    const durs = db.services.filter(s => s.active && s.staff.includes(st.id)).map(s => s.dur);
    if (!durs.length) continue;
    const need = Math.min(...durs);
    if (freeIntervals(st.id, dateISO).some(iv => iv.e - iv.s >= need)) return true;
  }
  return false;
}

/**
 * A 6×7 calendar grid for one month, Sunday-first, with each cell already
 * told whether it can be booked.
 */
export function monthGrid(year, month, { serviceId = null } = {}) {
  const db = _rawDB();
  const today = todayISO();
  const last = addDays(today, db.settings.horizonDays || 30);
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  /* only the weeks this month actually touches — a fixed 6-row grid leaves a
     dead band at the bottom of most months, which is very visible on a phone */
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
  const cells = [];
  for (let i = 0; i < cellCount; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const past = iso < today, beyond = iso > last;
    cells.push({
      date: iso, day: d.getDate(), inMonth: d.getMonth() === month,
      isToday: iso === today, past, beyond,
      closed: isSalonClosed(iso),
      bookable: !past && !beyond && dayIsBookable(iso, { serviceId }),
    });
  }
  return cells;
}

/** Occupancy of one staff member on a date — 0..1. Powers the board and analytics. */
export function utilisation(staffId, dateISO) {
  const db = _rawDB();
  const st = db.staff.find(s => s.id === staffId);
  if (!st) return { booked: 0, open: 0, pct: 0 };
  const dow = fromISO(dateISO).getDay();
  const open = merge((st.hours[dow] || []).map(w => ({ s: toMin(w.start), e: toMin(w.end) })))
    .reduce((n, iv) => n + (iv.e - iv.s), 0);
  const booked = db.appointments
    .filter(a => a.staffId === staffId && a.date === dateISO && BLOCKING.has(a.status))
    .reduce((n, a) => n + (toMin(a.end) - toMin(a.start)), 0);
  return { booked, open, pct: open ? booked / open : 0 };
}
