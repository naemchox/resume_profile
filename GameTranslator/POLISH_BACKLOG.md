# Gloss — Polish backlog (FROZEN until validation done)

หยุดทำ cosmetic ทั้งหมดจนกว่าเฟส validate จะเสร็จ (2026-07-28). รายการนี้ไว้กลับมาทำทีหลัง
*ถ้าเลือกเฉพาะที่ validate แล้วพบว่าสำคัญ.*

## เปิดค้าง / ยังไม่จบ
- [x] ~~**Windows: ทำให้กรอบสนิปติดการอัดจอได้**~~ **ทำแล้ว 2026-09-04** — เป็นสวิตช์ `recordableSnip` (Settings › Display · โผล่เฉพาะบน Windows)
      เปิด → ใช้ `startFrozenSnip()` ที่เขียนไว้ในโค้ดแล้วแต่ถูกปิดไว้ (ถ่ายภาพจอก่อน แล้วลากบนภาพนิ่ง) → ไม่ต้องซ่อนกรอบอีก คลิปที่อัดเห็นครบ
      ปิด (ค่าเริ่มต้น) → ท่าเดิม กรอบถูกซ่อนจากการอัด แต่ภาพเกม/วิดีโอไม่ค้างตอนลาก
      **ยังไม่ได้เทสบน Windows จริง** — บน Mac ตรวจได้แค่ว่าสวิตช์บันทึกค่าถูกและซ่อนตัวเองถูกที่
- [ ] **ตัวบอก "โหมดแปล active" ตอน ⌃⌥** — revert หมดแล้ว (crosshair/chip/cursor สี ใช้ไม่ได้เพราะ click-through).
      designer เสนอ **Option 1 = "Targeting brackets"** (4 มุมกล่อง HUD หายใจ + seed dot ตอนกด) ยังไม่ได้ build.
- [ ] **animation คำแปลยาว vs keyword** — คำสั้น pop เหมือน keyword แล้ว; คำยาวยัง slide (จำเป็นเพื่ออ่านครบ).
      ถ้าอยากให้ยาวก็ pop = ต้องยอมโดนตัด.

## ทำเสร็จแล้ว session นี้ (ค่าปรับได้ ถ้า validate แล้วรู้สึกไม่พอดี)
- park delay ก่อนคำ slide เข้า pill = `XLATE_PARK_DELAY_MS` 550ms
- marquee delay ก่อนเริ่มสไลด์ = `--marquee-delay` 0.45s
- hold time การ์ดตามความยาว = base + (units−3)×350ms, cap 3× (เฉพาะ holdSec>0)
- close timing (pill หุบหลังบาร์หาย) = 235/265ms
- card ⤢ toggle จาก History + ★ favorite บนการ์ด + ปุ่ม ⤢/★/🗑 เป็น SVG ชุดเดียว

## bug fixes session นี้ (อย่า revert)
- pipeline: split shape/pos schema (กัน "JP→เจพี/JP."), normalizeLines ไม่ยำ list, no-key short word แปลได้
- pill ไม่หุบตอนบาร์ขึ้น (bare && !cardOpen)
- box-shadow เดิม + bg ทึบ (กัน edge bleed)
