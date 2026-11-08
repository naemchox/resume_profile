/* ============================================================
   fuelPrice.js — ราคาน้ำมันวันนี้ (แถบบนสุดของหน้า billing)

   แหล่ง: api.chnwt.dev/thai-oil-api (บริการรวมราคาหลายปั๊ม ไม่ใช่ของปั๊มเอง — ผู้ใช้เลือก 26 ต.ค. 2026)
   ราคาขายปลีก กรุงเทพฯ และปริมณฑล · บาท/ลิตร · แสดง ปตท. กับ บางจาก ทุกชนิดที่มี
   จำไว้ในเครื่องวันละครั้ง (localStorage) — ดึงไม่ได้ = ขึ้นข้อความเล็ก ๆ ไม่กวนส่วนอื่น
   ============================================================ */

import { esc } from './ui.js';

const URL = 'https://api.chnwt.dev/thai-oil-api/latest';
const STATIONS = [['ptt', 'ปตท.'], ['bcp', 'บางจาก']];
const KEY = 'ft.fuel.v1';

const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function cached(){
  try{
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    return c && c.day === today() ? c.data : null;
  }catch{ return null; }
}
function keep(data){
  try{ localStorage.setItem(KEY, JSON.stringify({ day: today(), data })); }catch{}
}

async function load(){
  const hit = cached();
  if (hit) return hit;
  const res = await fetch(URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body?.status !== 'success' || !body.response?.stations) throw new Error('รูปแบบข้อมูลไม่ตรง');
  const r = body.response;
  const data = {
    date: r.date || '',
    stations: STATIONS.map(([k, label]) => ({
      label,
      list: Object.values(r.stations[k] || {})
        .map(o => ({ name: String(o?.name || '').trim(), price: Number(o?.price) }))
        .filter(o => o.name && o.price > 0),
    })).filter(s => s.list.length),
  };
  if (!data.stations.length) throw new Error('ไม่มีราคา');
  keep(data);
  return data;
}

/** ราคา ปตท. วันนี้ {date, list:[{name, price}]} — จดตอนปิดจุดส่ง (เก็บไว้เฉย ๆ)
 *  ดึงไม่ได้ภายใน 5 วินาที = null (ห้ามขวางคนขับปิดงาน) */
export async function pttPrices(){
  try{
    const d = await Promise.race([load(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 5000))]);
    const ptt = d.stations.find(s => s.label === 'ปตท.');
    return ptt ? { date: d.date, list: ptt.list } : null;
  }catch(err){
    console.warn('[fuel] ดึงราคา ปตท. ไม่ได้', err);
    return null;
  }
}

/** วาดแถบราคาน้ำมันลงใน host */
export async function fuelBar(host){
  if (!host) return;
  host.innerHTML = '<div class="fuel-bar is-loading"><span class="small dim">⛽ กำลังโหลดราคาน้ำมันวันนี้…</span></div>';
  try{
    const d = await load();
    host.innerHTML = `
<div class="fuel-bar">
  <div class="fuel-head">
    <b>⛽ ราคาน้ำมันวันนี้</b>
    <span class="tiny dim">${esc(d.date)} · ราคาขายปลีก กทม. และปริมณฑล · บาท/ลิตร</span>
  </div>
  ${d.stations.map(s => `
  <div class="fuel-row">
    <span class="fuel-st">${esc(s.label)}</span>
    <span class="fuel-list">${s.list.map(o => `<span class="fuel-item">${esc(o.name)} <b class="mono">${o.price.toFixed(2)}</b></span>`).join('')}</span>
  </div>`).join('')}
</div>`;
  }catch(err){
    console.warn('[fuel] ดึงราคาน้ำมันไม่ได้', err);
    host.innerHTML = '<div class="fuel-bar is-off"><span class="small dim">⛽ ดึงราคาน้ำมันวันนี้ไม่ได้ — ลองรีเฟรชหน้าอีกครั้งภายหลัง</span></div>';
  }
}
