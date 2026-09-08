#!/usr/bin/env node
/* _contrast.js — วัด contrast จริงตาม WCAG 2.1 ไม่ใช่เดาจากค่า L
   ใช้: node _contrast.js   แล้วเอาตัวเลขที่ได้ไปเขียนกำกับใน css/tokens.css
   ENGINE §4 บังคับให้วัด เพราะสีที่ "ดูสว่างพอ" เคยตกเกณฑ์มาแล้ว
   งานนี้พื้นมืดทั้งใบ = ทุกคู่ต้องวัดใหม่หมด ค่าที่จำมาจากงานพื้นสว่างใช้ไม่ได้เลย */
const srgb = (h) => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
};
const lum = (h) => { const [r, g, b] = srgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const BG = "#191814", SUR = "#22201A", PLATE = "#2B281F";
const PAIRS = [
  ["เนื้อความบนพื้นกราไฟต์",   "#F4F1E9", BG],
  ["ข้อความรองบนพื้น",        "#ADA692", BG],
  ["ข้อความรองบนการ์ด",       "#ADA692", SUR],
  ["ข้อความรองบนแผ่นเข้ม",    "#ADA692", PLATE],
  ["อำพันบนพื้น",             "#F2A81E", BG],
  ["อำพันบนการ์ด",            "#F2A81E", SUR],
  ["ตัวหนังสือบนปุ่มอำพัน",    "#191814", "#F2A81E"],
  ["เขียวผ่านบนการ์ด",        "#57C77F", SUR],
  ["แดงต้องซ่อมบนการ์ด",      "#FF6B5A", SUR],
  /* ตัวเลขบนมาตรวัด (พื้นดำสนิทกว่าพื้นหน้า) */
  ["เลขไมล์บนหน้าปัด",        "#F2A81E", "#100F0C"],
];
let bad = 0;
for (const [name, fg, bg, need = 4.5] of PAIRS) {
  const r = ratio(fg, bg);
  if (r < need) bad++;
  console.log(`${r >= need ? "✓" : "✗"} ${name.padEnd(26)} ${fg} บน ${bg} = ${r.toFixed(2)}:1 (ต้องการ ${need}:1)`);
}
process.exit(bad ? 1 : 0);
