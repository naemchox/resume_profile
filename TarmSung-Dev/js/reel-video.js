/* =============================================================================
   reel-video.js — กลไกกลางของ "คลิปที่การ์ดเล่นตอนถูกชี้"

   ทำไมต้องมีไฟล์นี้
   ตรรกะชุดเดียวกันเคยอยู่สามที่: js/main.js (หน้าแรก) · js/peek.js (หน้าต่าง
   ดูผลงาน) · <script> ในตัว reference.html (หน้าอ้างอิงไม่ได้โหลด main.js)
   ทั้งสามต้องทำเรื่องเดียวกันเป๊ะ — เรียง WebM ก่อน MP4, เปิดคลิปเฉพาะตอนมี
   บัฟเฟอร์พอ, เช็ค :hover ก่อนโชว์ — แต่เขียนแยกกัน ผลคือ 21/8/26 พบว่า
   reference.html ใช้ประตูแค่ `playing` อย่างเดียว (ไม่มีเงื่อนไขบัฟเฟอร์) และ
   เคยเรียง mp4 ไว้ก่อน webm อยู่พักหนึ่งโดยไม่มีใครรู้ = หน้านั้นลากไฟล์ใหญ่กว่า
   อีกสองหน้าเงียบๆ นี่คืออาการมาตรฐานของ "ของชนิดเดียวกันเดินคนละกลไก"

   ไฟล์นี้เป็นสคริปต์ธรรมดา (ไม่ใช่ ES module) เพราะอีกสองไฟล์ก็เป็นสคริปต์ธรรมดา
   และต้องโหลดได้ทั้งใน index.html และ reference.html โดยไม่เปลี่ยนวิธีโหลดของเดิม
   ต้องมาก่อน main.js / peek.js ในหน้า

   ทุกข้อข้างล่างมาจากการวัดบนเว็บจริง ไม่ใช่ความชอบ — หลุดข้อไหนบั๊กเก่ากลับมาทันที
   ========================================================================== */
(() => {
  /* ---- ที่อยู่ของไฟล์คลิป: WebM ก่อน แล้วค่อยตก MP4 ------------------------
     คลิปชุดนี้เข้ารหัสสองแบบจากต้นฉบับเดียวกัน (playbook/shoot-reel.mjs ทำทั้งคู่
     ผ่าน playbook/webm-twin.mjs) วัด 21/8/26: VP9 CRF 48 เล็กกว่า H.264 CRF 31
     ราวครึ่งหนึ่ง (velvet-leaf 2,668KB -> 1,311KB · ijek 1,229KB -> 303KB) ที่
     SSIM 0.986 และบนเว็บจริงฝั่ง WebKit คลิปเดียวกันเฟรมแรกมาที่ 977ms (webm)
     เทียบกับ 1,739ms (mp4)

     ทำไมขนาดสำคัญกว่าปกติกับเว็บนี้: โฮสต์ (Cloudflare Pages) ไม่ตอบ Range
     request กับไฟล์วิดีโอ — ยิง Range แล้วได้ 200 พร้อมไฟล์ทั้งก้อน เบราว์เซอร์
     จึงต้องรอโหลดจริงก่อนเห็นภาพ และ Safari ก็ไม่เก็บคลิปไว้ในแคชปกติด้วยเหตุผล
     เดียวกัน ครึ่งหนึ่งของขนาด = ครึ่งหนึ่งของเวลารอทุกครั้ง

     รับมาร์กอัปสองแบบ เพราะสองหน้าเขียนไม่เหมือนกัน (ห้ามแก้ให้เหลือแบบเดียวโดย
     ไม่ไล่ทั้งสองหน้าพร้อมกัน ไม่งั้น hover ของหน้าที่ลืมจะตายเงียบๆ):
       หน้าแรก     data-reel="assets/work/reel/the-bed.mp4?v=14"   (พาธเต็ม)
       หน้าอ้างอิง  data-reel="the-bed" data-reel-v="14"            (ชื่อฐาน) */
  const sources = (raw, ver) => {
    const s = String(raw || "");
    if (!s) return [];
    /* สวิตช์วัดผล (22/8/26) — เปิดจาก js/perf-probe.js ปุ่ม 6 เท่านั้น ไม่มีทางติดเอง
       ที่มา: jek รายงานว่าคลิป Homecraft หน่วงหนักบนซาฟารีของเขา แต่วัดที่นี่ไม่ซ้ำเลย
       (WebKit จริง retina: เฟรมตก 0 · ซีพียู 8.3% กับ 8.6% ระหว่าง VP9 1440 กับ
       H.264 960 = แยกไม่ออก) ไปดูของจริงที่ awwwards.com กับ godly.website ซึ่งทำ
       เรื่องเดียวกัน พบว่าทั้งคู่เสิร์ฟ **MP4/H.264 ล้วน ไม่มี WebM** ที่ขนาดพอดีกล่อง
       บนหน้า — H.264 ถอดรหัสด้วยฮาร์ดแวร์ได้ทุกเครื่อง ส่วน VP9 บนแมคถอดด้วยซีพียู
       ทำ <ชื่อ>-sm.mp4 ไว้แล้ว (960x600 H.264 ดู playbook/make-reel-sm.mjs) แต่ยัง
       ไม่เปลี่ยนของจริง เพราะพิสูจน์ไม่ได้ว่าดีกว่า — ให้เครื่องที่เกิดอาการเป็นคนตัดสิน */
    if (typeof window !== "undefined" && window.__reelSmall) {
      /* รับมาร์กอัปสองแบบเหมือนกิ่งปกติข้างล่าง ไม่ใช่กฎที่สอง */
      const query = ver ? "?v=" + ver : "";
      if (s.includes("/") || s.includes(".mp4")) {
        const [p0, q0] = s.split("?");
        return [[p0.replace(/\.mp4$/, "") + "-sm.mp4" + (q0 ? "?" + q0 : ""), "video/mp4"]];
      }
      return [["assets/work/reel/" + s + "-sm.mp4" + query, "video/mp4"]];
    }
    if (s.includes("/") || s.includes(".mp4")) {
      const [path, q] = s.split("?");
      const query = q ? "?" + q : "";
      const stem = path.replace(/\.mp4$/, "");
      return [[stem + ".webm" + query, "video/webm"], [stem + ".mp4" + query, "video/mp4"]];
    }
    const query = ver ? "?v=" + ver : "";
    return [["assets/work/reel/" + s + ".webm" + query, "video/webm"],
            ["assets/work/reel/" + s + ".mp4" + query, "video/mp4"]];
  };

  const attach = (v, raw, ver) => {
    for (const [src, type] of sources(raw, ver)) {
      const el = document.createElement("source");
      el.src = src; el.type = type;
      v.appendChild(el);
    }
    return v;
  };

  /* ---- ประตู: คลิปจะถูก "อนุญาตให้เห็น" เมื่อไหร่ --------------------------
     วัด 21/8/26 (WebKit, tarmsung.pages.dev): ประตูเดิมคือ canplaythrough
     อย่างเดียว ซึ่งแปลว่า "โหลดครบทั้งไฟล์" คลิปกว่าจะโผล่ใช้เวลา 1.3–7.4 วินาที
     ไม่มีใครชี้ค้างนานขนาดนั้น อาการที่เจ้าของเว็บเจอคือ "บางทีชี้แล้วคลิปไม่เล่น"
     — มันเล่นอยู่ แต่ยังไม่ถูกอนุญาตให้เห็น

     ประตูนี้ = "มีของกันชนพอจะเล่นต่อไปได้" ไม่ใช่ "โหลดครบแล้ว":
     readyState พอเล่นได้ + บัฟเฟอร์ล้ำหน้าหัวอ่าน >= CUSHION วินาที
     canplaythrough ยังอยู่ในฐานะทางลัดว่าโหลดครบแล้ว

     ต้องฟังทั้งสี่อีเวนต์ ไม่ใช่ตัวเดียว: WebKit รายงาน buffered = 0 อยู่ราว 2
     วินาทีแรกแล้วค่อยกระโดด (instrument ราย 300ms) ถ้าไม่มีอีเวนต์ที่พากลับมา
     เช็คใหม่ คลิปจะค้างอยู่หลังประตูตลอดไปในบางเบราว์เซอร์

     และต้องเช็ค :hover ทุกครั้งก่อนโชว์ ไม่ใช่ตอนผูกอีเวนต์ — stop() สั่ง
     currentTime = 0 การ seek ทำให้อีเวนต์ยิงซ้ำ *หลัง* เมาส์ออกไปแล้ว คลิปที่
     หยุดอยู่จึงถูกเปิดค้างทับภาพนิ่ง (วัดใน Chromium: หลังเมาส์ออก reelOn ยัง
     เป็น "1" ทั้งที่ paused)

     ⚠️ กับดักตอนเขียนเทสอัตโนมัติ: `dispatchEvent(new PointerEvent("pointerenter"))`
     จะได้ <video> ที่ readyState = 4 แต่ reelOn ไม่มีวันเป็น "1" เพราะอีเวนต์
     สังเคราะห์ไม่ทำให้ matches(":hover") เป็นจริง — **นั่นคือการ์ดใบนี้ทำงานถูก
     ไม่ใช่ของพัง** ใครเห็นผลแบบนั้นแล้วไป "แก้" ประตูนี้ บั๊กคลิปค้างทับภาพนิ่ง
     จะกลับมาทันที ให้ขยับเมาส์จริงด้วย mouse.move แทน (และถ้าเป็นการ์ดในวงโค้ง
     ต้องหยุดอนิเมชันก่อน ไม่งั้นการ์ดเลื่อนหนีตัวชี้:
       addStyleTag(".reel, .reel * { animation-play-state: paused !important }")
     แล้วค่อยคำนวณ boundingBox — วัดได้ผลจริง 21/8/26: เล่นใน 464ms) */
  /* 22/8/26 — 2 -> 0.3 (jek: "hover แล้วบางทีดีเลย์ บางทีไม่")
     ทำไมถึงเป็นแบบนั้น วัดแล้วได้สองชั้นซ้อนกัน:
       1) Cloudflare Pages ตอบ Range request ด้วย 200 พร้อมไฟล์ทั้งก้อน ไม่ใช่ 206
          (วัดซ้ำ 22/8/26 ทุกชนิดไฟล์) เบราว์เซอร์จึงต้องลากคลิปมาทั้งก้อนก่อน
          ส่วน _headers ตั้ง immutable หนึ่งปี = ครั้งแรกรอ ครั้งที่สองทันที
          → นั่นคือ "บางทีดีเลย์ บางทีไม่" ตรงตัว
       2) ประตูนี้กั๊กคลิปไว้จนมีบัฟเฟอร์ล่วงหน้า 2 วินาที ซึ่งบวกทับเวลารอในข้อ 1

     ข้อ 1 เป็นของฝั่งโฮสต์ เราคุมไม่ได้ ข้อ 2 คุมได้ จึงลดเหลือ 0.3 วินาที
     ที่ทำแบบนี้ได้โดยบั๊กเก่าไม่กลับมา: เหตุผลเดิมของประตูคือกัน "จอดำทับภาพนิ่ง"
     ซึ่งเกิดตอน <video> ยังไม่มีเฟรมแรกเลย — readyState >= 3 แปลว่ามีเฟรมแล้ว
     และภาพนิ่งยังนอนอยู่ใต้คลิปเสมอ ถ้าเน็ตช้าจนคลิปสะดุด สิ่งที่เห็นคือเฟรมค้าง
     ไม่ใช่จอดำ (แลกกัน: เน็ตช้ามากอาจกระตุกช่วงแรกแทนที่จะรอแล้วลื่นรวดเดียว) */
  const CUSHION = 0.3;
  const wire = (v, host) => {
    const show = () => { if (host.matches(":hover")) host.dataset.reelOn = "1"; };
    const cushioned = () => {
      const b = v.buffered;
      return b.length ? b.end(b.length - 1) - v.currentTime >= CUSHION : false;
    };
    const maybe = () => { if (v.readyState >= 3 && cushioned()) show(); };
    v.addEventListener("canplaythrough", show);
    v.addEventListener("loadeddata", maybe);   // เฟรมแรกมาถึงแล้ว = เริ่มเช็คได้ตั้งแต่ตอนนี้
    v.addEventListener("playing", maybe);
    v.addEventListener("timeupdate", maybe);
    v.addEventListener("progress", maybe);
    return v;
  };

  /* ---- คืนหน่วยความจำหลังเมาส์ออกไปสักพัก --------------------------------
     เดิมคลิปถูกเก็บไว้ตลอดชีวิตของหน้า ("รอบหน้าเล่นจากแคช ไม่เสียอะไร") แต่สิ่ง
     ที่เสียคือ RAM กับตัวถอดรหัสวิดีโอ: วัด 21/8/26 ชี้การ์ดหกใบแล้วเหลือ <video>
     ค้างหกตัว โหลดไป 12.2MB ทั้งหน้าจึงหน่วงตอนเปิดหน้าต่างดูผลงาน
     ไฟล์ถูกแคชแบบ immutable อยู่แล้ว ชี้ซ้ำจึงไม่ได้โหลดใหม่
     ยกเลิกตัวจับเวลาเมื่อกลับมาชี้ ไม่งั้นคลิปที่กำลังเล่นจะถูกถอดกลางคัน */
  const hold = (v) => { clearTimeout(v._freeT); delete v.dataset.prefetch; };
  const release = (v, ms = 3000) => {
    clearTimeout(v._freeT);
    v._freeT = setTimeout(() => {
      if (v.paused) { v.removeAttribute("src"); v.load(); v.remove(); }
    }, ms);
  };

  /* ---- โหลดคลิปล่วงหน้าทีละใบ ตามคิว --------------------------------------
     22/8/26 (jek: "ทำให้การ์ดหน้า reference ไม่ติดขัดเหมือนการ์ดในฮีโร่")

     ทำไมฮีโร่ถึงไม่ติด ทั้งที่ใช้ประตูตัวเดียวกันเป๊ะ: โค้งในฮีโร่หมุนตลอดเวลา การ์ดใบอื่น
     ลอยผ่านใต้เมาส์ที่วางนิ่งอยู่เรื่อยๆ ยิง pointerenter เอง = คลิปถูกโหลดล่วงหน้าโดย
     ไม่มีใครตั้งใจ เป็นสิบวินาทีก่อนที่คนจะชี้จริง ส่วนการ์ดหน้า reference อยู่นิ่ง
     ไม่มีอะไรมาอุ่นให้ ครั้งแรกจึงรอเต็มๆ (วัด 3Mbps = 2.7 วิ · 10Mbps = 0.25 วิ
     เวลารอเป็นฟังก์ชันของขนาดไฟล์ล้วนๆ เพราะ Cloudflare ตอบ Range ด้วย 200 ทั้งก้อน)

     ทางที่ลองแล้ว "ไม่" ได้ผล — เขียนไว้กันคนมาลองซ้ำ:
     อุ่นตอนตัวชี้เข้าใกล้การ์ด (radius 300px) วัดที่ 3Mbps ได้ 2992ms เทียบกับ
     ไม่อุ่นเลย 2686ms = **ช้าลง** เพราะหัวที่ได้ก่อนไม่กี่ร้อย ms ไม่พอชดเชยการที่
     คลิปสองใบแย่งแบนด์วิดท์กัน คอขวดของหน้านี้คือแบนด์วิดท์ ไม่ใช่จังหวะเริ่มโหลด

     ที่ทำจริงจึงเป็นแบบเดียวกับฮีโร่: เริ่มโหลดตั้งแต่การ์ดเข้ามาในจอ แต่ **ทีละใบ**
     ต่อคิวกัน ใบถัดไปเริ่มก็ต่อเมื่อใบก่อนหน้าพร้อมเล่นแล้ว (หรือหมดเวลา) จึงไม่มีสอง
     ใบแย่งกันเลยสักครั้ง และไม่ยิงพร้อมกันทั้งหน้าตอนเปิด
     เฉพาะเครื่องที่มีตัวชี้จริง (hover: hover) — มือถือไม่โหลดอะไรล่วงหน้าเลย */
  const prefetchInView = (cards, ensure) => {
    if (!matchMedia("(hover: hover)").matches) return;
    if (navigator.connection && navigator.connection.saveData) return;   // ผู้ใช้ขอประหยัดเน็ต
    const queue = [];
    let busy = false;

    const next = () => {
      if (busy) return;
      const card = queue.shift();
      if (!card) return;
      if (card.querySelector(".shot-reel")) return next();   // มีแล้ว ข้ามไปใบถัดไป
      busy = true;
      const v = ensure(card);
      if (!v) { busy = false; return next(); }
      v.dataset.prefetch = "1";
      let done = false;
      const finish = () => {
        if (done) return;
        done = true; busy = false;
        clearTimeout(t);
        setTimeout(next, 120);        // เว้นจังหวะ ไม่ให้ต่อกันติดจนแย่งกับของที่คนกำลังชี้
      };
      /* พร้อมเล่น = พอแล้วสำหรับใบนี้ ไม่ต้องรอโหลดครบไฟล์ถึงจะขยับไปใบถัดไป */
      v.addEventListener("canplaythrough", finish, { once: true });
      v.addEventListener("error", finish, { once: true });
      const t = setTimeout(finish, 12000);   // เน็ตช้ามาก ๆ ไม่ให้คิวค้างตาย
    };

    /* ถือไว้เฉพาะการ์ดที่ยังอยู่ในจอ — ออกนอกจอแล้วคืนทิ้ง
       ทำไมต้องคืน: 21/8/26 เคยวัดแล้วว่าปล่อย <video> ค้างไว้หกตัว = 12.2MB
       ทั้งหน้าหน่วงตอนเปิดหน้าต่างดูผลงาน (เหตุผลเดียวกับที่ release() มีอยู่)
       ทำไมไม่ลบทิ้งทันทีที่โหลดเสร็จแล้วหวังพึ่งแคชของเบราว์เซอร์: บนซาฟารี
       คลิปที่เสิร์ฟด้วย 200 ทั้งก้อน (ไม่มี Range) ไม่ถูกเก็บในแคชปกติ — ทิ้ง
       เอลิเมนต์ = ทิ้งของที่เพิ่งโหลดมาทั้งก้อน แล้วการโหลดล่วงหน้าก็ไร้ผลบน
       เบราว์เซอร์ที่เจ้าของเว็บใช้เทสเอง จึงถือไว้ แต่ถือเท่าที่อยู่ในจอ */
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { queue.push(e.target); continue; }
        const i = queue.indexOf(e.target);
        if (i >= 0) queue.splice(i, 1);              // ออกนอกจอก่อนถึงคิว = ไม่ต้องโหลดแล้ว
        const v = e.target.querySelector(".shot-reel");
        if (v && v.paused && v.dataset.prefetch === "1") {
          v.removeAttribute("src"); v.load(); v.remove();
        }
      }
      next();
    }, { rootMargin: "200px" });     // เริ่มก่อนการ์ดโผล่พ้นขอบจอนิดหนึ่ง

    for (const c of cards) if (c.dataset.reel) io.observe(c);
  };

  /* ---- กดตอนคลิปกำลังเล่น: หยุดคลิปให้จบก่อน แล้วค่อยพาไป --------------------
     อาการ (jek 22/8/26): ชี้การ์ดจนคลิปเล่น แล้วกดรูปหรือกดปุ่ม "เปิดหน้าจริง"
     คลิปจะสะดุดค้างแป๊บนึงก่อนหน้าจะเปลี่ยน
     สาเหตุ: Safari 18 ทำ view transition ข้ามหน้าให้เอง ต้องถ่ายภาพนิ่งของหน้าเดิม
     ก่อนสลับ ถ่ายตอน <video> ยังเล่นอยู่ ตัวถอดรหัสกับการถ่ายภาพแย่งเฟรมกัน

     รอบแรกแก้ด้วยการ "สั่ง pause แล้วปล่อยให้เบราว์เซอร์เดินต่อ" ซึ่งไม่การันตีว่า
     เฟรมที่หยุดแล้วถูกวาดทันก่อนภาพถูกถ่าย — รอบนี้ทำเป็นลำดับตรงๆ ตามที่ jek สั่ง:
     หยุดคลิป -> รอให้วาดจบสองเฟรม -> ค่อยพาไปหน้าถัดไป
     ยึดการนำทางไว้เองเฉพาะตอนมีคลิปเล่นอยู่จริง ถ้าไม่มีคลิปเล่นก็ปล่อยผ่านทั้งดุ้น
     capture + stopPropagation เพื่อไม่ให้ peek.js สั่งนำทางซ้ำอีกทาง
     อยู่ในไฟล์นี้เพราะเป็นกลไกกลางของคลิปการ์ด หน้าแรกกับหน้าอ้างอิงใช้ร่วมกัน */
  const freezeReels = () => {
    for (const v of document.querySelectorAll(".card.work video")) {
      try { v.pause(); } catch { /* วิดีโอที่ถูกถอด src ไปแล้วโยน error ได้ ไม่ใช่เรื่อง */ }
    }
  };
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const card = e.target.closest?.(".card.work");
    if (!card) return;
    const link = e.target.closest?.("a.work-live[href]") || card.querySelector("a.work-live[href]");
    if (!link) return;
    const playing = [...document.querySelectorAll(".card.work video")].some((v) => !v.paused);
    if (!playing) return;                 /* ไม่มีคลิปเล่น = ไม่มีอะไรต้องรอ ปล่อยตามปกติ */
    e.preventDefault();
    e.stopPropagation();
    freezeReels();
    /* สองเฟรม: เฟรมแรกให้เบราว์เซอร์รับรู้ว่าหยุด เฟรมที่สองให้มันวาดเฟรมนิ่งจริง
       ตั้งเวลาสำรองไว้ด้วย เพราะ rAF ไม่ทำงานถ้าแท็บถูกซ่อน */
    let gone = false;
    const go = () => { if (!gone) { gone = true; location.href = link.href; } };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 200);
  }, true);
  addEventListener("pagehide", freezeReels);

  window.reelVideo = { sources, attach, wire, hold, release, prefetchInView, CUSHION, freezeReels };
})();
