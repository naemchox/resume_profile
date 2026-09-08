#!/usr/bin/env node
/* _contrast.js — วัด contrast จริงตาม WCAG 2.1 ไม่ใช่เดาจากค่า L
   ใช้: node _contrast.js   แล้วเอาตัวเลขที่ได้ไปเขียนกำกับใน css/tokens.css
   ENGINE §4 บังคับให้วัด เพราะสีที่ "ดูสว่างพอ" เคยตกเกณฑ์มาแล้ว
   หน้านี้มีทองเป็นสีที่สอง ซึ่งเป็นสีที่ตกเกณฑ์บ่อยที่สุดในเว็บสายจัดงาน —
   ทองบนครีมคือคู่ที่ต้องวัดทุกครั้งที่ขยับเฉดแม้แต่นิดเดียว */
const srgb = (h) => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
};
const lum = (h) => { const [r, g, b] = srgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const PAIRS = [
  ["เนื้อความบนพื้นครีม",      "#0A1710", "#FAF9F4"],
  ["ข้อความรองบนพื้นครีม",     "#6A6964", "#FAF9F4"],
  ["ลิงก์เขียวบนพื้นครีม",      "#324F3E", "#FAF9F4"],
  ["ตัวหนังสือบนปุ่มเขียวเข้ม",  "#FEFDFC", "#14261C"],
  ["ตัวหนังสือบนปุ่มทอง",       "#0A1710", "#CB9B51"],
  ["ราคาบนการ์ดขาว",          "#14261C", "#FEFDFC"],
  ["ทองอ่อนบนภาพที่คลุมเข้ม",   "#E2BE83", "#14261C", 3],
];
let bad = 0;
for (const [name, fg, bg, need = 4.5] of PAIRS) {
  const r = ratio(fg, bg);
  if (r < need) bad++;
  console.log(`${r >= need ? "ok " : "ตก "} ${r.toFixed(2)}:1  (ต้อง ${need})  ${name}`);
}
process.exit(bad ? 1 : 0);
