/* scroll-layer.js — กลไกกลางของ playbook: ของที่ขยับตาม "ตำแหน่ง" การเลื่อน
   website.md §13 ข้อ 9 — เดโมต้องมีอย่างน้อยหนึ่งอย่างที่ขยับตามตำแหน่งจริง
   ไม่ใช่แค่สวิตช์ "เลื่อนถึงแล้วหรือยัง" ของ .reveal

   ไฟล์นี้ต้องเหมือนกันทุกเดโม (ก๊อปทั้งไฟล์ ห้ามแก้รายชิ้น) — แบบเดียวกับ
   nav-response.js ค่าที่ต่างกันได้มีแค่สีในสไตล์ชีตของแต่ละใบ

   ไม่ผูกกับชื่อคลาสของเดโมไหน: สร้างอิลิเมนต์ที่ต้องใช้เอง และหาภาพฮีโร่จาก
   โครงหน้า ไม่ใช่จากคลาสเฉพาะใบ ทำสามอย่าง
     1. แถบความคืบหน้าการอ่านด้านบนสุด
     2. ภาพฮีโร่เลื่อนช้ากว่าหน้า (parallax) — ปิดเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว
     3. ปุ่มกลับขึ้นบน โผล่หลังเลื่อนพ้นหนึ่งจอ
   งานทั้งสามอ่าน scrollY ครั้งเดียวใน rAF เดียวและ listener เดียว — แยกกันคือ
   บังคับให้เบราว์เซอร์คิดเลย์เอาต์ใหม่สามรอบต่อเฟรมโดยเปล่าประโยชน์ */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    || new URLSearchParams(location.search).get("reduce") === "1";

  const bar = document.createElement("div");
  bar.className = "read-bar"; bar.setAttribute("aria-hidden", "true");
  bar.innerHTML = "<span></span>";
  document.body.prepend(bar);
  const barFill = bar.firstElementChild;

  const top = document.createElement("button");
  top.type = "button"; top.className = "to-top";
  top.setAttribute("aria-label", "กลับขึ้นบนสุด");
  top.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  top.addEventListener("click", () => scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }));
  document.body.append(top);

  /* ภาพฮีโร่ = ภาพที่กินเต็มความกว้างอยู่บนสุดของหน้า ไม่ใช่ ".hero-photo" ของใบใด
     ใบหนึ่ง — เดโมแต่ละใบเรียกไม่เหมือนกัน (hero-photo / hero-media img / ฯลฯ) */
  const hero = document.querySelector("header + * img, .hero img, [class*='hero'] img");
  const heroBox = hero && hero.closest("section, div");
  if (hero && !reduce) hero.style.willChange = "transform";

  let ticking = false;
  const sync = () => {
    ticking = false;
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    barFill.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max).toFixed(4) : 0})`;
    top.classList.toggle("show", y > innerHeight * 0.8);
    /* เพดาน 60px ไม่ใช่ปล่อยตามระยะเลื่อน — ภาพถูกขยาย 1.14 เท่า เหลือเนื้อภาพ
       ล้นกรอบด้านละ 7% เลื่อนเกินนั้นคือเห็นขอบว่าง */
    if (hero && !reduce && y < innerHeight) {
      hero.style.transform = `translate3d(0, ${Math.min(y * 0.25, 60).toFixed(1)}px, 0) scale(1.14)`;
    }
  };
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(sync);
  }, { passive: true });
  sync();

  if (heroBox) heroBox.style.overflow = "hidden";   /* ภาพที่ถูกขยายต้องไม่ดันหน้าให้เลื่อนขวาได้ */
})();
