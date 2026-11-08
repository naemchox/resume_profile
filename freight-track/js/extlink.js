/* ============================================================
   extlink.js — คนขับภายนอก: สร้างลิงก์ · คัดลอก · ปิดลิงก์
   ใช้ร่วมกันระหว่างหน้ากระดานงาน (ops) และหน้าทะเบียนคนขับ (drivers)
   หลักคิด: 1 ลิงก์ = คนขับ 1 คน ถืองานได้หลายใบ
   ============================================================ */

import { esc, modal, close, toast, confirmDialog, pill } from './ui.js';
import {
  createExternalDriver, setLinkActive, getDriver, listShipments,
  isExternal, isLinkOpen, isOpen,
  driverName,
} from './store.js';
import { driverUrl } from './config.js';

/** ลิงก์เต็มของคนขับภายนอก — ชี้ไปหน้าคนขับตาม DRIVER_URL ใน config.js (แยกโดเมนได้) */
export const driverLinkUrl = (d) => driverUrl(`k=${encodeURIComponent(d.token)}`);

/** คัดลอกลิงก์ — ถ้าเบราว์เซอร์ไม่ให้ (เช่น file://) ก็เลือกข้อความไว้ให้กด Ctrl+C เอง */
export async function copyLink(url, input){
  try{
    if (!navigator.clipboard?.writeText) throw new Error('no-clipboard');
    await navigator.clipboard.writeText(url);
    toast('คัดลอกลิงก์แล้ว — ส่งให้คนขับทางไลน์ได้เลย', 'ok');
  }catch(e){
    input?.focus();
    input?.select();
    toast('เบราว์เซอร์ไม่ให้คัดลอกอัตโนมัติ — กด Ctrl/Cmd + C ได้เลย', 'warn');
  }
}

/* ---------- สร้างคนขับภายนอกคนใหม่ -------------------------- */
/**
 * ฟอร์มกรอกข้อมูลคนขับนอก แล้วสร้างลิงก์ให้
 * @param {(driver:object) => void} onCreated  เรียกหลังสร้างสำเร็จ (เอาไปจ่ายงานต่อ)
 */
export function newExternalDialog(onCreated){
  modal({
    title: 'คนขับภายนอก — สร้างลิงก์ใหม่',
    body: `
<p class="muted small">
  ใช้ตอนจ้างคนขับนอกที่ไม่มีบัญชีในระบบ กรอกข้อมูลเท่าที่มี ระบบจะออกลิงก์เฉพาะของคนคนนี้ให้
  คนขับเปิดลิงก์แล้วเห็นเฉพาะงานที่จ่ายผ่านลิงก์นี้เท่านั้น
</p>

<div class="grid g2" style="gap:14px;margin-top:16px">
  <label class="field" style="grid-column:1/-1">
    <span class="label">ชื่อคนขับ<span class="req">*</span></span>
    <input class="input" data-f="name" placeholder="เช่น สมศักดิ์ ใจดี (รถร่วม)" autocomplete="off">
  </label>
  <label class="field">
    <span class="label">เบอร์โทร<span class="req">*</span></span>
    <input class="input" data-f="phone" placeholder="081-234-5678" inputmode="tel" autocomplete="off">
  </label>
  <label class="field">
    <span class="label">ทะเบียนรถ<span class="req">*</span></span>
    <input class="input" data-f="plate" placeholder="70-8842 กทม." autocomplete="off">
    <span class="hint">ห้ามซ้ำกับคนขับคนอื่นในระบบ</span>
  </label>
</div>

<p class="tiny dim" style="margin-top:14px">
  ลิงก์นี้เปิดได้โดยไม่ต้องล็อกอิน ส่งให้เฉพาะคนขับที่รับงานจริง และกดปิดลิงก์ได้ทุกเมื่อเมื่อจบงาน
</p>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>สร้างลิงก์และจ่ายงาน</button>`,
    onMount(root){
      const val = (n) => root.querySelector(`[data-f="${n}"]`).value.trim();
      root.querySelector('[data-f="name"]').focus();
      root.querySelector('[data-ok]').onclick = () => {
        try{
          const d = createExternalDriver({ name:val('name'), phone:val('phone'), plate:val('plate') });
          close();
          onCreated?.(d);
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

/* ---------- ลิงก์ของคนขับภายนอก ----------------------------- */
/** แผงจัดการลิงก์ — คัดลอก ดูงานที่ผูกอยู่ และเปิด/ปิดลิงก์ */
export function linkDialog(id){
  const d = getDriver(id);
  if (!isExternal(d)) return toast('ไม่พบคนขับภายนอกคนนี้', 'err');

  const url  = driverLinkUrl(d);
  const jobs = listShipments({ driverId: d.id });
  const live = isLinkOpen(d);
  const openJobs = jobs.filter(j => isOpen(j.status));

  modal({
    title: `ลิงก์งานของ ${esc(driverName(d))}`,
    body: `
<div class="stack gap-16">
  <div class="panel">
    <div class="row between gap-10" style="align-items:flex-start">
      <div>
        <div class="strong">${esc(driverName(d))}</div>
        <div class="tiny dim">${esc(d.phone)} · ${esc(d.plate)}</div>
      </div>
      <span class="pill" data-tone="${live ? 'done' : 'grey'}">${live ? 'ลิงก์เปิดอยู่' : 'ลิงก์ถูกปิดแล้ว'}</span>
    </div>
  </div>

  <div class="field">
    <span class="label">ลิงก์สำหรับคนขับ</span>
    <div class="row gap-8 wraps">
      <input class="input mono grow" data-linkurl value="${esc(url)}" readonly style="min-width:min(360px,100%)">
      <button class="btn btn-accent" data-copy ${live ? '' : 'disabled'}>คัดลอกลิงก์</button>
    </div>
    <span class="hint">${live
      ? 'ส่งลิงก์นี้ให้คนขับทางไลน์หรือ SMS — เปิดแล้วใช้ได้เลย ไม่ต้องล็อกอิน'
      : 'ลิงก์ถูกปิดอยู่ คนขับเปิดแล้วจะไม่เห็นงาน กด “เปิดลิงก์อีกครั้ง” ถ้าต้องใช้ต่อ'}</span>
  </div>

  <div>
    <div class="row between baseline gap-10" style="margin-bottom:8px">
      <span class="label">งานที่ผูกกับลิงก์นี้</span>
      <span class="tiny dim">${jobs.length} ใบ · ค้างอยู่ ${openJobs.length} ใบ</span>
    </div>
    ${jobs.length ? `
    <ul class="stack gap-8" style="list-style:none;padding:0;margin:0">
      ${jobs.map(j => `
      <li class="row between gap-10" style="padding:8px 10px;border:1px solid var(--line);border-radius:10px">
        <span class="row gap-8 wraps" style="align-items:baseline">
          <span class="code">${esc(j.code)}</span>
          <span class="tiny dim trunc">${esc(j.dropoff.name)}</span>
        </span>
        ${pill(j.status)}
      </li>`).join('')}
    </ul>` : '<p class="small dim">ยังไม่มีงานผูกกับลิงก์นี้</p>'}
  </div>

  <p class="tiny dim">
    ใครก็ตามที่ได้ลิงก์นี้ไปจะเปิดดูงานข้างต้นได้ทันที ถ้าลิงก์หลุดให้กดปิดลิงก์แล้วสร้างใหม่
  </p>
</div>`,
    foot: `<button class="btn btn-ghost" data-close>ปิดหน้าต่าง</button>
           <span class="grow"></span>
           ${live
             ? `<button class="btn btn-danger" data-revoke>ปิดลิงก์</button>`
             : `<button class="btn btn-accent" data-open>เปิดลิงก์อีกครั้ง</button>`}`,
    onMount(root){
      const input = root.querySelector('[data-linkurl]');
      root.querySelector('[data-copy]')?.addEventListener('click', () => copyLink(url, input));
      input.addEventListener('focus', () => input.select());

      root.querySelector('[data-revoke]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: `ปิดลิงก์ของ ${d.name}`,
          message: openJobs.length
            ? `คนขับจะเปิดลิงก์นี้ไม่ได้อีกทันที และงานที่ค้างอยู่ ${openJobs.length} ใบจะไม่มีใครเข้าถึง — อย่าลืมย้ายงานให้คนขับคนอื่นที่กระดานงาน`
            : 'คนขับจะเปิดลิงก์นี้ไม่ได้อีก ประวัติงานและหลักฐานที่บันทึกไว้ยังอยู่ครบ เปิดกลับมาได้ทุกเมื่อ',
          ok: 'ปิดลิงก์',
          tone: 'btn-danger',
        });
        if (!ok) return linkDialog(id);
        try{
          setLinkActive(id, false);
          toast('ปิดลิงก์แล้ว', 'warn');
          linkDialog(id);
        }catch(err){ toast(err.message, 'err'); linkDialog(id); }
      });

      root.querySelector('[data-open]')?.addEventListener('click', () => {
        try{
          setLinkActive(id, true);
          toast('เปิดลิงก์อีกครั้งแล้ว', 'ok');
          linkDialog(id);
        }catch(err){ toast(err.message, 'err'); }
      });
    },
  });
}
