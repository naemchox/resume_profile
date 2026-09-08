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

/* คู่สีที่หน้านี้ใช้จริง ดึงมาจาก tailwind.config ในไฟล์เดียวกัน
   เกณฑ์: ตัวหนังสือปกติ 4.5:1 · ตัวใหญ่/หัวเรื่อง 3:1 (WCAG AA) */
const PAIRS = [
  ["ตัวหนังสือหลักบนพื้นกระดาษ", "#0A0908", "#FAFAF9"],
  ["ตัวหนังสือหลักบนพื้นครีม",   "#0A0908", "#F5F1EA"],
  ["เนื้อความสีหินบนพื้นครีม",   "#44403C", "#F5F1EA"],
  ["ข้อความรองสีเถ้าบนครีม",     "#6F6862", "#F5F1EA"],
  ["ทองบนพื้นหมึก (หัวเรื่อง)",  "#C9A961", "#0A0908", 3],
  ["ทองอ่อนบนพื้นหมึก",          "#E6CC8F", "#0A0908"],
  ["กระดาษบนพื้นหมึก",           "#FAFAF9", "#0A0908"],
];
let bad = 0;
for (const [name, fg, bg, need = 4.5] of PAIRS) {
  const r = ratio(fg, bg);
  if (r < need) bad++;
  console.log(`${r >= need ? "✓" : "✗"} ${name.padEnd(26)} ${fg} บน ${bg} = ${r.toFixed(2)}:1 (ต้องการ ${need}:1)`);
}
process.exit(bad ? 1 : 0);
