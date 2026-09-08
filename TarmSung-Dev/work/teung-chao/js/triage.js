/* triage.js — เครื่องมือ "ควรพามาเลยไหม" + นาฬิกาในแถบฮีโร่
   หน้านี้ต้องอ่านได้ครบโดยไม่มีไฟล์นี้ (ระดับ 1-2-3 อยู่ใน HTML เต็มอยู่แล้ว)
   ไฟล์นี้เพิ่มแค่ "สรุปตามที่คุณเลือก" ทับลงไป — JS พังแล้วหน้าไม่หาย */
(function () {
  "use strict";

  /* ---- แถบบริบทบนฮีโร่: เวลาจริงจากเครื่องผู้ใช้ ไม่ใช่ตัวเลขปลอม ------------
     รูปฮีโร่บอกไม่ได้ว่านี่คือโรงพยาบาลสัตว์ (ตกเกณฑ์ §4.1 ข้อ 3) แถบนี้คือของที่
     ให้บริบทแทน — ถ้าเขียนเวลาตายตัวไว้ในหน้า มันจะผิดทันทีที่ไม่ใช่เวลานั้น */
  var clock = document.querySelector("[data-clock]");
  if (clock) {
    var tick = function () {
      var d = new Date();
      var hh = String(d.getHours()).padStart(2, "0");
      var mm = String(d.getMinutes()).padStart(2, "0");
      clock.textContent = hh + ":" + mm + " น.";
    };
    tick();
    setInterval(tick, 30000);
  }

  /* การ์ดลอยบนฮีโร่: บอกว่า "ตอนนี้ใครอยู่เวร" ตามเวลาจริงของเครื่องผู้ใช้
     velvet วางเวลาเปิด-ปิดตายตัวไว้ตรงนี้ — ของเราเดินตามเวลาจริง เพราะจุดขายคือ 24 ชม.
     ถ้า JS ไม่ทำงาน การ์ดจะขึ้นข้อความรอไว้ ไม่ใช่ช่องว่าง */
  var shift = document.querySelector("[data-shift]");
  if (shift) {
    var setShift = function () {
      var h = new Date().getHours();
      var txt = (h >= 22 || h < 6) ? "กะดึก · สัตวแพทย์ 1 คน + ผู้ช่วย 2 คน"
              : (h < 14)           ? "กะเช้า · สัตวแพทย์ 3 คน"
                                   : "กะบ่าย · สัตวแพทย์ 2 คน";
      shift.textContent = txt;
    };
    setShift();
    setInterval(setShift, 60000);
  }

  var form = document.getElementById("triage");
  var out = document.getElementById("tri-out");
  if (!form || !out) return;

  var LV = {
    3: { cls: "lv--now", head: "มาเดี๋ยวนี้ ไม่ต้องรอ",
         say: "โทรระหว่างทางได้เลย เราจะเตรียมห้องรอไว้ก่อนคุณถึง ไม่ต้องนั่งรอคิว",
         act: '<a class="btn btn--solid btn--lg" href="tel:038000000">โทร 038-xxx-xxx</a>' +
              '<a class="btn btn--outline btn--lg" href="#route">ดูเส้นทาง</a>' },
    2: { cls: "lv--watch", head: "ดูอาการ 2 ชั่วโมง แล้วโทรบอกเรา",
         say: "ยังไม่ต้องรีบออกจากบ้าน แต่อย่าเพิ่งนอน — ถ้าอาการเพิ่มขึ้นภายในสองชั่วโมง ให้ถือเป็นระดับ 1 ทันที",
         act: '<a class="btn btn--outline btn--lg" href="tel:038000000">โทรถามก่อนได้ ไม่คิดเงิน</a>' },
    1: { cls: "lv--morning", head: "รอเช้าได้ นอนพักก่อน",
         say: "พรุ่งนี้เดินเข้ามาได้เลยไม่ต้องนัด มาก่อน 10:00 จะได้คิวเร็วที่สุด",
         act: '<a class="btn btn--outline btn--lg" href="#route">ดูที่ตั้งและเวลาทำการ</a>' }
  };

  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  var render = function () {
    var picked = [].slice.call(form.querySelectorAll("input:checked"));
    if (!picked.length) { out.innerHTML = ""; out.className = "tri-out"; return; }

    var top = 0, names = [];
    picked.forEach(function (el) {
      var lv = parseInt(el.getAttribute("data-lv"), 10) || 1;
      if (lv > top) top = lv;
      names.push(el.value);
    });
    var r = LV[top];

    out.className = "tri-out is-on " + r.cls;
    out.innerHTML =
      '<p class="tri-out-kicker">จากอาการที่คุณเลือก ' + picked.length + ' ข้อ</p>' +
      '<h3 class="tri-out-head"><span class="lv-badge" aria-hidden="true">' + (4 - top) + "</span>" + esc(r.head) + "</h3>" +
      "<p>" + esc(r.say) + "</p>" +
      '<ul class="tri-out-list">' + names.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" +
      '<div class="act">' + r.act + "</div>";
  };

  form.addEventListener("change", render);
  render();
})();
