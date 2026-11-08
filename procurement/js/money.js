// เงินทั้งระบบเดินทางเป็น "สตางค์" (จำนวนเต็ม) — แปลงเป็นบาทเฉพาะตอนแสดงผล
// ห้ามคำนวณเงินด้วยทศนิยมลอยตัวเด็ดขาด

export const toSatang = (baht) => {
  const n = typeof baht === 'string' ? Number(baht.replace(/,/g, '')) : Number(baht);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

export const toBaht = (satang) => (Number(satang) || 0) / 100;

export const fmt = (satang, opts = {}) =>
  toBaht(satang).toLocaleString('th-TH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts,
  });

export const fmtQty = (q) =>
  Number(q ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 3 });

export const pct = (bp) => (Number(bp) || 0) / 100;

// VAT / ภาษีหัก ณ ที่จ่าย ต้องปัดแบบเดียวกับฝั่งฐานข้อมูล (round ครึ่งขึ้น)
export const applyBp = (satang, bp) => Math.round((Number(satang) || 0) * (Number(bp) || 0) / 10000);

const THAI_DIGITS = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
const THAI_UNITS  = ['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน'];

function readGroup(numStr) {
  let out = '';
  const len = numStr.length;
  for (let i = 0; i < len; i++) {
    const d = Number(numStr[i]);
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && len > 1) out += 'เอ็ด';
    else if (pos === 1 && d === 1) out += 'สิบ';
    else if (pos === 1 && d === 2) out += 'ยี่สิบ';
    else out += THAI_DIGITS[d] + THAI_UNITS[pos];
  }
  return out;
}

function readInt(n) {
  if (n === 0) return 'ศูนย์';
  let s = String(n), out = '';
  while (s.length > 6) {
    out += readGroup(s.slice(0, s.length - 6)) + 'ล้าน';
    s = s.slice(s.length - 6);
  }
  return out + readGroup(s);
}

// ตัวอักษรกำกับจำนวนเงิน — ต้องมีในใบสั่งซื้อ ใบสำคัญจ่าย และหนังสือรับรองหักภาษี
export function bahtText(satang) {
  const neg = satang < 0;
  const abs = Math.abs(Math.round(Number(satang) || 0));
  const baht = Math.floor(abs / 100);
  const st = abs % 100;
  let out = readInt(baht) + 'บาท';
  out += st === 0 ? 'ถ้วน' : readInt(st) + 'สตางค์';
  return (neg ? 'ลบ' : '') + out;
}

// รูปแบบภาษาอังกฤษสำหรับเอกสารฉบับอังกฤษ
export function amountWordsEn(satang) {
  const abs = Math.abs(Math.round(Number(satang) || 0));
  const baht = Math.floor(abs / 100), st = abs % 100;
  const ones = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const chunk = (n) => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + chunk(n % 100) : '');
  };
  const scales = [[1e9,'billion'],[1e6,'million'],[1e3,'thousand']];
  let n = baht, parts = [];
  for (const [v, name] of scales) {
    if (n >= v) { parts.push(chunk(Math.floor(n / v)) + ' ' + name); n %= v; }
  }
  if (n > 0 || parts.length === 0) parts.push(chunk(n));
  const words = parts.join(' ').trim() || 'zero';
  const cap = words.charAt(0).toUpperCase() + words.slice(1);
  return st === 0 ? `${cap} baht only` : `${cap} baht and ${chunk(st)} satang`;
}
