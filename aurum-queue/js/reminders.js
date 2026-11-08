/* ============================================================
   AURUM — reminders.js
   PHASE 4 · THE ASSISTANT — automatic 24-hour reminders.

   A slot becoming real is the trigger: availability.book()
   queues the job. This module owns the rest of the lifecycle —
   scheduling drift, the due sweep, the webhook dispatch and
   the audit trail the shop can actually inspect.

   Webhook payload is provider-agnostic JSON; point it at LINE
   Messaging API, an SMS gateway, Make or Zapier.
   ============================================================ */

import { _rawDB, _save, uid, fromISO, toMin, fmtDateTH, fmtTHB, todayISO } from './store.js';

const BOOKED = new Set(['booked', 'confirmed']);
const SETTLED = new Set(['sent', 'failed']);   // already attempted — never re-armed here

/** Reconcile the queue with reality — run on every admin load. */
export function reconcile() {
  const db = _rawDB();
  const hours = db.settings.reminderHours || 24;
  let added = 0, cancelled = 0, revived = 0, moved = 0;

  for (const a of db.appointments) {
    const has = db.reminders.find(r => r.apptId === a.id && r.kind === 'reminder-24h');
    if (!BOOKED.has(a.status)) {
      if (has && has.status === 'scheduled') { has.status = 'cancelled'; cancelled++; }
      continue;
    }
    const at = fromISO(a.date); at.setMinutes(toMin(a.start) - hours * 60);
    const want = at > new Date() ? 'scheduled' : 'skipped';
    if (!has) {
      db.reminders.push({
        id: uid('rm'), apptId: a.id, sendAt: at.toISOString(), kind: 'reminder-24h',
        status: want, channel: 'line', attempts: 0, sentAt: null, error: null,
      });
      added++;
    } else if (!SETTLED.has(has.status)) {
      /* The appointment moved, so the reminder moves with it — and a job that was
         skipped (booked inside the reminder window) or cancelled must be able to
         come BACK to 'scheduled' when the new time is far enough out again. */
      if (has.sendAt !== at.toISOString() || has.status !== want) {
        has.sendAt = at.toISOString();
        if (has.status !== want) { has.status = want; if (want === 'scheduled') revived++; }
        moved++;
      }
    }
  }
  if (added || cancelled || moved) _save();
  return { added, cancelled, revived, moved };
}

export function listReminders() {
  const db = _rawDB();
  return db.reminders
    .map(r => ({ ...r, appt: db.appointments.find(a => a.id === r.apptId) || null }))
    .filter(r => r.appt)
    .sort((a, b) => new Date(a.sendAt) - new Date(b.sendAt));
}

export function due(now = new Date()) {
  return listReminders().filter(r => r.status === 'scheduled' && new Date(r.sendAt) <= now);
}

/** The message the guest actually receives. */
export function compose(appt) {
  const db = _rawDB();
  const sv = db.services.find(s => s.id === appt.serviceId);
  const st = db.staff.find(s => s.id === appt.staffId);
  const s = db.settings;
  return [
    `เรียนคุณ${appt.customer.name.replace(/^คุณ/, '')} — ${s.wordmark} ขอเรียนยืนยันคิวของท่านพรุ่งนี้`,
    ``,
    `บริการ  ${sv?.nameTh || '-'}`,
    `ผู้ให้บริการ  ${st?.name || '-'}`,
    `วันเวลา  ${fmtDateTH(appt.date)} เวลา ${appt.start} น.`,
    `ค่าบริการ  ฿${fmtTHB(appt.price)} (ชำระที่ร้าน)`,
    `รหัสคิว  ${appt.code}`,
    ``,
    `หากต้องการเลื่อนหรือยกเลิก กรุณาแจ้งล่วงหน้าอย่างน้อย ${s.cancelHours} ชั่วโมง`,
    `โทร ${s.phone} · LINE ${s.line}`,
  ].join('\n');
}

function payload(r) {
  const db = _rawDB();
  const a = r.appt || db.appointments.find(x => x.id === r.apptId);
  return {
    event: 'appointment.reminder',
    sentAt: new Date().toISOString(),
    channel: r.channel,
    salon: { name: db.settings.wordmark, phone: db.settings.phone, line: db.settings.line },
    to: { name: a.customer.name, phone: a.customer.phone, email: a.customer.email || null },
    appointment: {
      code: a.code, date: a.date, start: a.start, end: a.end,
      service: db.services.find(s => s.id === a.serviceId)?.nameTh,
      staff: db.staff.find(s => s.id === a.staffId)?.name,
      price: a.price,
    },
    text: compose(a),
  };
}

/** Dispatch one reminder. Falls back to a recorded dry-run when no webhook is set. */
export async function dispatch(reminderId, { force = false } = {}) {
  const db = _rawDB();
  const r = db.reminders.find(x => x.id === reminderId);
  if (!r) throw new Error('ไม่พบรายการแจ้งเตือน');
  if (r.status === 'sent' && !force) return r;
  const body = payload({ ...r, appt: db.appointments.find(a => a.id === r.apptId) });
  r.attempts++;

  const url = db.settings.webhookUrl;
  if (db.settings.webhookEnabled && url) {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      r.status = 'sent'; r.sentAt = new Date().toISOString(); r.error = null;
    } catch (e) {
      r.status = 'failed'; r.error = String(e.message || e);
    }
  } else {
    // dry run — the shop can read exactly what would have gone out
    r.status = 'sent'; r.sentAt = new Date().toISOString();
    r.error = null; r.dryRun = true;
  }
  r.lastPayload = body;
  const a = db.appointments.find(x => x.id === r.apptId);
  if (a) a.reminders = [...(a.reminders || []), { at: r.sentAt, kind: r.kind, dryRun: !!r.dryRun }];
  _save();
  return { ...r };
}

/** Sweep everything that has come due. Called on a timer by the admin page. */
export async function runDue() {
  const list = due();
  const out = [];
  for (const r of list) out.push(await dispatch(r.id));
  return out;
}

/** Start the background sweep (admin page only — this is the "cron" stand-in). */
export function startScheduler(onRun, everyMs = 60000) {
  reconcile();
  const tick = async () => {
    const sent = await runDue();
    if (sent.length) onRun?.(sent);
  };
  tick();
  return setInterval(tick, everyMs);
}

/** Fire a test payload at the configured webhook so the shop can verify it end to end. */
export async function testWebhook() {
  const db = _rawDB();
  if (!db.settings.webhookUrl) throw new Error('ยังไม่ได้ใส่ URL ปลายทาง');
  const sample = db.appointments.find(a => BOOKED.has(a.status)) || db.appointments[0];
  const res = await fetch(db.settings.webhookUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload({ apptId: sample.id, channel: 'test', appt: sample }), event: 'webhook.test' }),
  });
  if (!res.ok) throw new Error('ปลายทางตอบกลับ HTTP ' + res.status);
  return true;
}
