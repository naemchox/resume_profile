# functions/ — ยังไม่มีอะไรของคลับในนี้

`_legacy-coins.index.js.bak` = Cloud Functions ของ **โมเดลเก่า** (เหรียญ / ลูกบอลพรีเมียม /
rewards / `stripeWebhook` เครดิตเหรียญ) เปลี่ยนชื่อจาก `index.js` เมื่อ 17 ส.ค. 2026 เพื่อกัน
`firebase deploy --only functions` เผลอเปิดทาง Stripe→เหรียญกลับมาในคลับที่เก็บเงินด้วยมือ
(`firebase.json` ก็ยังไม่มีบล็อก `functions` อยู่แล้ว = ไม่ถูก deploy ตามปกติ)

**Function ของคลับยังต้องเขียนใหม่ทั้งหมด** (ต้องขึ้น Blaze ก่อน) — สิ่งที่ต้องมี ตามลำดับผลกระทบ:

1. **`tcs`/`tier` + turn-up scoring** — client เขียน field เหล่านี้ไม่ได้ตาม `firestore.rules`
   (RANKING-SPEC.md §3) รวมกฎ "คู่เดิมนับครั้งเดียว/30 วัน" และการตัดสินระยะจาก `confALoc/confBLoc`
2. **ผูก `confA`/`confB` กับเวลา server** — ตอนนี้ client ส่ง `Date.now()` เอง แปลว่า 2 บัญชีที่
   สมรู้กันเขียนเลขใกล้กันเองได้ (กฎ 15 นาทีตรวจแค่ระยะห่างของสองเลข ไม่ใช่เวลาจริง)
3. **บังคับโควตาคำเชิญ** — ตัวนับอยู่บน `users/{uid}.inviteWeek` ซึ่งเจ้าตัวแก้ได้
4. **TTL จริง** — 24 ชม. ทุกวันนี้เป็นการซ่อนฝั่ง client เท่านั้น ต้องมี `expireAt` + TTL policy
   ถึงจะลบข้อความ/พิกัดออกจากฐานจริง
5. **ย้าย `application` / `inviteWeek` ออกจาก `users`** — สมาชิกอ่านของกันได้อยู่
   (rules จำกัดได้แค่ระดับ document ไม่ใช่ระดับ field)
