/* =============================================================================
   perf-probe.js — เครื่องวัดความหนืดของหน้า ที่เปิดได้จาก URL

   ทำไมมีไฟล์นี้ (22/8/26)
   jek รายงานว่า "ชี้การ์ด Homecraft แล้วทั้งหน้าสะดุด เลื่อนไม่ลื่น" — ผมวัดใน
   WebKit แบบ headless ทั้งบนหน้านี้และแบบคลิปเดี่ยวๆ ที่ retina 2000px แล้ว
   ไม่ซ้ำเลย: 60fps, dropped frames 0, currentTime เดินครบ และลองปิดทีละชั้น
   (ซูมคลิป · filter บนภาพนิ่ง · สเกลการ์ด · มุมโค้ง · backdrop-filter หัวเว็บ)
   ผลออกมาสวิงจนอ่านอะไรไม่ได้ — headless WebKit ไม่ใช่ Safari จริง คนละคอมโพสิเตอร์
   ไม่มีจอจริง ไม่มีแรงกดดันจาก GPU

   กฎของบ้านนี้คือ "เดาพลาดสองครั้งให้หยุดเดา แล้ววัดสถานะจริง ณ วินาทีที่เกิด"
   วินาทีที่เกิดอยู่บน Safari ของ jek ไม่ใช่ที่นี่ ไฟล์นี้จึงเอาเครื่องวัดไปวางตรงนั้น

   วิธีใช้
     เปิด  <หน้าไหนก็ได้>?perf     แล้วจะมีตัวเลขมุมซ้ายล่าง
     ชี้การ์ด Homecraft ค้างไว้ แล้วเลื่อนหน้าไปมา อ่าน "หนืด" (เฟรมที่เกิน 20ms
     ใน 5 วินาทีล่าสุด) — ยิ่งเยอะยิ่งสะดุด
     กดเลข 0-6 สลับว่าจะปิดชั้นไหน แล้วดูว่าเลขตกลงตอนกดตัวไหน
       0 ของเดิมทั้งหมด
       1 ไม่ซูมคลิปตอนชี้
       2 ไม่ใส่ filter บนภาพนิ่ง
       3 ไม่สเกลการ์ด
       4 ไม่ blur หัวเว็บ (backdrop-filter)
       5 ไม่มีมุมโค้ง/ไม่ clip บนการ์ด
       6 สลับไปใช้คลิปฉบับเล็ก H.264 960x600 (สูตรที่ awwwards/godly ใช้จริง)
     ตัวไหนทำให้ "หนืด" ตกลงชัดเจน = ตัวนั้นคือต้นเหตุ บอกเลขมา แล้วผมแก้ตัวนั้น

   ไม่ใส่ ?perf = ไฟล์นี้ออกทันที ไม่ผูกอีเวนต์ ไม่วาดอะไร ไม่มีต้นทุนกับคนดูจริง
   ========================================================================== */
(() => {
  if (!/(^|[?&])perf(=|&|$)/.test(location.search)) return;

  /* ชั้นที่สงสัย — เขียนเป็น CSS ล้วน เพราะทุกตัวคือกฎใน styles.css ไม่ใช่ตรรกะใน JS
     ลำดับตรงกับเลขที่กด และข้อความคือสิ่งที่จะรายงานกลับมา */
  const VARIANTS = [
    { key: '0', name: 'ของเดิมทั้งหมด', css: '' },
    { key: '1', name: 'ไม่ซูมคลิปตอนชี้',
      css: '.work:hover .thumb .shot-reel,.work:focus-visible .thumb .shot-reel,.reel .slide .shot-reel{transform:none!important;transition:opacity var(--dur-mid) var(--ease-out)!important}' },
    { key: '2', name: 'ไม่มี filter บนภาพนิ่ง',
      css: '.work .preview,.reel .shot{filter:none!important}' },
    { key: '3', name: 'ไม่สเกลการ์ด',
      css: '.card.work:hover,.card.work:focus-visible{transform:none!important;scale:none!important}.work:hover .thumb .preview{transform:none!important}' },
    { key: '4', name: 'ไม่ blur หัวเว็บ',
      css: '.site-header{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:var(--color-bg)!important}' },
    { key: '5', name: 'ไม่มีมุมโค้ง/clip การ์ด',
      css: '.card.work,.work .thumb,.reel .slide{border-radius:0!important}.reel{clip-path:none!important}' },
    /* ตัวนี้ไม่ใช่ CSS — สลับ "ไฟล์คลิป" ที่การ์ดดึง ไปเป็นฉบับเล็ก H.264 (960x600)
       ซึ่งเป็นสูตรที่ awwwards/godly ใช้จริง (MP4 ล้วน ขนาดพอดีกล่อง)
       ถ้ากด 6 แล้วหายหน่วง = ต้นเหตุคือไฟล์/โคเดก แล้วผมจะเปลี่ยนให้ถาวรทั้งเว็บ
       ถ้ากดแล้วเหมือนเดิม = ตัดเรื่องไฟล์ทิ้งได้ ไปหาที่ชั้นอื่นแทน */
    { key: '6', name: 'ใช้คลิปฉบับเล็ก H.264 (960x600)', css: '', small: true },
  ];

  const style = document.createElement('style');
  document.head.appendChild(style);
  let active = 0;
  const setVariant = (i) => {
    active = i;
    style.textContent = VARIANTS[i].css;
    /* ธงนี้ js/reel-video.js อ่านตอนประกอบที่อยู่ไฟล์ — ต้องทิ้ง <video> ที่สร้างไว้แล้ว
       ด้วย ไม่งั้นการ์ดที่เคยชี้ไปแล้วจะยังเล่นไฟล์ชุดเดิมค้างอยู่ แล้วอ่านผลผิด */
    const want = !!VARIANTS[i].small;
    if (want !== !!window.__reelSmall) {
      window.__reelSmall = want;
      document.querySelectorAll('.card.work video, .reel video').forEach((v) => {
        try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* ถูกถอดไปแล้ว */ }
        v.remove();
      });
      document.querySelectorAll('[data-reel-on]').forEach((c) => { c.dataset.reelOn = '0'; });
    }
  };

  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText =
    'position:fixed;left:12px;bottom:12px;z-index:99999;pointer-events:none;' +
    'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;' +
    'background:rgba(10,8,6,.86);color:#fff;padding:8px 10px;border-radius:8px;' +
    'border:1px solid rgba(255,255,255,.18)';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box));
  if (document.body) document.body.appendChild(box);

  /* หน้าต่าง 5 วินาที: เก็บเวลาต่อเฟรมแล้วทิ้งของเก่า — เลขที่อ่านจึงเป็น "ตอนนี้"
     ไม่ใช่ค่าเฉลี่ยตั้งแต่เปิดหน้า ซึ่งจะกลบช่วงที่สะดุดจนมองไม่เห็น */
  const WINDOW = 5000;
  const marks = [];
  let last = performance.now();
  let worst = 0, painted = 0;

  const tick = (now) => {
    const dt = now - last; last = now;
    marks.push([now, dt]);
    while (marks.length && now - marks[0][0] > WINDOW) marks.shift();
    if (dt > worst) worst = dt;

    if (now - painted > 250) {
      painted = now;
      const span = marks.length ? (now - marks[0][0]) / 1000 : 0;
      const fps = span > 0.4 ? (marks.length / span).toFixed(0) : '–';
      const janky = marks.filter((m) => m[1] > 20).length;
      const vids = document.querySelectorAll('video');
      const playing = [...vids].filter((v) => !v.paused);
      const v = playing[0];
      const q = v && v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
      box.textContent =
        'fps ' + fps + '   หนืด(>20ms/5วิ) ' + janky + '   แย่สุด ' + worst.toFixed(0) + 'ms\n' +
        'คลิปเล่นอยู่ ' + playing.length + ' · ค้างใน DOM ' + vids.length +
        (v ? '  ' + v.currentSrc.split('/').pop().split('?')[0] : '') + '\n' +
        (q ? 'เฟรมคลิปตก ' + q.droppedVideoFrames + '/' + q.totalVideoFrames + '\n' : '') +
        'กด 0-6 · ตอนนี้ [' + VARIANTS[active].key + '] ' + VARIANTS[active].name;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  addEventListener('keydown', (e) => {
    const i = VARIANTS.findIndex((v) => v.key === e.key);
    if (i < 0) return;
    setVariant(i);
    worst = 0; marks.length = 0;     // เริ่มนับใหม่ ไม่งั้นค่าของชั้นก่อนหน้าตามมาหลอกตา
  });

  // เปิดค้างที่ชั้นไหนก็ได้จาก URL: ?perf=3
  const preset = /[?&]perf=(\d)/.exec(location.search);
  setVariant(preset && VARIANTS[+preset[1]] ? +preset[1] : 0);
})();
