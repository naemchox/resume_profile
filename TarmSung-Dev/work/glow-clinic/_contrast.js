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
  ["เนื้อความบนพื้นชมพูนวล",  "#2A1F26", "#FDF7F5"],
  ["ข้อความรองบนพื้นนวล",    "#6E5A63", "#FDF7F5"],
  ["ตัวหนังสือบนปุ่มโรส",     "#FFFFFF", "#A03A56"],
  ["ลิงก์โรสเข้มบนพื้นนวล",   "#8A2E47", "#FDF7F5"],
  ["ราคาบนการ์ดขาว",        "#8A6410", "#FFFFFF"],
  /* แถบมืด #doctor — เพิ่ม 21/8/26 พร้อมแถบนั้น */
  ["เนื้อความบนพลัมเข้ม",   "#FDF7F5", "#2A1F26"],
  ["ข้อความรองบนพลัมเข้ม",  "#C6B0B8", "#2A1F26"],
  ["โรสอ่อนบนพลัมเข้ม",     "#EDA9BE", "#2A1F26"],
];
let bad = 0;
for (const [name, fg, bg, need = 4.5] of PAIRS) {
  const r = ratio(fg, bg);
  if (r < need) bad++;
  console.log(`${r >= need ? "✓" : "✗"} ${name.padEnd(26)} ${fg} บน ${bg} = ${r.toFixed(2)}:1 (ต้องการ ${need}:1)`);
}
process.exit(bad ? 1 : 0);
