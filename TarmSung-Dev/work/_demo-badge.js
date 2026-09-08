/* =============================================================================
   _demo-badge.js — ป้าย "งานสาธิต ของ ตามสั่ง" ที่ติดอยู่กับทุกหน้าใน work/

   ทำไมมีไฟล์นี้ (23/8/26):
   พอร์ตเลิกฝังวิดีโอแล้วให้กดลิงก์เข้าเดโมจริงแทน คนนอกจึงเปิดหน้าเดโมตรงๆ ได้
   สองอย่างที่ตามมา (1) คนเข้าใจผิดว่าเป็นเว็บของธุรกิจนั้นจริงๆ (2) ก๊อปหน้าไป
   ใช้เป็นพอร์ตของตัวเองได้ ป้ายนี้แก้ทั้งสองข้อพร้อมกัน: บอกว่าเป็นงานสาธิต
   แบรนด์สมมติ และแปะชื่อเราไว้กับหน้า ใครแคปหน้าจอไปก็ติดชื่อเราไปด้วย

   ทำไมเป็นไฟล์เดียวไม่ใช่มาร์กอัปในแต่ละหน้า:
   เดโม 44 หน้าใช้ CSS คนละชุด ถ้าฝังมาร์กอัปแยกทีละหน้าจะเพี้ยนคนละแบบและ
   วันที่แก้ข้อความต้องไล่ 44 จุด — กลไกเดียวสำหรับของชนิดเดียวกัน
   ใส่ใน Shadow DOM เพื่อไม่ให้ CSS ของเดโมใบไหนมาโดนป้าย และป้ายไม่ไปโดนเดโม

   ห้ามติดไปกับเว็บลูกค้าจริง — deploy-client.mjs มีด่านดักไว้แล้ว
   ชื่อโฮสต์ข้างล่างถูกไล่แก้โดย switch-domain.mjs วันที่ย้ายโดเมน
   ========================================================================== */
(function () {
  var HOME = "https://tarmsung.pages.dev/";
  if (document.getElementById("tsg-demo-badge")) return;

  var host = document.createElement("div");
  host.id = "tsg-demo-badge";
  host.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:0;z-index:2147483000";
  var sd = host.attachShadow({ mode: "open" });

  sd.innerHTML =
    '<style>' +
    'a{position:fixed;left:12px;bottom:12px;display:inline-flex;align-items:center;gap:6px;' +
    'padding:6px 12px;border-radius:999px;text-decoration:none;white-space:nowrap;' +
    'font:500 11px/1.35 ui-sans-serif,system-ui,-apple-system,"Helvetica Neue",sans-serif;' +
    'letter-spacing:.01em;color:#fff;background:rgba(18,18,18,.72);' +
    '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
    'border:1px solid rgba(255,255,255,.18);box-shadow:0 2px 10px rgba(0,0,0,.25);' +
    'opacity:.62;transition:opacity .18s ease,transform .18s ease}' +
    'a:hover,a:focus-visible{opacity:1;transform:translateY(-1px)}' +
    'b{font-weight:700}' +
    'i{font-style:normal;opacity:.72}' +
    /* จอแคบ: ย่อเหลือชื่อแบรนด์อย่างเดียว ไม่ให้ป้ายกินความกว้างหน้าจอ */
    '@media (max-width:520px){a{left:8px;bottom:8px;padding:5px 10px;font-size:10px}' +
    '.long{display:none}}' +
    '@media print{a{display:none}}' +
    '</style>' +
    '<a href="' + HOME + '" target="_blank" rel="noopener"' +
    ' aria-label="หน้านี้เป็นงานสาธิต แบรนด์สมมติ ทำโดย ตามสั่ง (เปิดเว็บตามสั่ง)">' +
    '<span class="long"><i>งานสาธิต · แบรนด์สมมติ ·</i> </span>ทำเว็บโดย <b>ตามสั่ง</b> ↗' +
    '</a>';

  (document.body || document.documentElement).appendChild(host);
})();
