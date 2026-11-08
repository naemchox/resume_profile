/* ============================================================
   users.js — ผู้ใช้และสิทธิ์ (admin เท่านั้น)

   ตารางบน  พนักงานออฟฟิศ — คอลเลกชัน staff ใน Firestore (รหัสเอกสาร = อีเมลตัวพิมพ์เล็ก)
            { email, name, role, pages:{ <หน้า>: 'none'|'view'|'edit' }, active, removed,
              invitedBy, invitedAt, updatedBy, updatedAt, lastLoginAt }
            pages เก็บเฉพาะหน้าที่ตั้งต่างจากค่าตามบทบาท — ไม่ได้ตั้ง = ตามบทบาท
   ตารางล่าง คนขับ — ข้อมูลเดียวกับหน้าข้อมูลคนขับ (store.js) อ่านอย่างเดียว แก้ที่หน้านั้น

   ถอดพนักงาน = ติดธง removed ไว้ ไม่ลบเอกสาร
   (admin ชุดแรกจาก config.js จะถูกสร้างใหม่ให้เองถ้าเอกสารหายไป — ติดธงไว้จึงไม่กลับมาเอง)
   ============================================================ */

import { shell, $, esc, toast, modal, close, confirmDialog, on } from './ui.js';
import { listDrivers, isActiveDriver, isExternal, isLinkOpen, driverStats, subscribe, ago, prepareForRules, driverName } from './store.js';
import { gate, getSession } from './auth.js';
import { copyLink } from './extlink.js';
import { STAFF_URL } from './config.js';
import {
  ROLES, GRANTABLE, LEVELS, levelOf, roleDefault, roleLabel, levelLabel, isActiveStaff,
} from './access.js';

await gate('users');
shell({ role: 'Admin' });

const me = getSession().staff;
const fb = window.firebase;
let staff = [];          /* ทุกเอกสารใน staff รวมที่ถูกถอด */
let invites = [];        /* ลิงก์เชิญทั้งหมด (คอลเลกชัน invites · รหัสเอกสาร = รหัสในลิงก์) */
let loaded = false;

const visible = () => staff.filter(s => !s.removed)
  .sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) || String(a.name || a.email).localeCompare(String(b.name || b.email), 'th'));
const activeAdmins = () => staff.filter(s => isActiveStaff(s) && s.role === 'admin');
const emailKey = (v) => String(v || '').trim().toLowerCase();
const nowIso = () => new Date().toISOString();

/* ---------- KPI ---------- */
function paintKpi(){
  const office = staff.filter(isActiveStaff);
  const drivers = listDrivers();
  const items = [
    { label:'พนักงานออฟฟิศ', value:office.length, foot:'ใช้งานได้', accent:'violet' },
    { label:'Admin', value:activeAdmins().length, foot:'จัดการสิทธิ์ได้', accent:'amber' },
    { label:'คนขับในบริษัท', value:drivers.filter(d => !isExternal(d) && isActiveDriver(d)).length, foot:'ล็อกอินด้วย ID', accent:'green' },
    { label:'คนขับภายนอก', value:drivers.filter(d => isExternal(d) && isLinkOpen(d)).length, foot:'ลิงก์เปิดอยู่', accent:'blue' },
  ];
  $('#kpis').innerHTML = items.map(k => `
    <div class="kpi" data-accent="${k.accent}">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-foot">${esc(k.foot)}</div>
    </div>`).join('');
}

/* ---------- ตารางพนักงาน ---------- */
function permChips(s){
  if (s.role === 'admin') return '<span class="perm-chip" data-l="edit"><b>ทุกหน้า</b> · แก้ไขได้</span>';
  const got = GRANTABLE.map(p => [p, levelOf(s, p.key)]).filter(([, l]) => l !== 'none');
  if (!got.length) return '<span class="tiny dim">ยังไม่มีหน้าที่เห็นได้</span>';
  return `<div class="perm-chips">${got.map(([p, l]) =>
    `<span class="perm-chip" data-l="${l}">${esc(p.label)} · ${l === 'edit' ? 'แก้ได้' : 'ดู'}</span>`).join('')}</div>`;
}
function staffPill(s){
  if (!isActiveStaff(s)) return '<span class="pill" data-tone="grey">ปิดใช้งาน</span>';
  if (s.role === 'pending') return '<span class="pill" data-tone="wait">รอกำหนดสิทธิ์</span>';
  if (!s.lastLoginAt)    return '<span class="pill" data-tone="wait">รอเข้าครั้งแรก</span>';
  return '<span class="pill" data-tone="done">ใช้งานอยู่</span>';
}

function paintStaff(){
  const rows = visible();
  $('#staffRows').innerHTML = rows.map(s => {
    const off = !isActiveStaff(s);
    const self = s.id === me?.id;
    return `
<tr${off ? ' style="opacity:.62"' : ''}>
  <td style="max-width:260px">
    <span class="strong">${esc(s.name || s.email)}</span>${self ? ' <span class="tiny" style="color:var(--amber-dim);font-weight:600">· คุณ</span>' : ''}
    <br><span class="tiny dim mono trunc" style="display:block">${esc(s.email)}</span>
    ${s.joinedVia ? '<span class="tiny dim">เข้าร่วมผ่านลิงก์เชิญ</span>' : ''}
  </td>
  <td><span class="strong">${esc(roleLabel(s.role))}</span></td>
  <td style="max-width:360px">${permChips(s)}</td>
  <td><span class="tiny dim nowrap">${esc(s.lastLoginAt ? ago(s.lastLoginAt) : '—')}</span></td>
  <td>${staffPill(s)}</td>
  <td class="right">
    <span class="row gap-8" style="justify-content:flex-end;flex-wrap:nowrap">
      <button class="btn btn-quiet btn-sm" data-act="edit" data-id="${esc(s.id)}">แก้ไขสิทธิ์</button>
      <button class="btn btn-ghost btn-sm" data-act="toggle" data-id="${esc(s.id)}">${off ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</button>
      <button class="btn btn-danger btn-sm" data-act="remove" data-id="${esc(s.id)}">ถอดออก</button>
    </span>
  </td>
</tr>`;
  }).join('');
  $('#staffEmpty').innerHTML = rows.length ? '' :
    `<div class="empty"><p class="small">${loaded ? 'ยังไม่มีพนักงาน — กด “เชิญพนักงาน” เพื่อเพิ่มอีเมลแรก' : 'กำลังโหลด…'}</p></div>`;
}

/* ---------- ตารางคนขับ ---------- */
function paintDrivers(){
  const rows = listDrivers().slice()
    .sort((a, b) => Number(isExternal(a)) - Number(isExternal(b)) || String(a.name).localeCompare(String(b.name), 'th'));
  $('#driverRows').innerHTML = rows.map(d => {
    const ext = isExternal(d);
    const on = ext ? isLinkOpen(d) : isActiveDriver(d);
    const st = driverStats(d.id);
    return `
<tr${on ? '' : ' style="opacity:.62"'}>
  <td style="max-width:230px">
    <span class="strong">${esc(driverName(d))}</span>
    ${ext ? ' <span class="tiny" style="color:var(--amber-dim);font-weight:600">· ภายนอก</span>' : ''}
    <br><span class="tiny dim mono">${esc(d.phone || '—')}</span>
  </td>
  <td>${ext
    ? '<span class="tiny">ลิงก์เฉพาะตัว</span><br><span class="tiny dim">ไม่ต้องล็อกอิน</span>'
    : `<span class="code">ID ${esc(d.sheetId || '—')}</span><br><span class="tiny dim">+ รหัสผ่านใน Google Sheet</span>`}</td>
  <td><span class="code">${esc(d.plate || '—')}</span><br><span class="tiny dim">${esc(d.truck || '—')}</span></td>
  <td><span class="tiny">หน้าคนขับ · เห็นเฉพาะงานของตัวเอง</span><br><span class="tiny dim">งานค้าง ${st.open} · ทั้งหมด ${st.total}</span></td>
  <td>${on ? '<span class="pill" data-tone="done">ใช้งานอยู่</span>' : `<span class="pill" data-tone="grey">${ext ? 'ลิงก์ถูกปิด' : 'ปิดใช้งาน'}</span>`}</td>
  <td class="right"><a class="btn btn-ghost btn-sm" href="drivers.html">แก้ที่หน้าข้อมูลคนขับ →</a></td>
</tr>`;
  }).join('');
  $('#driverEmpty').innerHTML = rows.length ? '' :
    '<div class="empty"><p class="small">ยังไม่มีคนขับ — เพิ่มที่หน้าข้อมูลคนขับ</p></div>';
}

function paint(){ paintKpi(); paintStaff(); paintDrivers(); }

/* ---------- ฟอร์มเชิญ / แก้ไขสิทธิ์ ---------- */
function staffForm(s){
  const add = !s;
  const v = s || { email:'', name:'', role:'warehouse', pages:{} };
  const pageRow = (p) => {
    const own = v.pages?.[p.key] || '';
    return `<tr>
      <td><b>${esc(p.label)}</b></td>
      <td><select class="select" data-page="${p.key}">
        <option value="">ตามบทบาท</option>
        ${LEVELS.map(l => `<option value="${l.key}"${own === l.key ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}
      </select></td>
    </tr>`;
  };

  modal({
    title: add ? 'เชิญพนักงานเข้า Back office' : `แก้ไขสิทธิ์ · ${esc(v.name || v.email)}`,
    wide: true,
    body: `
<div class="stack gap-16">
  <div class="grid g2" style="gap:14px">
    <label class="field">
      <span class="label">อีเมล Google<span class="req">*</span></span>
      <input class="input" data-f="email" type="email" value="${esc(v.email)}" placeholder="name@gmail.com" ${add ? '' : 'readonly'}>
      <span class="hint">${add ? 'ต้องเป็นอีเมลที่ใช้ล็อกอิน Google ได้ (Gmail หรืออีเมลบริษัทที่ใช้ Google Workspace)' : 'เปลี่ยนอีเมลไม่ได้ — ถ้าผิด ให้ถอดออกแล้วเชิญอีเมลใหม่'}</span>
    </label>
    <label class="field">
      <span class="label">ชื่อที่แสดง</span>
      <input class="input" data-f="name" value="${esc(v.name || '')}" placeholder="คุณสมศรี ฝ่ายบัญชี">
      <span class="hint">เว้นว่างได้ — ระบบใช้ชื่อจากบัญชี Google ตอนเข้าครั้งแรก</span>
    </label>
  </div>

  <div class="field">
    <span class="label">บทบาท</span>
    <div class="role-opts">
      ${ROLES.map(r => `<label class="role-opt">
        <input type="radio" name="role" value="${r.key}"${v.role === r.key ? ' checked' : ''}>
        <span><b>${esc(r.label)}</b><span>${esc(r.desc)}</span></span>
      </label>`).join('')}
    </div>
  </div>

  <div class="field" data-pages>
    <span class="label">สิทธิ์รายหน้า</span>
    <span class="hint" data-pages-hint></span>
    <table class="perm-table"><tbody>${GRANTABLE.map(pageRow).join('')}</tbody></table>
  </div>
  <p class="tiny dim" data-admin-note hidden>Admin เห็นทุกหน้า แก้ได้ทุกอย่าง รวมถึงหน้าผู้ใช้และสิทธิ์ — ตั้งรายหน้าไม่ได้</p>
  <p class="err" data-err></p>
</div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>${add ? 'เชิญ' : 'บันทึก'}</button>`,
    onMount(root){
      const roleNow = () => root.querySelector('input[name="role"]:checked')?.value || 'warehouse';
      /* ตัวเลือก "ตามบทบาท" บอกด้วยว่าบทบาทนั้นให้อะไร */
      function refresh(){
        const r = roleNow();
        const admin = r === 'admin';
        root.querySelector('[data-pages]').hidden = admin;
        root.querySelector('[data-admin-note]').hidden = !admin;
        root.querySelectorAll('select[data-page]').forEach(sel => {
          sel.options[0].textContent = `ตามบทบาท (${levelLabel(roleDefault(r, sel.dataset.page))})`;
        });
        root.querySelector('[data-pages-hint]').textContent =
          `ปกติได้ตามบทบาท “${roleLabel(r)}” — เปลี่ยนเฉพาะหน้าที่อยากให้ต่างจากบทบาท เช่น เพิ่มหน้าให้เห็นแบบดูอย่างเดียว`;
      }
      root.querySelectorAll('input[name="role"]').forEach(i => i.addEventListener('change', refresh));
      refresh();

      root.querySelector('[data-ok]').onclick = async () => {
        const err = root.querySelector('[data-err]');
        err.textContent = '';
        const email = emailKey(root.querySelector('[data-f="email"]').value);
        const name = root.querySelector('[data-f="name"]').value.trim();
        const role = roleNow();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ err.textContent = 'อีเมลไม่ถูกต้อง'; return; }

        const existing = staff.find(x => x.id === email);
        if (add && existing && !existing.removed){ err.textContent = 'อีเมลนี้อยู่ในรายชื่อแล้ว — กด “แก้ไขสิทธิ์” ที่แถวของอีเมลนี้แทน'; return; }

        /* ต้องเหลือ admin อย่างน้อย 1 คน */
        const target = existing && !existing.removed ? existing : null;
        if (target && isActiveStaff(target) && target.role === 'admin' && role !== 'admin' && activeAdmins().length <= 1){
          err.textContent = 'คนนี้เป็น admin คนสุดท้าย — เพิ่ม admin คนอื่นก่อน แล้วค่อยเปลี่ยนบทบาทคนนี้';
          return;
        }
        /* admin ลดสิทธิ์ตัวเองไม่ได้ (กฎฐานข้อมูลปฏิเสธ — QA TC-031) ให้ admin คนอื่นเป็นคนเปลี่ยน */
        if (target?.id === me?.id && me.role === 'admin' && role !== 'admin'){
          err.textContent = 'เปลี่ยนบทบาทของตัวเองไม่ได้ — ให้ admin คนอื่นเป็นคนเปลี่ยนให้';
          return;
        }

        const pages = {};
        if (role !== 'admin'){
          root.querySelectorAll('select[data-page]').forEach(sel => { if (sel.value) pages[sel.dataset.page] = sel.value; });
        }
        const data = {
          email, name, role, pages, active:true, removed:false,
          updatedBy:me.email, updatedAt:nowIso(),
          ...(target ? {} : { invitedBy:me.email, invitedAt:nowIso() }),
        };
        const btn = root.querySelector('[data-ok]');
        btn.disabled = true;
        try{
          /* merge: false สำหรับ pages — ต้องแทนทั้งก้อน ไม่งั้นหน้าที่เปลี่ยนกลับเป็น "ตามบทบาท" จะค้างค่าเก่า */
          const ref = fb.doc(fb.db, 'staff', email);
          const prev = existing || {};
          await fb.setDoc(ref, { ...prev, ...data, pages });
          close();
          toast(add ? `เชิญ ${email} แล้ว — ให้เจ้าของอีเมลเข้าเว็บแล้วกด “เข้าสู่ระบบด้วย Google”` : 'บันทึกสิทธิ์แล้ว', 'ok', 4200);
          if (target?.id === me?.id && role !== 'admin') setTimeout(() => location.replace(STAFF_URL), 900);
        }catch(e){
          console.error(e);
          err.textContent = 'บันทึกไม่สำเร็จ — ' + (e.code === 'permission-denied' ? 'ไม่มีสิทธิ์' : e.message);
        }finally{ btn.disabled = false; }
      };
    },
  });
}

/* ---------- ปุ่มเชิญพนักงาน: เลือกวิธี ---------- */
function inviteChooser(){
  modal({
    title:'เชิญพนักงาน',
    body: `
<div class="stack gap-12">
  <button class="role-opt" type="button" data-way="link" style="text-align:left;background:none;width:100%">
    <span><b>สร้างลิงก์เชิญ</b><span>ลิงก์เดียวส่งให้ทั้งออฟฟิศ ใครเปิดแล้วล็อกอิน Google ก็เข้าร่วมได้ — แล้วค่อยกำหนดบทบาททีหลัง</span></span>
  </button>
  <button class="role-opt" type="button" data-way="email" style="text-align:left;background:none;width:100%">
    <span><b>เชิญด้วยอีเมล</b><span>ใส่อีเมลทีละคน และกำหนดบทบาทกับสิทธิ์รายหน้าไว้เลย</span></span>
  </button>
</div>`,
    onMount(root){
      root.querySelector('[data-way="link"]').onclick = () => { close(); inviteLinkDialog(); };
      root.querySelector('[data-way="email"]').onclick = () => { close(); staffForm(null); };
    },
  });
}

/* ---------- ลิงก์เชิญ ----------
   มีลิงก์ที่ใช้ได้ทีละ 1 ลิงก์ — สร้างใหม่แล้วลิงก์เก่าถูกปิด
   คนที่เข้าร่วมได้บทบาทตั้งต้นของลิงก์ (ปกติ "รอกำหนดสิทธิ์") — ห้ามตั้งเป็น admin ผ่านลิงก์ */
const inviteUrl = (token) => new URL(`${STAFF_URL}?invite=${encodeURIComponent(token)}`, location.href).href;
const liveInvite = () => invites
  .filter(i => i.active !== false && !(i.expiresAt && Date.parse(i.expiresAt) < Date.now()))
  .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '';
const newToken = () => {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(36).padStart(2, '0')).join('').slice(0, 24);
};

let renewing = false;    /* กด "สร้างลิงก์ใหม่แทน" — เปิดหน้าตั้งค่าโดยที่ลิงก์เดิมยังใช้ได้จนกว่าจะกดสร้างจริง */
function inviteLinkDialog(){
  const cur = renewing ? null : liveInvite();
  renewing = false;
  const joined = cur ? staff.filter(s => s.joinedVia === cur.id).length : 0;
  const LINK_ROLES = ROLES.filter(r => r.key !== 'admin');
  modal({
    title:'ลิงก์เชิญเข้า Back office',
    wide:true,
    body: cur ? `
<div class="stack gap-14">
  <div class="field">
    <span class="label">ลิงก์ที่ใช้ได้ตอนนี้</span>
    <div class="row gap-8">
      <input class="input mono grow" data-url readonly value="${esc(inviteUrl(cur.id))}">
      <button class="btn btn-accent" type="button" data-copy>คัดลอก</button>
    </div>
    <span class="hint">ส่งลิงก์นี้ในกลุ่มออฟฟิศ — คนที่เปิดต้องล็อกอินด้วยบัญชี Google ของตัวเอง</span>
  </div>
  <div class="grid g3" style="gap:10px">
    <div class="panel"><span class="tiny dim">บทบาทที่ได้เมื่อเข้าร่วม</span><br><b>${esc(roleLabel(cur.role || 'pending'))}</b></div>
    <div class="panel"><span class="tiny dim">หมดอายุ</span><br><b>${cur.expiresAt ? esc(fmtWhen(cur.expiresAt)) : 'ไม่หมดอายุ'}</b></div>
    <div class="panel"><span class="tiny dim">เข้าร่วมผ่านลิงก์นี้แล้ว</span><br><b>${joined} คน</b></div>
  </div>
  <p class="tiny dim">สร้างโดย ${esc(cur.createdBy || '—')} · ${esc(fmtWhen(cur.createdAt))} — อีเมลที่อยู่ในรายชื่ออยู่แล้ว หรือเคยถูกถอด/ปิดใช้งาน จะใช้ลิงก์นี้เข้ามาเองไม่ได้</p>
</div>` : `
<div class="stack gap-14">
  <p class="small muted" style="margin:0">ยังไม่มีลิงก์ที่ใช้ได้ — ตั้งค่าแล้วกดสร้างลิงก์</p>
  <div class="grid g2" style="gap:14px">
    <label class="field">
      <span class="label">บทบาทที่ได้เมื่อเข้าร่วม</span>
      <select class="select" data-role>
        ${LINK_ROLES.map(r => `<option value="${r.key}"${r.key === 'pending' ? ' selected' : ''}>${esc(r.label)}${r.key === 'pending' ? ' (แนะนำ)' : ''}</option>`).join('')}
      </select>
      <span class="hint" data-role-hint></span>
    </label>
    <label class="field">
      <span class="label">ลิงก์หมดอายุใน</span>
      <select class="select" data-exp>
        <option value="1">1 วัน</option>
        <option value="7" selected>7 วัน</option>
        <option value="30">30 วัน</option>
        <option value="0">ไม่หมดอายุ</option>
      </select>
      <span class="hint">หมดอายุแล้ว คนที่เข้าร่วมไปแล้วยังใช้งานได้ตามปกติ</span>
    </label>
  </div>
</div>`,
    foot: cur
      ? `<button class="btn btn-danger" data-off>ปิดลิงก์นี้</button>
         <span class="grow"></span>
         <button class="btn btn-ghost" data-renew>สร้างลิงก์ใหม่แทน</button>
         <button class="btn btn-quiet" data-close>ปิดหน้าต่าง</button>`
      : `<button class="btn btn-ghost" data-close>ยกเลิก</button>
         <button class="btn btn-accent" data-make>สร้างลิงก์</button>`,
    onMount(root){
      if (cur){
        root.querySelector('[data-copy]').onclick = () => copyLink(inviteUrl(cur.id), root.querySelector('[data-url]'));
        root.querySelector('[data-off]').onclick = async () => {
          const ok = await confirmDialog({ title:'ปิดลิงก์เชิญ', message:'ปิดแล้วคนที่ยังไม่ได้เข้าร่วมจะใช้ลิงก์นี้ไม่ได้ — คนที่เข้าร่วมไปแล้วยังใช้งานได้ตามปกติ', ok:'ปิดลิงก์', tone:'btn-danger' });
          if (!ok) return;
          try{ await fb.updateDoc(fb.doc(fb.db, 'invites', cur.id), { active:false, closedBy:me.email, closedAt:nowIso() }); toast('ปิดลิงก์แล้ว', 'ok'); }
          catch(e){ toast('ปิดลิงก์ไม่สำเร็จ — ' + e.message, 'err'); }
        };
        /* สร้างใหม่ = ไปหน้าตั้งค่า (ลิงก์เดิมถูกปิดตอนกดสร้างจริง) */
        root.querySelector('[data-renew]').onclick = () => { close(); renewing = true; inviteLinkDialog(); };
        return;
      }
      const roleSel = root.querySelector('[data-role]');
      const hint = () => {
        root.querySelector('[data-role-hint]').textContent = roleSel.value === 'pending'
          ? 'เข้าร่วมแล้วยังไม่เห็นหน้าไหน จนกว่า admin จะกำหนดบทบาท — ปลอดภัยถ้าลิงก์หลุดไปถึงคนนอก'
          : `ทุกคนที่มีลิงก์จะได้สิทธิ์ “${roleLabel(roleSel.value)}” ทันที — ส่งเฉพาะในกลุ่มออฟฟิศเท่านั้น`;
      };
      roleSel.onchange = hint; hint();
      root.querySelector('[data-make]').onclick = async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        const days = Number(root.querySelector('[data-exp]').value);
        const token = newToken();
        try{
          /* ปิดลิงก์เก่าที่ยังเปิดอยู่ทั้งหมดก่อน — มีลิงก์ที่ใช้ได้ทีละลิงก์ */
          for (const i of invites.filter(i => i.active !== false)){
            await fb.updateDoc(fb.doc(fb.db, 'invites', i.id), { active:false, closedBy:me.email, closedAt:nowIso() }).catch(() => {});
            i.active = false;
          }
          const doc = {
            role:roleSel.value, active:true, uses:0,
            createdBy:me.email, createdAt:nowIso(),
            expiresAt: days ? new Date(Date.now() + days * 864e5).toISOString() : null,
            expiresMs: days ? Date.now() + days * 864e5 : 0,   /* กฎฐานข้อมูลเทียบเวลาได้แค่ตัวเลข · 0 = ไม่หมดอายุ */
          };
          await fb.setDoc(fb.doc(fb.db, 'invites', token), doc);
          close();
          /* ใส่ไว้ก่อน snapshot มาถึง จะได้เปิดหน้าลิงก์ที่เพิ่งสร้างได้ทันที */
          if (!invites.some(i => i.id === token)) invites.push({ id:token, ...doc });
          toast('สร้างลิงก์เชิญแล้ว — คัดลอกไปส่งในกลุ่มออฟฟิศได้เลย', 'ok');
          inviteLinkDialog();
        }catch(err){
          console.error(err);
          toast('สร้างลิงก์ไม่สำเร็จ — ' + (err.code === 'permission-denied' ? 'ไม่มีสิทธิ์' : err.message), 'err');
          btn.disabled = false;
        }
      };
    },
  });
}

/* ---------- ปิด/เปิดใช้งาน · ถอดออก ---------- */
async function toggleActive(s){
  const turnOff = isActiveStaff(s);
  if (turnOff && s.role === 'admin' && activeAdmins().length <= 1){
    return toast('คนนี้เป็น admin คนสุดท้าย — เพิ่ม admin คนอื่นก่อน', 'warn', 4200);
  }
  const self = s.id === me?.id;
  if (self && turnOff && me?.role === 'admin') return toast('admin ปิดใช้งานตัวเองไม่ได้ — ให้ admin คนอื่นทำให้', 'warn', 4200);
  const ok = await confirmDialog({
    title: turnOff ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
    message: turnOff
      ? `${s.name || s.email} จะเข้า Back office ไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง${self ? ' — รวมถึงตัวคุณเองทันทีที่บันทึก' : ''}`
      : `${s.name || s.email} จะกลับมาเข้าได้ตามสิทธิ์เดิม`,
    ok: turnOff ? 'ปิดใช้งาน' : 'เปิดใช้งาน', tone: turnOff ? 'btn-danger' : 'btn-accent',
  });
  if (!ok) return;
  try{
    await fb.updateDoc(fb.doc(fb.db, 'staff', s.id), { active:!turnOff, updatedBy:me.email, updatedAt:nowIso() });
    toast(turnOff ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว', 'ok');
    if (self && turnOff) setTimeout(() => location.replace(STAFF_URL), 700);
  }catch(e){ toast('บันทึกไม่สำเร็จ — ' + e.message, 'err'); }
}

async function removeStaff(s){
  if (isActiveStaff(s) && s.role === 'admin' && activeAdmins().length <= 1){
    return toast('คนนี้เป็น admin คนสุดท้าย — เพิ่ม admin คนอื่นก่อน', 'warn', 4200);
  }
  if (s.id === me?.id && me?.role === 'admin') return toast('admin ถอดตัวเองออกไม่ได้ — ให้ admin คนอื่นทำให้', 'warn', 4200);
  const self = s.id === me?.id;
  const ok = await confirmDialog({
    title:'ถอดออกจากระบบ',
    message:`${s.name || s.email} จะถูกเอาออกจากรายชื่อและเข้า Back office ไม่ได้อีก${self ? ' — รวมถึงตัวคุณเองทันที' : ''} · ถ้าต้องการให้กลับมา เชิญอีเมลนี้ใหม่ได้`,
    ok:'ถอดออก', tone:'btn-danger',
  });
  if (!ok) return;
  try{
    await fb.updateDoc(fb.doc(fb.db, 'staff', s.id), { removed:true, active:false, updatedBy:me.email, updatedAt:nowIso() });
    toast('ถอดออกแล้ว', 'ok');
    if (self) setTimeout(() => location.replace(STAFF_URL), 700);
  }catch(e){ toast('บันทึกไม่สำเร็จ — ' + e.message, 'err'); }
}

on(document, 'click', '[data-act]', (e, b) => {
  const s = staff.find(x => x.id === b.dataset.id);
  if (!s) return toast('ไม่พบผู้ใช้คนนี้', 'err');
  if (b.dataset.act === 'edit')   return staffForm(s);
  if (b.dataset.act === 'toggle') return toggleActive(s);
  if (b.dataset.act === 'remove') return removeStaff(s);
});
$('#invite').onclick = () => inviteChooser();
$('#prepRules').onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true; btn.textContent = 'กำลังเตรียม…';
  try{
    const r = await prepareForRules();
    toast(`เตรียมแล้ว — หน้าติดตาม ${r.tracking}/${r.total} จุดส่ง · คนขับ ${r.drivers} คน (ไม่มี PIN แล้ว)`, r.tracking === r.total ? 'ok' : 'warn', 6000);
  }catch(err){ toast(err.message, 'err', 5000); }
  finally{ btn.disabled = false; btn.textContent = 'เตรียมฐานข้อมูล'; }
};

/* ---------- ข้อมูล ---------- */
paint();
subscribe(paintDrivers);
subscribe(paintKpi);
fb.onSnapshot(fb.collection(fb.db, 'invites'),
  (snap) => { invites = []; snap.forEach(d => invites.push({ id:d.id, ...d.data() })); },
  (err) => console.error('[users] อ่านลิงก์เชิญไม่ได้', err));
fb.onSnapshot(fb.collection(fb.db, 'staff'),
  (snap) => {
    staff = [];
    snap.forEach(d => staff.push({ id:d.id, ...d.data() }));
    loaded = true;
    paint();
  },
  (err) => {
    console.error('[users] อ่านรายชื่อพนักงานไม่ได้', err);
    $('#staffEmpty').innerHTML = `<div class="empty"><p class="small">อ่านรายชื่อไม่ได้ — ${esc(err.code || err.message)}</p></div>`;
  });
