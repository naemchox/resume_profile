/* ============================================================
   xlsxExport.js — ตัวช่วยบันทึกเอกสารเป็นไฟล์ Excel (.xlsx)
   ใช้กับปุ่ม "บันทึกเป็น Excel" ข้างปุ่มพิมพ์ / PDF เดิม:
     ใบวางบิล (js/billView.js) · หน้าติดตาม (js/track.js) · ใบ POD (js/pod.js) · Report (dashboard.html)

   ใช้ ExcelJS (ไม่ใช่ SheetJS ตัวเดียวกับตอนนำเข้า) เพราะต้องจัดหน้า ใส่กรอบ/สี และฝังรูป + ลายเซ็นได้
   รูปจาก Firebase Storage ดึงด้วย fetch ได้ (ตอบ CORS *) · ดึงไม่ได้ → ใส่ลิงก์ "เปิดรูป" แทน ไฟล์ยังออกได้
   ============================================================ */

const LIB_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
];
let libPromise = null;

function loadScript(src){
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => (window.ExcelJS ? res(window.ExcelJS) : rej(new Error('no ExcelJS')));
    s.onerror = () => { s.remove(); rej(new Error('load failed')); };
    document.head.appendChild(s);
  });
}

/** โหลด ExcelJS ครั้งเดียว (ลอง CDN สำรองถ้าตัวแรกล่ม) */
export function loadExcelJS(){
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (libPromise) return libPromise;
  libPromise = (async () => {
    for (const u of LIB_URLS){
      try{ return await loadScript(u); }catch{}
    }
    libPromise = null;
    throw new Error('โหลดตัวสร้างไฟล์ Excel ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่');
  })();
  return libPromise;
}

/* ---------- หน้าตา ------------------------------------------ */
const FONT = 'Tahoma';
const LINE = { style:'thin', color:{ argb:'FFBFBFBF' } };
const BOX = { top:LINE, left:LINE, bottom:LINE, right:LINE };
const HEAD_FILL = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF3E3D3' } };   /* ส้มอ่อนโทนโลโก้ */
const TOTAL_FILL = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF2F2F2' } };
export const FMT = { money:'#,##0.00', int:'#,##0', dec1:'#,##0.0', pct:'0.0%' };

/** สมุดใหม่ */
export async function newBook(){
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FreightTrack';
  wb.created = new Date();
  return wb;
}

/**
 * ชีตใหม่ — กระดาษ A4 พอดีความกว้างหน้า ไม่มีเส้นตาราง (ดูเหมือนเอกสาร)
 * @param {number[]} widths ความกว้างคอลัมน์ (หน่วยตัวอักษรของ Excel)
 */
export function sheet(wb, name, widths, { landscape = false } = {}){
  const ws = wb.addWorksheet(String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), {
    views:[{ showGridLines:false }],
    pageSetup:{ paperSize:9, orientation: landscape ? 'landscape' : 'portrait', fitToPage:true, fitToWidth:1, fitToHeight:0,
      margins:{ left:.4, right:.4, top:.5, bottom:.5, header:.3, footer:.3 } },
  });
  ws.columns = widths.map(w => ({ width:w }));
  ws.properties.defaultRowHeight = 18;
  ws.cols = widths.length;
  return ws;
}

const font = (o = {}) => ({ name:FONT, size:10, ...o });

/* Excel ไม่ขยายความสูงแถวตามข้อความที่ตัดบรรทัด (wrap) ให้เองตอนเปิดไฟล์ — ประมาณจำนวนบรรทัดเอง
   ความกว้างคอลัมน์ = จำนวนตัวอักษรโดยประมาณ · สระบน/ล่างและวรรณยุกต์ไทยไม่กินที่ · เผื่อ 15% ให้ไม่ถูกตัดตอนพิมพ์ */
const THAI_MARK = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;
function wrapLines(v, width){
  const w = Math.max(1, (Number(width) || 10) - 1);
  return String(v ?? '').split('\n')
    .reduce((n, part) => n + Math.max(1, Math.ceil(part.replace(THAI_MARK, '').length * 1.15 / w)), 0);
}
const colWidth = (ws, from, to = from) => {
  let w = 0;
  for (let i = from; i <= to; i++) w += Number(ws.getColumn(i).width) || 10;
  return w;
};

/** แถวข้อความเต็มความกว้างชีต (merge) */
export function line(ws, text, { size = 10, bold = false, color, align = 'left', height } = {}){
  const r = ws.addRow([text]);
  if (ws.cols > 1) ws.mergeCells(r.number, 1, r.number, ws.cols);
  const c = r.getCell(1);
  c.font = font({ size, bold, ...(color ? { color:{ argb:color } } : {}) });
  c.alignment = { horizontal:align, vertical:'middle', wrapText:true };
  if (height) r.height = height;
  return r;
}

export const gap = (ws, h = 8) => { const r = ws.addRow([]); r.height = h; return r; };

/** หัวข้อย่อย (ตัวหนา เส้นใต้) */
export function heading(ws, text){
  gap(ws, 6);
  const r = line(ws, text, { size:11, bold:true });
  r.getCell(1).border = { bottom:{ style:'medium', color:{ argb:'FFE8781A' } } };
  return r;
}

/**
 * หัวข้อ : ค่า ทีละแถว — ค่ารวมช่องตั้งแต่คอลัมน์ 2 ถึงท้าย
 * @param {[string, any, string?][]} pairs [หัวข้อ, ค่า, numFmt]
 */
export function kv(ws, pairs){
  pairs.filter(p => p && p[1] !== undefined && p[1] !== null && p[1] !== '').forEach(([k, v, fmt]) => {
    const r = ws.addRow([k, v]);
    if (ws.cols > 2) ws.mergeCells(r.number, 2, r.number, ws.cols);
    const a = r.getCell(1), b = r.getCell(2);
    a.font = font({ bold:true, color:{ argb:'FF595959' } });
    b.font = font();
    a.alignment = { vertical:'top' };
    b.alignment = { vertical:'top', wrapText:true, horizontal:'left' };
    if (fmt) b.numFmt = fmt;
    const lines = wrapLines(v, colWidth(ws, 2, Math.max(2, ws.cols)));
    if (lines > 1) r.height = Math.min(409, 16 * lines);
  });
}

/**
 * ตาราง — หัวตารางสีส้มอ่อน ทุกช่องมีกรอบ
 * @param {string[]} head
 * @param {any[][]} rows
 * @param {{fmt?:Object<number,string>, align?:Object<number,string>, total?:any[], start?:number}} o
 *        fmt/align ใช้เลขคอลัมน์นับจาก 0 · total = แถวรวมท้ายตาราง · start = คอลัมน์แรก (ค่าเริ่ม 1)
 * @returns {{first:number, last:number}} เลขแถวข้อมูลแรก/สุดท้าย (ใช้เขียนสูตร SUM)
 */
export function table(ws, head, rows, { fmt = {}, align = {}, total = null } = {}){
  const style = (r, { bold = false, fill = null } = {}) => {
    r.eachCell({ includeEmpty:true }, (c, i) => {
      if (i > head.length) return;
      c.border = BOX;
      c.font = font({ bold });
      if (fill) c.fill = fill;
      const k = i - 1;
      if (fmt[k] && typeof c.value !== 'string') c.numFmt = fmt[k];
      c.alignment = { vertical:'top', wrapText:true,
        horizontal: align[k] || (fmt[k] ? 'right' : 'left') };
    });
  };
  const h = ws.addRow(head);
  style(h, { bold:true, fill:HEAD_FILL });
  h.eachCell(c => { c.alignment = { ...c.alignment, vertical:'middle', horizontal:'center' }; });
  const first = h.number + 1;
  rows.forEach(row => {
    const r = ws.addRow(row);
    style(r);
    const lines = Math.max(1, ...row.map((v, k) => (typeof v === 'string' ? wrapLines(v, colWidth(ws, k + 1)) : 1)));
    if (lines > 1) r.height = Math.min(409, 15 * lines + 3);   /* 409 = สูงสุดที่ Excel รับได้ */
  });
  const last = first + rows.length - 1;
  if (total) style(ws.addRow(total), { bold:true, fill:TOTAL_FILL });
  return { first, last };
}

/* ---------- รูป ---------------------------------------------- */
async function imageData(src){
  const blob = src.startsWith('data:') ? await (await fetch(src)).blob()
    : await (await fetch(src, { mode:'cors', cache:'force-cache' })).blob();
  if (!/^image\//.test(blob.type)) throw new Error('not an image');
  const bmp = await createImageBitmap(blob);
  const size = { w:bmp.width, h:bmp.height };
  bmp.close?.();
  const ext = /png/.test(blob.type) ? 'png' : /gif/.test(blob.type) ? 'gif' : 'jpeg';
  /* webp/อื่น ๆ Excel ไม่รู้จัก — แปลงเป็น jpeg ก่อน */
  if (!/png|jpe?g|gif/.test(blob.type)){
    const c = document.createElement('canvas');
    c.width = size.w; c.height = size.h;
    c.getContext('2d').drawImage(await createImageBitmap(blob), 0, 0);
    return { base64:c.toDataURL('image/jpeg', .85), extension:'jpeg', ...size };
  }
  const base64 = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
  return { base64, extension:ext, ...size };
}

/**
 * ฝังรูปทีละแถว — กรอบไม่เกิน maxW × maxH พิกเซล (คงสัดส่วน) วางเรียงในแถวเดียวกันได้ perRow รูป
 * ดึงรูปไม่ได้ → ช่องนั้นเป็นลิงก์ "เปิดรูปที่ n"
 * @param {string[]} srcs
 */
export async function images(wb, ws, srcs, { maxW = 220, maxH = 220, perRow = 3, label = 'รูป' } = {}){
  const list = (srcs || []).filter(Boolean);
  if (!list.length) return;
  const loaded = await Promise.all(list.map(s => imageData(s).catch(() => null)));
  const colsPer = Math.max(1, Math.floor(ws.cols / perRow));
  for (let i = 0; i < list.length; i += perRow){
    const batch = loaded.slice(i, i + perRow);
    const fit = batch.map(d => d ? Math.min(1, maxW / d.w, maxH / d.h) : 0);
    const hPx = Math.max(20, ...batch.map((d, k) => d ? d.h * fit[k] : 0));
    const r = ws.addRow([]);
    r.height = hPx * 0.75 + 6;          /* พิกเซล → พอยต์ */
    batch.forEach((d, k) => {
      const col = k * colsPer;
      if (d){
        const id = wb.addImage({ base64:d.base64, extension:d.extension });
        ws.addImage(id, { tl:{ col: col + 0.1, row: r.number - 1 + 0.05 }, ext:{ width:d.w * fit[k], height:d.h * fit[k] }, editAs:'oneCell' });
      } else {
        const c = r.getCell(col + 1);
        c.value = { text:`เปิด${label}ที่ ${i + k + 1}`, hyperlink:list[i + k] };
        c.font = font({ color:{ argb:'FF0563C1' }, underline:true });
        c.alignment = { vertical:'top' };
      }
    });
  }
}

/* ---------- บันทึก ------------------------------------------- */
/** ชื่อไฟล์ที่ระบบไฟล์รับได้ */
export const safeName = (s) => String(s || 'export').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);

/** เขียนสมุดแล้วให้เบราว์เซอร์ดาวน์โหลด */
export async function save(wb, filename){
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName(filename).replace(/\.xlsx$/i, '') + '.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** หัวบริษัทมาตรฐาน (ใบวางบิล / POD) — ชื่อซ้าย ชื่อเอกสารใต้ */
export function companyHead(ws, co, docTh, docEn){
  line(ws, co.name, { size:14, bold:true, height:22 });
  if (co.nameEn) line(ws, co.nameEn, { size:9, color:'FF7F7F7F' });
  if (co.address) line(ws, co.address, { size:9 });
  const contact = [co.contact || co.phone ? `โทร ${co.contact || co.phone}` : '', co.taxId ? `เลขประจำตัวผู้เสียภาษี ${co.taxId}` : ''].filter(Boolean).join(' · ');
  if (contact) line(ws, contact, { size:9 });
  gap(ws, 6);
  line(ws, docTh, { size:16, bold:true, align:'center', height:26 });
  if (docEn) line(ws, docEn, { size:9, color:'FF7F7F7F', align:'center' });
  gap(ws, 6);
}
