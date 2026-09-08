#!/usr/bin/env node
/* _contrast.js — วัด contrast จริงตาม WCAG 2.1 ไม่ใช่เดาจากค่า L
   ใช้: node _contrast.js   แล้วเอาตัวเลขที่ได้ไปเขียนกำกับใน css/tokens.css
   ENGINE §4 บังคับให้วัด เพราะสีที่ "ดูสว่างพอ" เคยตกเกณฑ์มาแล้ว */
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
  ["เนื้อความบนพื้นเทาอ่อน", "#14161A", "#F5F7FA"],
  ["ข้อความรองบนพื้นเทา",   "#5A6472", "#F5F7FA"],
  ["ตัวหนังสือบนปุ่มน้ำเงิน", "#FFFFFF", "#1A4FD0"],
  ["ลิงก์น้ำเงินบนพื้นเทา",  "#1741AE", "#F5F7FA"],
  ["ราคาบนการ์ดขาว",       "#B3400C", "#FFFFFF"],
  /* แถบมืด #deal — เพิ่ม 21/8/26 พร้อมแถบนั้น */
  ["เนื้อความบนสเลตเข้ม",   "#F5F7FA", "#14161A"],
  ["ข้อความรองบนสเลตเข้ม",  "#AEB8C6", "#14161A"],
  ["ฟ้าอ่อนบนสเลตเข้ม",     "#93B4FF", "#14161A"],
];
let bad = 0;
for (const [name, fg, bg, need = 4.5] of PAIRS) {
  const r = ratio(fg, bg);
  if (r < need) bad++;
  console.log(`${r >= need ? "✓" : "✗"} ${name.padEnd(26)} ${fg} บน ${bg} = ${r.toFixed(2)}:1 (ต้องการ ${need}:1)`);
}
process.exit(bad ? 1 : 0);
