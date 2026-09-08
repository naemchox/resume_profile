/* estimate.js — ของเฉพาะอู่ช่างชัด: เครื่องมือ "บอกอาการ ดูราคา" + ฟอร์มนัดคิว
   ค่าเริ่มต้นถูกพิมพ์ไว้ใน index.html แล้ว ไฟล์นี้แค่เปลี่ยนตัวเลขให้ตรงกับที่กด
   ปิด JS = ยังอ่านช่วงราคาของอาการแรกได้ครบ ไม่ใช่หน้าว่าง */
(() => {
  /* ช่วงราคาแยกตามกลุ่มรถ ไม่ใช่ตัวคูณตัวเดียว — ค่าแรงกับค่าอะไหล่ของรถยุโรป
     ไม่ได้แพงกว่ารถญี่ปุ่นเป็นสัดส่วนเดียวกันทุกงาน (งานแอร์ต่างกันเกือบเท่าตัว
     งานเบรกต่างกันสองเท่ากว่า) ตัวคูณตัวเดียวจะให้ตัวเลขที่ดูเนียนแต่ผิดทุกช่อง */
  const DATA = {
    brake: {
      jp: [1800, 4200], eu: [4500, 11000], pickup: [2400, 5600],
      time: "2–4 ชั่วโมง (รับคืนวันเดียวกัน)",
      check: "วัดความหนาผ้าเบรกทั้ง 4 ล้อ · ดูจานเบรกว่าเจียได้อีกไหม · เช็ครอยรั่วน้ำมันเบรก",
      say: "เบรกมีเสียง / เหยียบลึกกว่าเดิม",
    },
    air: {
      jp: [900, 6500], eu: [1800, 14000], pickup: [1200, 8000],
      time: "1 ชั่วโมง ถ้าเป็นแค่น้ำยา · 1–2 วัน ถ้าต้องถอดตู้แอร์",
      check: "วัดแรงดันน้ำยา · หารอยรั่วด้วยน้ำยาเรืองแสง · เช็คพัดลมแผงร้อนและคลัตช์คอมเพรสเซอร์",
      say: "แอร์ไม่เย็น",
    },
    idle: {
      jp: [1200, 5800], eu: [2600, 12000], pickup: [1500, 7000],
      time: "3 ชั่วโมง – 1 วัน",
      check: "อ่านโค้ดจากกล่อง ECU · ตรวจหัวเทียนและคอยล์ · หารอยรั่วอากาศท่อไอดี · ดูแท่นเครื่อง",
      say: "เครื่องสั่นตอนจอดติดเครื่อง",
    },
    steer: {
      jp: [1600, 9000], eu: [3800, 18000], pickup: [2200, 11000],
      time: "4 ชั่วโมง – 1 วัน (รวมตั้งศูนย์ถ่วงล้อ)",
      check: "ยกตรวจระยะคลอนลูกหมาก/แร็ค · ดูรอยรั่วน้ำมันพาวเวอร์ · ฟังเสียงลูกปืนล้อ",
      say: "พวงมาลัยหนัก / มีเสียงตอนเลี้ยว",
    },
    fuel: {
      jp: [1500, 7500], eu: [3200, 15000], pickup: [2000, 9500],
      time: "3 ชั่วโมง – 1 วัน",
      check: "อ่านค่าเซ็นเซอร์ออกซิเจน · ตรวจไส้กรองอากาศและหัวฉีด · เช็คลมยางกับการถ่วงล้อ",
      say: "รถกินน้ำมันขึ้นผิดปกติ",
    },
    service: {
      jp: [1900, 4800], eu: [4200, 12000], pickup: [2600, 6800],
      time: "2–3 ชั่วโมง (นัดล่วงหน้าได้คิวเช้า)",
      check: "เปลี่ยนน้ำมันเครื่องและกรอง · ตรวจ 30 จุดให้ครบ · เช็ครายการที่ถึงกำหนดตามเลขไมล์",
      say: "ถึงระยะเช็คตามเลขไมล์แล้ว",
    },
  };

  const $ = (s, r = document) => r.querySelector(s);
  const symWrap = $("[data-sym]");
  const grpWrap = $("[data-grp]");
  if (!symWrap || !grpWrap) return;

  let sym = "brake", grp = "jp";
  const baht = (n) => n.toLocaleString("en-US");

  /* ตัวเลขเปลี่ยนแบบ "หมุนหน้าปัด" ไม่ใช่สลับค่าเงียบๆ — ของที่เปลี่ยนแล้วตาไม่ทันเห็น
     คนจะไม่รู้ว่าที่กดไปมีผล (เจอตอนทดสอบ: กดสลับกลุ่มรถแล้วนึกว่าปุ่มเสีย)
     ปิดเองเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว — website.md §11 ข้อ 6 */
  const still = document.documentElement.classList.contains("still")
    || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const setNum = (el, text) => {
    if (el.textContent === text) return;
    el.textContent = text;
    if (still) return;
    el.classList.remove("roll");
    void el.offsetWidth;          /* บังคับให้เบราว์เซอร์เริ่มอนิเมชันรอบใหม่จริงๆ */
    el.classList.add("roll");
  };

  const render = () => {
    const d = DATA[sym];
    if (!d) return;
    const [lo, hi] = d[grp];
    setNum($("[data-out-lo]"), baht(lo));
    setNum($("[data-out-hi]"), baht(hi));
    $("[data-out-time]").textContent = d.time;
    $("[data-out-check]").textContent = d.check;
  };

  /* ปุ่มเลือกใช้ aria-pressed เป็นตัวบอกสถานะจริง ไม่ใช่แค่คลาสสี —
     คนที่ใช้โปรแกรมอ่านหน้าจอต้องได้ยินว่าอันไหนถูกเลือกอยู่ */
  const wire = (wrap, set) => {
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      for (const b of wrap.querySelectorAll(".chip")) {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", String(on));
      }
      set(btn.dataset.key);
      render();
    });
  };
  wire(symWrap, (k) => { sym = k; });
  wire(grpWrap, (k) => { grp = k; });

  /* ปุ่ม "นัดเข้าอู่พร้อมอาการนี้" — พาไปฟอร์มแล้วกรอกอาการให้เลย
     คนที่กดปุ่มนี้เพิ่งบอกอาการไปแล้วรอบหนึ่ง ให้พิมพ์ซ้ำคือทำให้เขาเลิกกลางคัน */
  const bookBtn = $("[data-book]");
  const symField = $("#f-sym");
  if (bookBtn && symField) {
    bookBtn.addEventListener("click", () => {
      const d = DATA[sym];
      if (d && !symField.value.trim()) symField.value = d.say;
    });
  }

  /* ---- ฟอร์มนัดคิว --------------------------------------------------------
     งานสาธิตไม่มีหลังบ้าน จึงต้องบอกตรงๆ ในข้อความตอบกลับว่ายังไม่ได้ส่งจริง
     ฟอร์มที่ขึ้น "ส่งสำเร็จ" ทั้งที่ไม่มีอะไรถูกส่ง = คำโกหกที่ลูกค้าจับได้ทีหลัง */
  const form = $("[data-form]");
  if (!form) return;
  const msg = $("[data-msg]", form);
  const btn = $("[data-submit]", form);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (form.line2.value) return;               /* honeypot: บอทกรอก = เงียบไปเลย */

    const need = ["name", "tel", "car"];
    const empty = need.find((n) => !form[n].value.trim());
    if (empty) {
      msg.dataset.state = "err";
      msg.textContent = "กรอกชื่อ เบอร์โทร และรุ่นรถก่อนนะครับ";
      form[empty].focus();
      return;
    }
    if (!/^[0-9\s+-]{9,}$/.test(form.tel.value.trim())) {
      msg.dataset.state = "err";
      msg.textContent = "เบอร์โทรดูไม่ครบ ตรวจอีกทีครับ";
      form.tel.focus();
      return;
    }

    btn.setAttribute("aria-busy", "true");
    msg.dataset.state = "";
    msg.textContent = "กำลังส่ง…";
    setTimeout(() => {
      btn.removeAttribute("aria-busy");
      msg.dataset.state = "ok";
      msg.textContent = "รับนัดแล้ว — (เดโม: ยังไม่ได้ส่งจริง เว็บของลูกค้าจะเด้งเข้าไลน์ร้านทันที)";
      form.reset();
    }, 900);
  });
})();
