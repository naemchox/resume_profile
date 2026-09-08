/* =============================================================================
   หน้าต่างดูผลงาน (peek) — กดการ์ดผลงานแล้วเปิดคลิปในหน้าต่าง ไม่ใช่กระโดดออกไป
   ใช้ร่วมกันทั้งหน้าแรกและหน้า "อ้างอิงผลงาน"

   ทำไมเป็นไฟล์กลาง ไม่ใช่ก๊อปสองชุด: ตอนแรกโค้ดชุดนี้อยู่ในหน้า reference
   หน้าเดียว หน้าแรกจึงยังพาคนออกไปเว็บเดโมตั้งแต่คลิกแรก — การ์ดหน้าตาเดียวกัน
   สองที่ต้องกดแล้วได้ผลเหมือนกัน ไม่งั้นคนที่กดจากหน้าแรกไม่มีทางรู้ว่ามีคลิปอยู่

   สิ่งที่หน้าต่างนี้ให้ ซึ่ง hover ให้ไม่ได้: แถบเวลาให้ลากดูเองได้ และปุ่มไป
   เว็บจริงยังอยู่ในหน้าต่างสำหรับคนที่อยากกดของจริงต่อ
   ใช้ <dialog> เพราะ Esc, โฟกัสวนในกล่อง และการปิดฉากหลังไม่ให้กดโดน มาฟรี
   ========================================================================== */
(() => {
  const CARD = ".card.work";
  if (!document.querySelector(CARD)) return;

  // มาร์กอัปถูกเขียนที่นี่ ไม่ได้ฝังในหน้า HTML ทั้งสองหน้า: กล่องเดียวกันสองสำเนา
  // ในสองไฟล์คือของที่จะเพี้ยนจากกันวันใดวันหนึ่ง
  const dlg = document.createElement("dialog");
  dlg.className = "peek";
  dlg.setAttribute("aria-labelledby", "peek-title");
  /* แท็บ (คลิป / ภาพนิ่ง) ถูกแทนด้วยการเลื่อนทีละหน้าแบบไลต์บ็อกซ์ (21/8/26 ตามที่
     jek ชี้ตัวอย่างของ Fastwork มา): คลิปคือหน้าที่ 1 ภาพหน้าเว็บคือหน้าถัดๆ ไป
     เลื่อนซ้าย-ขวาได้ทั้งด้วยปุ่ม ลูกศรคีย์บอร์ด และกดรูปย่อข้างล่าง
     เหตุผลที่ดีกว่าแท็บ: แท็บบอกว่ามี "สองอย่าง" แต่ไม่บอกว่าอย่างที่สองมีกี่หน้า
     ตัวนับ n/N กับแถบรูปย่อบอกทั้งจำนวนและว่าตอนนี้อยู่ตรงไหน */
  dlg.innerHTML =
    '<div class="peek-head"><h3 id="peek-title"></h3>' +
    '<span class="peek-count" aria-live="polite"></span>' +
    '<button class="peek-x" type="button" aria-label="ปิดหน้าต่าง">&times;</button></div>' +
    '<div class="peek-body">' +
      '<button class="peek-arrow peek-prev" type="button" aria-label="หน้าก่อนหน้า">&#8249;</button>' +
      '<div class="peek-stage"></div>' +
      '<button class="peek-arrow peek-next" type="button" aria-label="หน้าถัดไป">&#8250;</button>' +
    '</div>' +
    /* จุดบอกหน้า ไม่ใช่แถบรูปย่อ (21/8/26 ตามตัวอย่างที่ jek ชี้มา): แถบรูปย่อ
       ต้องโหลดไฟล์ -t.webp เพิ่มทุกใบ กินความสูงร่วม 110px และรูปจิ๋วขนาดนั้น
       ก็ดูไม่ออกอยู่ดีว่าหน้าไหนเป็นหน้าไหน — สิ่งเดียวที่มันบอกได้จริงคือ
       "มีกี่หน้า และตอนนี้อยู่ใบไหน" ซึ่งจุดบอกได้ครบด้วยพื้นที่หนึ่งบรรทัด
       บรรทัดคำใบ้ใต้กล่อง (.peek-foot) ถูกถอดออกพร้อมกัน — ลูกศรทั้งสองข้าง
       กับจุดข้างล่างบอกวิธีใช้ในตัวมันเองอยู่แล้ว */
    '<div class="peek-strip" role="tablist" aria-label="เลือกหน้าที่จะดู"></div>';

  if (typeof dlg.showModal !== "function") return;   // เบราว์เซอร์เก่า: ปล่อยให้ลิงก์ทำงานตามเดิม
  document.body.appendChild(dlg);

  const stage = dlg.querySelector(".peek-stage");
  const title = dlg.querySelector("#peek-title");
  const strip = dlg.querySelector(".peek-strip");
  const count = dlg.querySelector(".peek-count");
  const prevB = dlg.querySelector(".peek-prev");
  const nextB = dlg.querySelector(".peek-next");
  let opener = null;
  let items = [];      // [{kind:"clip"|"img", src, label}]
  let at = 0;                                  // การ์ดที่กด — ไว้คืนโฟกัสตอนปิด

  /* คลิปที่ถูก "ยืม" มาจากการ์ด (ดู buildVideo) — จำที่อยู่เดิมไว้ตัวเดียวพอ
     เพราะหน้าต่างนี้มีใบเดียวและเล่นทีละคลิป */
  let lent = null;
  const dispose = (v) => {
    if (!v) return;
    if (lent && lent.v === v) {
      v.pause(); v.currentTime = 0;
      v.controls = false; v.removeAttribute("controls");
      lent.home.appendChild(v);            // คืนที่เดิม การ์ดจึงยังโชว์คลิปตอน hover ได้เหมือนเดิม
      if (lent.card) lent.card.dataset.reelOn = "0";
      lent = null;
      return;
    }
    v.pause(); v.removeAttribute("src"); v.load();   // หยุดโหลดจริง ไม่ใช่แค่หยุดเสียง
  };

  const clear = () => {
    dispose(stage.querySelector("video"));
    stage.removeAttribute("data-loading");
    stage.textContent = "";
    stage.classList.remove("peek-stage--mix");
    strip.textContent = "";
    items = []; at = 0;
    seq++;                       // ภาพของการ์ดใบก่อนที่ decode ค้างอยู่ ต้องตกรอบไปด้วย
  };

  /* data-reel มีสองรูปแบบในไซต์นี้ และต้องรับได้ทั้งคู่:
       หน้าแรก      = พาธเต็มพร้อมเลขรุ่น "assets/work/reel/the-bed.mp4?v=4"
                      (js/main.js อ่านค่านี้ไปใส่ <video> ตรงๆ)
       หน้าอ้างอิง  = ชื่อฐาน "the-bed" + data-reel-v="5"
     เขียนตัวแปลงไว้ที่เดียวตรงนี้ ดีกว่าไปแก้มาร์กอัปฝั่งใดฝั่งหนึ่งแล้วทำ hover
     ของหน้านั้นพัง */
  /* ตัวแปลง data-reel สองแบบ -> รายการ <source> ย้ายไปอยู่ที่ js/reel-video.js
     แล้ว (21/8/26) ใช้ร่วมกับหน้าแรกและหน้าอ้างอิง — เดิมสามที่เขียนแยกกันแล้ว
     ลำดับ WebM/MP4 เพี้ยนกันเงียบๆ */
  const sources = (raw, ver) => window.reelVideo.sources(raw, ver);

  function buildVideo(raw, ver, card) {
    /* การ์ดที่เพิ่งถูกชี้ได้โหลดคลิปใบเดียวกันนี้ไว้แล้ว — ยืมอิลิเมนต์นั้นมาทั้งตัว
       แทนที่จะสร้าง <video> ใหม่

       ทำไมต้องยืม ไม่ใช่สร้างใหม่แล้วให้แคชทำงาน: วัดกับเว็บจริง 21/8/26 (WebKit)
       ชี้การ์ดจนคลิปเล่นแล้วค่อยกด ยังต้องรออีก 1.5 วินาทีกว่าเฟรมแรกจะมา และ
       เห็นคำขอไฟล์ .mp4 เดิม (?v เดียวกัน) สองครั้ง — เพราะโฮสต์ไม่ตอบ Range
       request ตัวโหลดสื่อของ Safari จึงไม่เก็บคลิปไว้ในแคชปกติ ต่อให้ header เป็น
       immutable ก็ตาม การย้าย "อิลิเมนต์เดิม" เข้ามาในหน้าต่างจึงเป็นทางเดียวที่
       เอาบัฟเฟอร์ที่โหลดมาแล้วมาใช้ต่อได้ ไม่ใช่โหลดซ้ำทั้งก้อน

       readyState >= 2 = มีข้อมูลของเฟรมปัจจุบันแล้ว ถ้าน้อยกว่านั้นการยืมไม่ได้
       ช่วยอะไร สร้างใหม่ตามเดิมดีกว่า (แถบเวลาจะได้เริ่มนับจากศูนย์) */
    const held = card && card.querySelector("video.shot-reel");
    if (held && held.readyState >= 2) {
      lent = { v: held, home: held.parentElement, card };
      held.controls = true;
      held.loop = true;
      held.playsInline = true;
      held.play().catch(() => {});
      return held;
    }
    const v = document.createElement("video");
    v.controls = true;      // แถบเวลา = สิ่งที่ทำให้หน้าต่างนี้ต่างจาก hover
    v.autoplay = true;
    v.muted = true;         // ไม่งั้น autoplay ถูกปฏิเสธ (คลิปไม่มีเสียงอยู่แล้ว)
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    /* รูปนิ่งของการ์ดใบเดียวกัน ใช้เป็น poster: คลิปหนัก 2-3MB และเซิร์ฟเวอร์
       (Cloudflare Pages) ส่งมาทั้งไฟล์เสมอ ระหว่างรอเฟรมแรก <video> จึงทาสีดำ
       ทับพื้นที่ทั้งกล่อง — คนกดดูผลงานเห็นจอดำก่อนเห็นงาน รูปนี้อยู่ในแคช
       ตั้งแต่ตอนที่การ์ดแสดงผลแล้ว ไม่มีการโหลดเพิ่ม */
    const still = card && card.querySelector(".preview, .shot");
    if (still) v.poster = still.currentSrc || still.src;
    sources(raw, ver).forEach(([src, type]) => {
      const s = document.createElement("source");
      s.src = src; s.type = type;
      v.appendChild(s);
    });
    /* คลิป 1.5-2.7MB บนโฮสต์ที่ส่งมาทั้งไฟล์เสมอ = รอได้เป็นวินาที รูปนิ่ง (poster)
       ทำให้ไม่เห็นจอดำ แต่ก็ทำให้ดูเหมือนหน้าต่างค้าง ไม่ใช่กำลังโหลด บอกไปตรงๆ
       ดีกว่า แล้วเก็บป้ายทันทีที่ภาพเริ่มเดิน */
    stage.dataset.loading = "1";
    const done = () => stage.removeAttribute("data-loading");
    v.addEventListener("playing", done);
    v.addEventListener("loadeddata", done);
    v.addEventListener("error", done);
    return v;
  }

  /* ภาพหน้าเว็บของงานชิ้นหนึ่ง อยู่ที่ assets/work/pages/<ชื่อ>-1..3.webp เสมอ —
     ชื่อนี้ไม่ได้ตั้งเอาเอง มันคือสิ่งที่ playbook/shoot-pages.mjs ผลิตออกมา
     (ช่วงบน ~40% ~75% ของหน้า) จึงเดาจากชื่อคลิปได้ ไม่ต้องไปพิมพ์รายชื่อซ้ำ
     ลงมาร์กอัปทั้งสองหน้า — รายชื่อที่เขียนมือสองที่คือของที่จะเพี้ยนจากกันวันหนึ่ง
     ใบไหนไม่มีไฟล์ ตัวมันเองจะถอนตัวออกตอน error ข้างล่าง */
  /* หน้าอ้างอิงผลงานเขียน <img class="shot"> ของภาพชุดนี้ไว้ในมาร์กอัปอยู่แล้ว
     พร้อมเลขรุ่นรายไฟล์ (ซึ่งด่านตรวจของ deploy.mjs คุมให้) ถ้ามีอยู่ในหน้า ใช้
     src อันนั้นตรงๆ — ไม่งั้นไฟล์เดียวกันถูกโหลดสองรอบด้วยคนละ ?v (ครั้งหนึ่ง
     ตอนวาดการ์ด อีกครั้งตอนเปิดหน้าต่าง) หน้าแรกไม่มีภาพชุดนี้ในมาร์กอัป จึงตก
     มาใช้เลขรุ่นรวมจาก loader.js */
  let shotSrc = null;
  const shotUrl = (name) => {
    if (!shotSrc) {
      shotSrc = new Map();
      document.querySelectorAll('img[src*="assets/work/pages/"]').forEach((im) => {
        const file = im.getAttribute("src").split("/").pop().split("?")[0].replace(/\.webp$/, "");
        if (!shotSrc.has(file)) shotSrc.set(file, im.getAttribute("src"));
      });
    }
    return shotSrc.get(name) || "assets/work/pages/" + name + ".webp?v=" + (window.TS_PAGES_V || 1);
  };
  /* เดิมล็อกไว้ 3 ใบ — ตอนนี้ playbook/shoot-pages.mjs ถ่ายตามความยาวหน้า (3-8 ใบ)
     จึงเดาชื่อไปถึง 8 แล้วให้ probe() คัดใบที่ไม่มีไฟล์ออกก่อนเปิดหน้าต่าง
     (ค่าโหลดลองคือ HEAD-ish ของภาพเล็กๆ ที่เบราว์เซอร์จะแคชไว้ให้อยู่แล้ว) */
  /* สามใบต่องานเว็บ — ตรงกับที่ playbook/shoot-pages.mjs ถ่าย ถ้าเดาไปถึงแปดเหมือน
     ตอนก่อนหน้า เปิดการ์ดหนึ่งใบจะยิงคำขอที่ตอบ 404 ห้าครั้งทุกครั้ง เพื่อไม่ได้อะไร
     (การ์ดแอปไม่ผ่านทางนี้ มันระบุรายชื่อภาพเองใน data-pages) */
  const pageShots = (slug) => [1, 2, 3].map((i) => `${slug}-${i}`);

  /* ชื่อฐานของคลิป: หน้าแรกส่ง "assets/work/reel/lumen.mp4?v=2" หน้าอ้างอิงส่ง
     "lumen" — ทั้งคู่ต้องได้ "lumen" เท่ากัน (เหตุผลเดียวกับ sources() ข้างบน) */
  function slugOf(raw) {
    return raw.split("?")[0].split("/").pop().replace(/\.mp4$/, "");
  }

  // แอปไม่มี fold ให้เลื่อน — โชว์เป็นแถบจอเลื่อนข้างแทนคลิป
  // การ์ดที่มีคลิป ใช้แถบเดียวกันนี้ต่อท้ายคลิป (ดูในตัวจัดการคลิกข้างล่าง)
  function buildShots(names, still) {
    const wrap = document.createElement("div");
    wrap.className = "peek-shots";
    if (still) { const a = document.createElement("img"); a.src = still.currentSrc || still.src; a.alt = still.alt || ""; wrap.appendChild(a); }
    names.forEach((n) => {
      const img = document.createElement("img");
      img.src = shotUrl(n);
      img.alt = "";
      // ภาพที่ไม่มีไฟล์หายไปเงียบๆ และถ้าหายหมดแถบก็ต้องหายด้วย ไม่งั้นเหลือ
      // แถบเปล่าที่ยังกินที่และยังบีบคลิปให้เตี้ยลงเพื่อไม่มีอะไรเลย
      img.addEventListener("error", () => {
        img.remove();
        if (!wrap.querySelector("img")) { wrap.remove(); stage.classList.remove("peek-stage--mix"); }
      });
      wrap.appendChild(img);
    });
    return wrap;
  }

  /* ---- สร้างรายการหน้าที่ดูได้ แล้วเลื่อนทีละหน้า --------------------------
     รายการ = [คลิป, ภาพหน้าเว็บ 1..3] สำหรับงานเว็บ · [ภาพจอ 1..n] สำหรับแอป
     ภาพที่ไฟล์ไม่มีจริงจะถูกคัดออกตั้งแต่ตอนสร้าง (โหลดลองก่อน) ไม่ใช่ปล่อยให้
     ขึ้นกรอบเปล่าแล้วค่อยหายตอน error — ตัวนับ n/N จะได้ไม่โกหกตั้งแต่วินาทีแรก */
  function probe(src) {
    return new Promise((ok) => {
      const im = new Image();
      im.onload = () => ok(true); im.onerror = () => ok(false);
      im.src = src;
    });
  }

  /* แท่งไฟที่ "เลื่อน" ไปยังจุดที่กำลังดู แทนการสลับสีจุดทีละใบ
     เหตุผล: การเปลี่ยนสีคือของหายที่หนึ่งไปโผล่อีกที่หนึ่ง สายตาต้องไปหาเอง
     ว่าตอนนี้อยู่ใบไหน ส่วนของที่เลื่อนบอกทั้ง "ไปไหน" และ "ไปทางไหน" ในตัวเดียว
     ทำเป็น element เดียวที่ย้ายตำแหน่ง ไม่ใช่ 9 จุดที่ผลัดกันติดไฟ */
  let live = null;
  function placeLive(animate) {
    const pip = strip.querySelector(".peek-pip.is-on");
    if (!live || !pip) return;
    const x = pip.offsetLeft + pip.offsetWidth / 2;
    live.style.transition = animate ? "" : "none";
    live.style.transform = `translateX(${Math.round(x)}px) translateX(-50%)`;
    if (animate) {                       // วงหมึกจางๆ ตอนแท่งไฟลงจอด ภาษาเดียวกับตราปั๊มในหน้า "จุดเด่น"
      live.classList.remove("is-landing");
      void live.offsetWidth;             // บังคับให้ animation เริ่มใหม่ ไม่ใช่ต่อของเดิม
      live.classList.add("is-landing");
    }
    if (!animate) requestAnimationFrame(() => { live.style.transition = ""; });
  }

  function renderStrip() {
    strip.textContent = "";
    live = null;
    if (items.length < 2) return;              // หน้าเดียวไม่ต้องมีจุดให้เลือก
    items.forEach((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "peek-pip" + (i === at ? " is-on" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(i === at));
      b.setAttribute("aria-label", it.label);   // จุดเปล่าไม่มีข้อความ ชื่อจึงต้องมาทางนี้
      b.addEventListener("click", () => go(i));
      /* หน้าแรกของงานเว็บคือคลิป — จุดของมันมีสามเหลี่ยมเล็กๆ บอกไว้ก่อนกด
         ไม่ใช่ให้กดแล้วค่อยรู้ว่าอันนี้ขยับได้ */
      if (it.kind === "clip") b.classList.add("peek-pip--clip");
      strip.appendChild(b);
    });
    live = document.createElement("span");
    live.className = "peek-live";
    live.setAttribute("aria-hidden", "true");
    strip.appendChild(live);
    requestAnimationFrame(() => placeLive(false));   // ครั้งแรกไม่ต้องวิ่งมาจากซ้ายมือ
  }

  /* เปลี่ยนหน้าแล้วกะพริบ เพราะของเดิมล้างเวทีทิ้งก่อน แล้วค่อยยัด <img> ที่ยัง
     ไม่มีบิตแมปเข้าไป — ระหว่างนั้นเวทีคือกล่องดำเปล่าหนึ่งเฟรมขึ้นไป
     (jek: "it blinks when i change page of images")
     ท่าที่ถูกคือ "ถอดของเก่าออกตอนของใหม่พร้อมแล้ว" ไม่ใช่ก่อนหน้านั้น จึงถอด
     ภาพให้ decode เสร็จก่อนค่อยสลับ ส่วน seq กันคนกดลูกศรรัวจนภาพที่ decode
     ช้ากว่ามาถึงทีหลังแล้วแย่งเวทีของหน้าที่ผู้ใช้อยู่จริง */
  let seq = 0;

  /* กล่องหดตามขนาดสื่อ (ดู .peek ใน styles.css) แถวจุดจึงเปลี่ยนความกว้างทุกครั้ง
     ที่หน้าใหม่ขึ้นเวที — แท่งไฟที่คำนวณตำแหน่งไว้ตอนกดจึงไปยืนผิดที่ วัดใหม่หลัง
     ของขึ้นจอแล้วเท่านั้น */
  function paint(node, isImg, mine) {
    if (mine !== seq) return;                    // ผู้ใช้กดต่อไปแล้ว หน้านี้ตกรอบ
    dispose(stage.querySelector("video"));
    stage.textContent = "";
    stage.classList.toggle("peek-stage--img", isImg);
    stage.appendChild(node);
    requestAnimationFrame(() => placeLive(false));
  }

  // หน้าถัดไปกับหน้าก่อนหน้าโหลดดักไว้ล่วงหน้า: กดลูกศรแล้วภาพมาทันที ไม่ต้องรอ
  function warm() {
    [at + 1, at - 1].forEach((n) => {
      const it = items[(n + items.length) % items.length];
      if (it && it.kind === "img") { const im = new Image(); im.decoding = "async"; im.src = it.src; }
    });
  }

  function go(i) {
    if (!items.length) return;
    at = (i + items.length) % items.length;
    const it = items[at];
    const mine = ++seq;
    if (it.kind === "clip") {
      paint(buildVideo(it.raw, it.ver, it.card), false, mine);
    } else {
      const img = new Image();
      img.className = "peek-full";
      /* ภาพหน้าเว็บของงานกว้าง 2,560px (จอ retina ต้องการเท่านั้นถึงจะไม่เบลอ) การถอด
         รหัสภาพขนาดนี้กินเวลาหลักสิบมิลลิวินาที ถ้าปล่อยให้ทำบนเธรดหลักตามค่าเริ่มต้น
         จังหวะกดลูกศรจะสะดุดหนึ่งเฟรมทุกครั้ง — async ย้ายงานถอดรหัสออกไป (jek ทักว่า
         หน่วง 21/8/26 · เครื่องที่เปิดหลายแท็บยิ่งรู้สึกชัด) */
      img.decoding = "async";
      img.src = it.src; img.alt = it.label;
      /* มีชั้นอิโมจิ = ต้องมีกล่องอ้างอิงให้พิกัดเปอร์เซ็นต์เกาะ ตัว <img> เปล่าๆ
         เป็นกล่องนั้นไม่ได้ */
      let node = img;
      if (it.emo) {
        node = document.createElement("div");
        node.className = "peek-emo";
        node.appendChild(img);
        const layer = document.createElement("span");
        layer.className = "emo-layer";
        layer.setAttribute("data-on", "1");
        layer.setAttribute("aria-hidden", "true");
        layer.innerHTML = it.emo;
        node.appendChild(layer);
      }
      /* รอ "โหลดเสร็จ" อย่างเดียว ไม่รอ img.decode(): decode() ไม่ยอม resolve
         ตอนแท็บถูกซ่อนอยู่ ภาพจึงไม่เคยขึ้นเวทีเลยและเวทีค้างอยู่ที่หน้าเดิม
         ทั้งที่ตัวนับเดินไปแล้ว (เจอตอนทดสอบผ่านแท็บที่ไม่ได้อยู่หน้าจอ)
         ต้นเหตุของการกะพริบคือการรอ "ไฟล์" ไม่ใช่การรอถอดรหัสภาพอยู่แล้ว
         และ probe() โหลดทุกใบไว้ตั้งแต่ตอนเปิดหน้าต่าง ปกติจึงเข้าแคชทันที */
      const show = () => paint(node, true, mine);
      if (img.complete) show();
      else { img.onload = show; img.onerror = show; }
    }
    warm();
    count.textContent = items.length > 1 ? (at + 1) + " / " + items.length : "";
    prevB.hidden = nextB.hidden = items.length < 2;
    strip.querySelectorAll(".peek-pip").forEach((b, i2) => {
      b.classList.toggle("is-on", i2 === at);
      b.setAttribute("aria-selected", String(i2 === at));
    });
    /* ต้องเรียกหลังสลับคลาส ไม่ใช่ก่อน — placeLive หาตำแหน่งจาก .peek-pip.is-on
       เรียกก่อนสลับ = แท่งไฟวิ่งไปจุดเดิมทุกครั้ง (ช้ากว่าความจริงหนึ่งก้าวเสมอ) */
    placeLive(true);
  }

  /* การ์ดผลงานไม่ใช่ <a> อีกแล้ว (21/8/26: ตัวการ์ดเลิกเป็นลิงก์ กดที่ใบ = ดูภาพ/คลิป
     ในหน้าต่างนี้ · 22/8/26 ทางออกไปเว็บจริงกลับมาแล้วในรูปลิงก์ "เปิดหน้าจริง" ในใบ
     ไม่ใช่ทั้งใบ — เฉพาะการ์ดเว็บไซต์ ไม่รวมการ์ดแอป) — <a> เคยแถมการกดด้วยคีย์บอร์ดมาให้ฟรี
     พอกลายเป็น <div role="button"> ต้องต่อ Enter/Space เข้ากับคลิกเอง ไม่งั้นคนที่
     ใช้คีย์บอร์ดหรือ screen reader เปิดผลงานไม่ได้เลยสักใบ */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    /* โฟกัสอยู่บนลิงก์ในการ์ด (เช่น "เปิดหน้าจริง") ต้องปล่อยให้ Enter พาไปหน้านั้น
       ไม่ใช่ถูกดักมาเปิดหน้าต่างดูภาพ — ด่านเดียวกับที่ตัวจัดการคลิกข้างล่างกันไว้
       ถ้ากันแค่ที่คลิก คนใช้เมาส์จะไปเว็บจริงได้ แต่คนใช้คีย์บอร์ดไปไม่ได้ */
    if (e.target.closest("a[href]")) return;
    const card = e.target.closest(`${CARD}[role="button"]`);
    if (!card) return;
    e.preventDefault();
    card.click();
  });

  document.addEventListener("click", async (e) => {
    /* ลิงก์จริงในการ์ด (เช่น "เปิดหน้าจริง →") ต้องพาไปหน้านั้น ไม่ใช่เปิดหน้าต่าง
       ดูภาพทับ — กันที่ตัวจัดการเดียวตรงนี้ ดีกว่าไปใส่ stopPropagation ทีละลิงก์
       ในมาร์กอัปสองหน้า ซึ่งคือของที่จะลืมใส่ในใบใดใบหนึ่งวันหนึ่ง */
    if (e.target.closest("a[href]")) return;
    const card = e.target.closest(CARD);
    if (!card) return;
    if (e.button !== 0) return;
    /* การ์ดที่มีเว็บจริงให้เปิดแล้ว (ปุ่ม "เปิดหน้าจริง" ในตัวการ์ด) = กดตรงไหนก็พาไป
       หน้านั้นเลย ไม่ต้องเปิดหน้าต่างดูภาพคั่นกลาง (22/8/26 jek: กดรูปการ์ดแล้วยังเจอ
       คลิป ทั้งที่ควรพาไปเว็บ) หน้าต่างดูภาพถูกทำขึ้นตอนเดโมยังไม่ได้ขึ้นออนไลน์
       ตอนนี้มันขึ้นแล้ว ของจริงย่อมดีกว่าภาพของของจริง
       การ์ดแอป (Ijek/ScoreUp) ไม่มีลิงก์นี้เพราะแอปถูกล็อกด้วย Google — พวกนั้นยังใช้
       หน้าต่างดูภาพเหมือนเดิม */
    const live = card.querySelector("a.work-live[href]");
    if (live) {
      e.preventDefault();
      /* กดการ์ด = กดปุ่ม "เปิดหน้าจริง" ของการ์ดนั้นตรงๆ ไม่ใช่เรียก window.open เอง
         (แก้ 22/8/26) — window.open ถูกซาฟารีบล็อกได้ ตัวโค้ดเดิมจึงมี fallback ไป
         window.location ผลคือ **วัดแล้วมันทำทั้งสองอย่าง**: เปิดแท็บใหม่ด้วย และพา
         แท็บเดิมออกจากหน้าเว็บด้วย = คนกดกลับมาหน้าผลงานไม่ได้อีก
         การสั่ง .click() บนลิงก์จริงที่อยู่ในมาร์กอัปอยู่แล้ว เบราว์เซอร์นับเป็นการกด
         ของคน ไม่โดนบล็อก และมีพฤติกรรมเดียวกับตอนกดปุ่มเป๊ะ = กลไกเดียว ไม่ใช่สองทาง */
      live.click();
      return;
    }
    const reel = card.dataset.reel;
    const pages = (card.dataset.pages || "").split(",").filter(Boolean);
    /* การ์ดที่ไม่มีทั้งคลิปและรายชื่อภาพ ยังเปิดหน้าต่างได้ถ้ามีรูปหน้าปก —
       Ijek กับแอปอื่นๆ ถูกล็อกด้วย Google ถ่ายจอในแอปอัตโนมัติไม่ได้ ภาพเดียวที่
       เป็น "จอแอปจริง" คือรูปหน้าปกของการ์ด (jek 21/8/26: อยากเห็นจอแอป ไม่ใช่
       หน้าเว็บขายของ) การ์ดพวกนี้จึงเปิดมาเจอจอแอปใบเดียว ดีกว่าเปิดมาเจอ
       หน้าเว็บหกใบที่ไม่ใช่ตัวแอป */
    const still0 = card.querySelector(".preview, .shot");
    if (!reel && !pages.length && !still0) return;

    e.preventDefault();
    clear();
    opener = card;
    const h = card.querySelector("h3");
    title.textContent = h ? h.textContent.trim() : "ผลงาน";
    const still = card.querySelector(".preview, .shot");
    const stillSrc = still ? (still.currentSrc || still.src) : "";

    const list = [];
    if (reel) list.push({ kind: "clip", raw: reel, ver: card.dataset.reelV, card,
                          label: "คลิปเลื่อนทั้งหน้า" });
    /* การ์ดแอป (ไม่มีคลิป) เริ่มที่หน้าแรกของแอปเสมอ — รูปหน้าปกของการ์ดคือ
       หน้าแรกนั้นอยู่แล้ว แต่เดิมมันถูกใช้เป็นแค่ตัวสำรองตอนไม่มีภาพอะไรเลย
       คนที่กดเข้ามาจึงเห็นแอปเริ่มที่หน้ากลางๆ (ScoreUp เปิดมาเจอหน้า "บทเรียน"
       ไม่ใช่แดชบอร์ด — jek ทัก 21/8/26) การ์ดที่มีคลิปไม่ต้องเติม เพราะหน้า 1
       ของมันคือคลิป ซึ่งใช้รูปใบเดียวกันนี้เป็น poster อยู่แล้ว */
    /* ชั้นอิโมจิของการ์ด (.emo-layer) ต้องตามรูปมาด้วย ไม่ใช่เอาแต่ไฟล์ภาพ:
       อวตารในจอ Ijek ไม่ได้อยู่ในไฟล์ .webp — มันเป็นรูปอิโมจิ Noto ที่วางทับ
       ด้วยพิกัดเป็นเปอร์เซ็นต์ (ดู .work .emo-layer ใน styles.css) การ์ดจึงมี
       อวตาร แต่หน้าต่างที่ก๊อปแค่ <img> ไม่มี (jek ทัก 21/8/26)
       เอาเฟรมที่กำลังโชว์อยู่ (data-on="1") เพราะการ์ดสลับสองเฟรมเองตอน hover */
    /* ชั้นอิโมจิมีชุดละเฟรม (data-f="0" คือรูปนิ่ง, 1.. คือภาพใน data-pages ตามลำดับ
       — ดู showEmo() ใน js/main.js) หน้าไหนต้องได้ชั้นของเฟรมนั้น ไม่ใช่เอาเฟรม
       ที่บังเอิญเปิดอยู่ไปแปะทุกหน้า */
    const emoOf = (i) => {
      const l = card.querySelector('.emo-layer[data-f="' + i + '"]');
      return l ? l.innerHTML : "";
    };
    if (!reel && stillSrc) list.push({ kind: "img", src: stillSrc, label: "หน้าแรกของแอป",
                                       emo: emoOf(0) });
    const names = reel ? pageShots(slugOf(reel)) : pages;
    const urls = names.map((n) => (n.includes("/") ? n : shotUrl(n)));
    const okList = await Promise.all(urls.map(probe));
    urls.forEach((u, i) => {
      if (!okList[i]) return;
      list.push({ kind: "img", src: u, label: "หน้าเว็บจริง ช่วงที่ " + (i + 1), emo: reel ? "" : emoOf(i + 1) });
    });
    if (!list.length && stillSrc) list.push({ kind: "img", src: stillSrc, label: "หน้าแรกของงาน" });   /* งานเว็บที่ภาพรายช่วงยังไม่ถูกถ่าย */
    if (!list.length) return;

    items = list;
    renderStrip();
    go(0);
    dlg.showModal();
  });

  /* โหมดเต็มจอถูกถอดออก (jek 21/8/26) — ปุ่ม ⛶ กับปุ่ม F และการกดที่ภาพเพื่อ
     ขยาย หายไปทั้งชุด ไม่ใช่ซ่อนปุ่มแล้วทิ้งกลไกไว้ข้างหลัง */

  prevB.addEventListener("click", () => go(at - 1));
  nextB.addEventListener("click", () => go(at + 1));
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(at + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(at - 1); }
  });

  // ย่อ/ขยายหน้าต่างเบราว์เซอร์ = กล่องเปลี่ยนขนาด แท่งไฟต้องตามไปด้วย
  window.addEventListener("resize", () => { if (dlg.open) placeLive(false); });

  dlg.querySelector(".peek-x").addEventListener("click", () => dlg.close());
  /* คลิกนอกกรอบ = ปิด — เช็คจาก "อะไรถูกคลิก" ไม่ใช่ "คลิกที่พิกัดไหน"
     ของเดิมเทียบพิกัดเมาส์กับกรอบกล่อง ณ ตอนคลิก ซึ่งพังเวลากล่องเปลี่ยนขนาด:
     กดรูปย่อ → หน้าใหม่สูงไม่เท่าเดิม → กล่องหด → พิกัดที่เพิ่งกด (ซึ่งอยู่บนรูปย่อ)
     กลายเป็น "นอกกล่อง" ไปแล้วตอน handler ทำงาน หน้าต่างจึงปิดเองเป็นบางครั้ง
     (jek: "sometime when i click change image here, it close the window")
     <dialog> ส่ง event ที่ target เป็นตัว dialog เองเฉพาะตอนคลิกโดนฉากหลัง
     จึงเช็คแค่ e.target === dlg พอ ไม่ต้องยุ่งกับพิกัดเลย */
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => {
    clear();                              // Esc มาทางนี้เหมือนกัน
    if (opener) { opener.focus(); opener = null; }   // คืนโฟกัสไปที่การ์ดที่กด
  });
})();
