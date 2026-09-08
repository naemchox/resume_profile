/* =============================================================================
   booking-form.js — ฟอร์มจอง (แหล่งเดียวของทุกเดโม)
   แก้ที่ไฟล์นี้เท่านั้น แล้วสั่ง `node playbook/sync-booking-form.mjs`

   ทำงานยังไง
   - อ่านปลายทางจาก data-endpoint บนฟอร์ม (ของลูกค้าจริง = URL ของ Apps Script)
   - ไม่มี endpoint = โหมดเดโม: ทำงานครบทุกอย่างแต่ไม่ส่งออกไปไหน และบอกตรงๆ ว่าเป็นเดโม
   - ส่งด้วย fetch mode:"no-cors" + urlencoded เพราะ Apps Script Web App ไม่คืนหัว CORS
     (แลกกับการ "อ่านคำตอบไม่ได้") จึงถือว่า ส่งไม่ error = ส่งถึง แล้วยืนยันจริงทางอีเมล/ชีต
     ห้ามเปลี่ยนไปโชว์ว่า "ร้านยืนยันแล้ว" — เรารู้แค่ว่าส่งออกไปแล้ว
   - กันกดซ้ำ: ปิดปุ่มระหว่างส่ง และตั้ง is-done หลังส่งสำเร็จ

   ที่ตั้งใจไม่ทำ (ชั้น 3 คนละโปรเจกต์): เช็คโต๊ะว่างจริง · กันจองชนเวลา · ยกเลิก/เลื่อน
   ========================================================================== */
(() => {
  const form = document.querySelector("[data-book-form]");
  if (!form) return;

  const btn    = form.querySelector("[data-book-submit]");
  const status = form.querySelector("[data-book-status]");
  const recap  = form.querySelector("[data-book-recap]");
  const endpoint = (form.dataset.endpoint || "").trim();

  /* วันที่: ห้ามจองย้อนหลัง และเปิดให้จองล่วงหน้าได้ 60 วัน
     ตั้งจาก JS ไม่ใช่ hardcode ในหน้า เพราะ "วันนี้" ของหน้าที่ deploy ไว้เมื่อเดือนก่อนคือวันผิด */
  const dateEl = form.querySelector("[name=date]");
  if (dateEl) {
    const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const today = new Date();
    dateEl.min = iso(today);
    dateEl.max = iso(new Date(today.getTime() + 60 * 864e5));
  }

  const say = (msg, tone) => { if (status) { status.textContent = msg; status.dataset.tone = tone || ""; } };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.classList.add("is-tried");
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const body = new URLSearchParams();
    for (const [k, v] of data.entries()) body.append(k, String(v));
    body.append("page", location.pathname);

    btn && (btn.disabled = true);
    say("กำลังส่ง…", "wait");

    try {
      if (endpoint) {
        await fetch(endpoint, { method: "POST", mode: "no-cors", body });
      } else {
        await new Promise((r) => setTimeout(r, 400));   /* โหมดเดโม: หน่วงให้เห็นสถานะจริง */
      }

      if (recap) {
        const zone = data.get("zone");
        recap.innerHTML = "";
        [["ชื่อ", data.get("name")],
         ["เบอร์", data.get("phone")],
         ["จำนวน", data.get("people") + " ท่าน"],
         ["วันเวลา", data.get("date") + " " + data.get("time")],
         ["โซน", zone || "ไม่เกี่ยง"]].forEach(([k, v]) => {
          const li = document.createElement("li");
          li.innerHTML = "<b>" + k + ":</b> ";
          li.append(document.createTextNode(String(v || "-")));   /* ค่าที่ผู้ใช้พิมพ์ = ห้ามยัดเป็น HTML */
          recap.append(li);
        });
      }
      form.classList.add("is-done");
      say(endpoint ? "" : "โหมดเดโม: ยังไม่ได้ต่อกับชีตจริง ข้อมูลไม่ถูกส่งออกไปไหน", endpoint ? "" : "wait");
    } catch (err) {
      btn && (btn.disabled = false);
      say("ส่งไม่สำเร็จ รบกวนโทรหรือทักไลน์แทนนะครับ", "err");
    }
  });
})();
