/* ============================================================
   pod.js — ใบรับสินค้า POD (Proof of Delivery) ขนาด A4
   ปริ้นจากหน้าผู้ช่วยคนขับ (helper.html): ทีละจุดส่ง หรือทั้งเที่ยว (จุดละหนึ่งหน้า)

   ในใบ: ข้อมูลจุดส่ง/Invoice/สินค้า · เวลาส่ง · ชื่อผู้รับ + ลายเซ็นที่เซ็นบนมือถือตอนปิดจุด
         · พิกัด GPS · รูปสินค้าตอนส่งมอบ · ช่องเซ็นด้วยปากกาของคนขับและผู้ช่วย
         ต่อด้วยรูปใบ Invoice ที่คนขับถ่ายตอนปิดจุด — รูปละหนึ่งหน้า ขยายเต็มหน้าให้อ่านตัวหนังสือออก

   ไม่เปิดหน้าใหม่ — วางเอกสารลงหน้าเดิมชั่วคราว ซ่อนทุกอย่างตอนปริ้น (css/app.css #pod-print)
   แล้วลบทิ้งเมื่อปริ้นเสร็จ (หน้าใหม่ต้องผ่านด่านล็อกอินอีกรอบ และทำให้โหมดผู้ช่วยหลุด)
   ============================================================ */

import { esc } from './ui.js';
import { S, getDriver, fmtDateTime, fmtNum, qty, driverName, deliveryProof } from './store.js';
import { POD_ORIGIN } from './config.js';

/** จ่าหัว POD — โลโก้ + ที่อยู่ของต้นทาง sample origin (ผู้ใช้สั่ง 30 ต.ค.: เปลี่ยนเฉพาะโลโก้กับที่อยู่ เนื้อหาใบเหมือนเดิม · ไม่มีเบอร์ขนส่งตัวอย่าง)
 *  ใช้ร่วมกับหน้าติดตามพัสดุตอนพิมพ์ (js/track.js) */
export const podOriginHead = () => `
    <div class="pod-origin">
      <img class="pod-logo" src="${esc(POD_ORIGIN.logo)}" alt="${esc(POD_ORIGIN.name)}">
      <div>
        <div class="pod-co">${esc(POD_ORIGIN.name)}</div>
        ${POD_ORIGIN.address.map(l => `<div class="pod-small">${esc(l)}</div>`).join('')}
        <div class="pod-small">โทร ${esc(POD_ORIGIN.tel)}</div>
      </div>
    </div>`;

/** เหตุการณ์ส่งมอบล่าสุดของจุดส่ง (มีรูป · ลายเซ็น · พิกัด) — รวมรูปที่คนขับเพิ่มทีหลังด้วย (store.js deliveryProof) */
export const deliveredEvent = (x) => deliveryProof(x);

/** ปริ้น POD ได้ไหม — ต้องส่งของแล้ว */
export const canPod = (x) => x.status === S.DELIVERED && !!deliveredEvent(x);

/* ชื่อผู้รับถูกต่อท้ายในบันทึกตอนปิดจุด ("ลงของครบถ้วน · ผู้รับ: คุณมาลี") — แยกออกมาแสดงเป็นช่องของมันเอง */
function splitReceiver(note){
  const m = String(note || '').match(/^(.*?)\s*·?\s*ผู้รับ:\s*(.+)$/);
  return m ? { note: m[1].trim(), receiver: m[2].trim() } : { note: String(note || '').trim(), receiver: '' };
}

const driverNames = (j, x) => (j?.driverIds?.length ? j.driverIds : (x.driverIds || [x.driverId]))
  .filter(Boolean).map(id => getDriver(id)).filter(Boolean);

/* ตารางสินค้า — ไม่แสดงมูลค่าสินค้า (ผู้ใช้สั่ง 30 ต.ค. — ทั้งใบปริ้นและ Excel)
   ลูกค้าขอให้แตกรายการสินค้า (line item) ทีละแถว แต่น้ำหนักยังรวมเป็นก้อนเดียวต่อ Invoice
   (หนึ่งจุดส่ง = หนึ่ง Invoice = หนึ่งหน้า POD) ไฟล์เหลืองมีน้ำหนักแค่แถวหัวกลุ่ม ไม่มีน้ำหนักรายชิ้นให้แตก
   จึงรวมช่องน้ำหนักเป็นช่องเดียว (rowspan) ข้างรายการทั้งหมด
   จุดที่ไม่มีรายการสินค้า (สร้างเอง / realtime / ไฟล์ขาว) ใช้แถวสรุปแบบเดิม */
function itemsTable(x){
  const weight = `${fmtNum(Math.round(x.cargo?.weightKg || 0))} กก.`;
  const note = x.cargo?.note ? `<div class="pod-small">${esc(x.cargo.note)}</div>` : '';
  const items = (x.source?.items || []).filter(it => it?.desc);

  if (!items.length) return `
  <table class="pod-tbl pod-items">
    <caption>รายการสินค้า</caption>
    <thead><tr><th>รายละเอียด</th><th class="num">จำนวน</th><th class="num">น้ำหนัก</th></tr></thead>
    <tbody><tr>
      <td>${esc(x.cargo?.desc || '—')}${note}</td>
      <td class="num">${esc(qty(x.cargo))}</td>
      <td class="num">${weight}</td>
    </tr></tbody>
  </table>`;

  const n = items.length;
  return `
  <table class="pod-tbl pod-items">
    <caption>รายการสินค้า · Invoice ${esc(x.invoice?.number || x.code)} (${fmtNum(n)} รายการ)</caption>
    <thead><tr><th class="idx">ลำดับ</th><th>รายการสินค้า</th><th class="num">จำนวน</th><th class="num">น้ำหนักรวม</th></tr></thead>
    <tbody>${items.map((it, i) => `<tr>
      <td class="idx">${i + 1}</td>
      <td>${esc(it.desc)}</td>
      <td class="num">${it.qty ? `${fmtNum(it.qty)}${it.unit ? ' ' + esc(it.unit) : ''}` : '—'}</td>
      ${i === 0 ? `<td class="num grp" rowspan="${n}">${weight}</td>` : ''}
    </tr>`).join('')}</tbody>
  </table>${note}`;
}

function podPage(x, j, printedAt){
  const ev = deliveredEvent(x);
  const { note, receiver } = splitReceiver(ev?.note);
  const drivers = driverNames(j, x);
  const main = drivers[0];
  const geo = ev?.geo;
  const photos = (ev?.photos || []).slice(0, 8);
  const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;

  return `
<section class="pod-page">
  <header class="pod-head">
    ${podOriginHead()}
    <div class="pod-title">
      <div class="pod-title-th">ใบส่งของ</div>
      <div class="pod-no">เลขที่ ${esc(x.code)}</div>
    </div>
  </header>

  <div class="pod-grid">
    <table class="pod-tbl">
      <caption>ผู้รับปลายทาง</caption>
      ${row('ชื่อ', esc(x.dropoff?.name || '—'))}
      ${row('ที่อยู่', esc(x.dropoff?.address || '—'))}
      ${row('ผู้ติดต่อ', esc([x.dropoff?.contact, x.dropoff?.phone].filter(Boolean).join(' · ') || '—'))}
      ${row('ลูกค้า', esc(x.customer?.name || '—'))}
    </table>
    <table class="pod-tbl">
      <caption>เอกสาร / เที่ยวรถ</caption>
      ${row('เลข Invoice', esc(x.invoice?.number || x.code))}
      ${x.delivery ? row('เลข Delivery', esc(x.delivery)) : ''}
      ${row('เที่ยว', esc(j?.code || '—'))}
      ${row('รถ', esc([j?.vehicle, main?.plate].filter(Boolean).join(' · ') || '—'))}
      ${row('คนขับ', esc(drivers.map(d => driverName(d)).join(' · ') || '—'))}
    </table>
  </div>

  ${itemsTable(x)}

  <div class="pod-grid pod-proof">
    <table class="pod-tbl">
      <caption>การส่งมอบ</caption>
      ${row('ส่งมอบเมื่อ', esc(fmtDateTime(ev?.at)))}
      ${row('ผู้รับสินค้า', esc(receiver || '—'))}
      ${row('พิกัด GPS', geo ? `${esc(geo.lat)}, ${esc(geo.lng)}${geo.acc ? ` <span class="pod-small">(±${esc(geo.acc)} ม.)</span>` : ''}` : '—')}
      ${row('บันทึก', esc(note || '—'))}
      ${row('บันทึกโดย', esc(ev?.byName || '—'))}
    </table>
    <div class="pod-sign">
      <div class="pod-sign-box">${ev?.signature
        ? `<img src="${esc(ev.signature)}" alt="ลายเซ็นผู้รับ">`
        : '<span class="pod-small">ไม่มีลายเซ็นในระบบ</span>'}</div>
      <div class="pod-sign-cap">ลายเซ็นผู้รับสินค้า${receiver ? ` · ${esc(receiver)}` : ''}</div>
      <div class="pod-small">${esc(fmtDateTime(ev?.at))}</div>
    </div>
  </div>

  ${photos.length ? `
  <div class="pod-photos-wrap">
    <div class="pod-cap">รูปสินค้าตอนส่งมอบ (${fmtNum(photos.length)} รูป)</div>
    <div class="pod-photos">${photos.map((p, i) => `<img src="${esc(p)}" alt="รูปส่งมอบ ${i + 1}">`).join('')}</div>
  </div>` : ''}

  <div class="pod-hand">
    <div><span class="pod-line"></span>ลงชื่อ ผู้ส่งสินค้า (คนขับ)<div class="pod-small">( ${esc(main?.name || '..............................')} )</div></div>
    <div><span class="pod-line"></span>ลงชื่อ ผู้ช่วยคนขับ<div class="pod-small">( .............................. )</div></div>
  </div>

  <footer class="pod-foot">พิมพ์จากระบบ FreightTrack เมื่อ ${esc(fmtDateTime(printedAt))} · ${esc(x.code)}</footer>
</section>${invoicePages(x, ev, printedAt)}`;
}

/* รูปใบ Invoice (ev.invoicePhotos) — รูปละหน้า A4 ขยายเต็มพื้นที่ (css .pod-inv-img) ให้อ่านตัวหนังสือออก
   จุดที่ปิดก่อนแบ่งสองสเต็ปไม่มีช่องนี้ — ไม่มีหน้าเพิ่ม */
function invoicePages(x, ev, printedAt){
  const list = (ev?.invoicePhotos || []).filter(Boolean);
  return list.map((p, i) => `
<section class="pod-page pod-inv-page">
  <header class="pod-inv-head">
    <span><b>รูปใบ Invoice ${esc(x.invoice?.number || x.code)}</b> · ${esc(x.dropoff?.name || '')}</span>
    <span>รูปที่ ${i + 1} / ${list.length} · ใบส่งของ ${esc(x.code)}</span>
  </header>
  <img class="pod-inv-img" src="${esc(p)}" alt="รูปใบ Invoice ${i + 1}">
  <footer class="pod-foot">ถ่ายตอนส่งมอบ ${esc(fmtDateTime(ev?.at))} โดย ${esc(ev?.byName || '—')} · พิมพ์เมื่อ ${esc(fmtDateTime(printedAt))}</footer>
</section>`).join('');
}

/** รอรูปโหลดครบก่อนสั่งปริ้น (ไม่งั้นได้กรอบว่าง) — ไม่เกิน 10 วินาที */
function imagesReady(root, ms = 10000){
  const imgs = [...root.querySelectorAll('img')].filter(i => !i.complete);
  if (!imgs.length) return Promise.resolve();
  return Promise.race([
    Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))),
    new Promise(r => setTimeout(r, ms)),
  ]);
}

/**
 * ปริ้น POD — จุดละหนึ่งหน้า A4
 * @param {object[]} stops จุดส่ง (เฉพาะที่ canPod)
 * @param {object} job เที่ยวของจุดเหล่านั้น
 */
export async function printPod(stops, job){
  const list = (stops || []).filter(canPod);
  if (!list.length) throw new Error('ยังไม่มีจุดที่ส่งของแล้ว — ปริ้นใบส่งของได้หลังปิดจุดส่ง');
  document.getElementById('pod-print')?.remove();
  const root = document.createElement('div');
  root.id = 'pod-print';
  const now = new Date().toISOString();
  root.innerHTML = list.map(x => podPage(x, job, now)).join('');
  document.body.appendChild(root);
  document.body.classList.add('pod-printing');
  await imagesReady(root);

  const cleanup = () => {
    root.remove();
    document.body.classList.remove('pod-printing');
    removeEventListener('afterprint', cleanup);
  };
  addEventListener('afterprint', cleanup);
  window.print();
  return list.length;
}

/**
 * POD เป็นไฟล์ Excel — จุดละหนึ่งชีต เนื้อหาเดียวกับใบที่ปริ้น (ลายเซ็น รูปสินค้า รูปใบ Invoice ฝังในไฟล์)
 * @param {object[]} stops จุดส่ง (เฉพาะที่ canPod)
 * @param {object} job เที่ยวของจุดเหล่านั้น
 */
export async function podXlsx(stops, job){
  const list = (stops || []).filter(canPod);
  if (!list.length) throw new Error('ยังไม่มีจุดที่ส่งของแล้ว — บันทึกใบส่งของได้หลังปิดจุดส่ง');
  const X = await import('./xlsxExport.js');
  const wb = await X.newBook();
  const now = new Date().toISOString();
  const used = new Set();
  for (const x of list){
    const ev = deliveredEvent(x);
    const { note, receiver } = splitReceiver(ev?.note);
    const drivers = driverNames(job, x);
    const main = drivers[0];
    const geo = ev?.geo;
    let name = String(x.invoice?.number || x.code), k = 2;
    while (used.has(name)) name = `${x.invoice?.number || x.code} (${k++})`;
    used.add(name);
    const ws = X.sheet(wb, name, [14, 30, 12, 14, 16]);
    await X.images(wb, ws, [POD_ORIGIN.logo], { maxW:150, maxH:60, perRow:1, label:'โลโก้' });
    X.companyHead(ws, { name:POD_ORIGIN.name, address:POD_ORIGIN.address.join(' '), phone:POD_ORIGIN.tel }, 'ใบส่งของ');
    X.line(ws, `เลขที่ ${x.code}`, { align:'center', bold:true });

    X.heading(ws, 'ผู้รับปลายทาง');
    X.kv(ws, [
      ['ชื่อ', x.dropoff?.name || '—'],
      ['ที่อยู่', x.dropoff?.address || '—'],
      ['ผู้ติดต่อ', [x.dropoff?.contact, x.dropoff?.phone].filter(Boolean).join(' · ') || '—'],
      ['ลูกค้า', x.customer?.name || '—'],
    ]);
    X.heading(ws, 'เอกสาร / เที่ยวรถ');
    X.kv(ws, [
      ['เลข Invoice', x.invoice?.number || x.code],
      ['เลข Delivery', x.delivery],
      ['เที่ยว', job?.code || '—'],
      ['รถ', [job?.vehicle, main?.plate].filter(Boolean).join(' · ') || '—'],
      ['คนขับ', drivers.map(d => driverName(d)).join(' · ') || '—'],
    ]);

    const items = (x.source?.items || []).filter(it => it?.desc);
    const weight = Math.round(x.cargo?.weightKg || 0);
    X.heading(ws, items.length ? `รายการสินค้า · Invoice ${x.invoice?.number || x.code} (${fmtNum(items.length)} รายการ)` : 'รายการสินค้า');
    if (items.length){
      const { first, last } = X.table(ws, ['ลำดับ', 'รายการสินค้า', 'จำนวน', 'น้ำหนักรวม (กก.)'],
        items.map((it, i) => [i + 1, it.desc, it.qty ? `${fmtNum(it.qty)}${it.unit ? ' ' + it.unit : ''}` : '—',
          i === 0 ? weight : '']),
        { fmt:{ 3:X.FMT.int }, align:{ 0:'center', 2:'right' } });
      /* น้ำหนักรวมเป็นก้อนเดียวต่อ Invoice — รวมช่องข้างทุกรายการเหมือนใบที่ปริ้น */
      if (last > first) ws.mergeCells(first, 4, last, 4);
    } else {
      X.table(ws, ['', 'รายละเอียด', 'จำนวน', 'น้ำหนัก (กก.)'],
        [['', [x.cargo?.desc || '—', x.cargo?.note].filter(Boolean).join('\n'), qty(x.cargo), weight]],
        { fmt:{ 3:X.FMT.int }, align:{ 2:'right' } });
    }
    if (items.length && x.cargo?.note) X.line(ws, x.cargo.note, { size:9 });

    X.heading(ws, 'การส่งมอบ');
    X.kv(ws, [
      ['ส่งมอบเมื่อ', fmtDateTime(ev?.at)],
      ['ผู้รับสินค้า', receiver || '—'],
      ['พิกัด GPS', geo ? `${geo.lat}, ${geo.lng}${geo.acc ? ` (±${geo.acc} ม.)` : ''}` : '—'],
      ['บันทึก', note || '—'],
      ['บันทึกโดย', ev?.byName || '—'],
    ]);
    X.line(ws, `ลายเซ็นผู้รับสินค้า${receiver ? ` · ${receiver}` : ''}`, { bold:true });
    if (ev?.signature) await X.images(wb, ws, [ev.signature], { maxW:280, maxH:130, perRow:1, label:'ลายเซ็น' });
    else X.line(ws, 'ไม่มีลายเซ็นในระบบ', { size:9, color:'FF7F7F7F' });

    const photos = (ev?.photos || []).slice(0, 8);
    if (photos.length){
      X.heading(ws, `รูปสินค้าตอนส่งมอบ (${fmtNum(photos.length)} รูป)`);
      await X.images(wb, ws, photos, { maxW:190, maxH:190, perRow:2 });
    }
    const inv = (ev?.invoicePhotos || []).filter(Boolean);
    if (inv.length){
      X.heading(ws, `รูปใบ Invoice ${x.invoice?.number || x.code} (${fmtNum(inv.length)} รูป)`);
      await X.images(wb, ws, inv, { maxW:520, maxH:720, perRow:1, label:'รูปใบ Invoice' });
    }

    X.gap(ws, 30);
    const sign = ws.addRow(['', '..............................', '', '..............................', '']);
    ws.mergeCells(sign.number, 4, sign.number, 5);
    const cap = ws.addRow(['', 'ลงชื่อ ผู้ส่งสินค้า (คนขับ)', '', 'ลงชื่อ ผู้ช่วยคนขับ', '']);
    ws.mergeCells(cap.number, 4, cap.number, 5);
    const who = ws.addRow(['', `( ${main?.name || '..............................'} )`, '', '( .............................. )', '']);
    ws.mergeCells(who.number, 4, who.number, 5);
    [sign, cap, who].forEach(r => r.eachCell(c => { c.alignment = { horizontal:'center' }; c.font = { name:'Tahoma', size:10 }; }));
    X.gap(ws);
    X.line(ws, `ออกจากระบบ FreightTrack เมื่อ ${fmtDateTime(now)} · ${x.code}`, { size:8, color:'FF7F7F7F' });
  }
  const first = list[0];
  await X.save(wb, list.length > 1
    ? `ใบส่งของ ${job?.code || ''} ${fmtNum(list.length)} จุด`
    : `ใบส่งของ ${first.invoice?.number || first.code} ${first.dropoff?.name || ''}`);
  return list.length;
}
