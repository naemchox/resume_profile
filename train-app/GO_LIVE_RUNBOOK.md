# Ijek — Go-Live Runbook (ไฟล์เดียวจบ — source of truth)

อัปเดต 2026-06-21. **ไฟล์นี้คือ list เดียวที่ต้องดู** — `LEMONSQUEEZY_TODO.md`, `LAUNCH_TODO.md`, `PROMPTPAY.md` ถูกรวมมาที่นี่แล้ว (เก่า/ขัดกัน อย่าใช้)

ข้อมูลโปรเจกต์:
- **App URL:** `https://withered-block-4669.monmon7735.workers.dev/train.html`
- **Supabase ref:** `lkwrzbuyyqgkibpeixmw`
- **การเก็บเงิน:** Lemon Squeezy (Merchant of Record, ตัดบัตรอัตโนมัติ, ไม่ต้องมีทะเบียนธุรกิจ). PromptPay/Opn **เลิกใช้แล้ว** — ⚠️ แต่ยังมี **dead code ค้างใน train.html** (`PromptPayModal` ~บรรทัด 12024 เรียก `ppCreateCharge`/`ppChargeStatus` ที่ไม่มี definition แล้ว + `pp.*` i18n) ตอนนี้ path เข้าไม่ถึงเลยไม่ crash แต่ควรลบ (ดู PART 4 ข้อ 17)
- 📋 **ตรวจครบ/ถูกต้อง 2026-06-25** (scribe+critic audit) — เติมของหล่นแล้ว: revoke PAT, schema.sql, push.sql, QA เต็ม, ลบ dead code
- ⭐ = ต้องล็อกอินบัญชีพี่เอง ผมทำแทนไม่ได้ | 🤖 = ผมทำให้ได้
- ทุก `npx supabase` / `npx wrangler` รันใน PowerShell ที่ `C:\Users\PC\train-app`

---

## ✅ เสร็จแล้ว (อย่าทำซ้ำ)
- แอป live + อีเมล/รหัสผ่าน + **Google login** ใช้งานได้จริง
- SQL รันแล้ว: `supabase_daily_scores_rls.sql`, `supabase_redeem.sql`, `ls_subscription_id` column
- Lemon Squeezy: store `ijekapp.lemonsqueezy.com` (THB) + 2 products (Pro ฿99/เดือน, Yearly ฿890/ปี) + checkout เชื่อมในแอป
- `ls-webhook` deploy แล้ว + สร้าง webhook ใน LS (Test mode) + ตั้ง signing secret แล้ว
- **2026-06-25: rebuild dist + redeploy แอป+legal ขึ้น live** (`npx wrangler deploy`, worker `withered-block-4669`, version `8a27739c`) → privacy/terms เวอร์ชัน LemonSqueezy อยู่บน production แล้ว (ข้อ 13 ปิด)
  - ⏸️ พักไว้ก่อน — จะทำ feature อื่นให้เสร็จแล้วค่อยกลับมา launch ทีเดียว. งานที่เหลือทั้งหมดติดที่ console/บัญชี (SQL, Auth, LS verify, payout, secret ใหม่) ตาม PART 1-3 ด้านล่าง

**🆕 แก้โค้ดรอบ 2026-06-28 (อยู่ใน local — ยังไม่ deploy, ต้อง `node build-deploy.js`→`npx wrangler deploy`):**
- Security: jek-ai sanitize `highlight` (#7), `p_upd` policy `with check` ใน `supabase_schema.sql` (#8)
- Checkout non-TH guard: `lsCheckoutUrl` คืน '' ถ้า region ไม่มี variant + "coming soon" (กันชาร์จผิดราคา)
- Dead code cleanup: ยุบ ternary weeklyRecap/cloudSync (free เสมอ), ลบ preview branch ใน JekPlanWeekSheet
- **Storage hole FIXED**: `supabase_user_images.sql` เพิ่ม `file_size_limit=2MB` + `allowed_mime_types` ฝั่ง server (client cap บายพาสได้) — ✅ user รัน SQL แล้ว 6/28
- SW cache → v1066 (จาก build-deploy)
- ผ่าน QC (functional/JSX) + scale/cost audit (margin ~63%, ceiling = edge-fn 500K/mo ~549 คน)

**🆕 แก้โค้ดรอบ 2026-06-28 (รอบ 2 — AI create+schedule, อยู่ใน local ยังไม่ deploy):**
- ฟีเจอร์ใหม่: หน้า 🪄 "JEK จัดสัปดาห์" เพิ่มช่อง **"พิมพ์เป้าหมาย"** → AI สร้างหลาย task พร้อมกัน + จัดลงตารางในจอเดียว (create+schedule เชื่อมกัน)
- Server: edge fn `jek-ai` เพิ่ม branch **`kind:'plan-multi'`** (ย่อหน้า → หลาย activity, คืน freq/goalMode/target) — **🔴 ต้อง `npx supabase functions deploy jek-ai` ใหม่** (ไม่งั้น plan-multi คืน 500)
- Client: `aiPlanMulti()` + `createFromText` orchestration ใน ScheduleScreen + ช่อง textarea ใน `JekPlanWeekSheet`; i18n `planweek.create*`+`plan.newName` (EN+TH)
- cost ต่อการใช้ = plan-multi(1) + week-plan(4) = **5 credit** จาก cap pro 8/วัน
- SW cache → **v1067**
- ⏳ ยังเทสจริงไม่ได้จนกว่าตั้ง ANTHROPIC_API_KEY (PART 0) — เทสพร้อม week-plan ทีเดียว

---

## PART 0 — 🔴🔴 BLOCKER ที่เจอ 2026-06-26 (live test) — AI พังทั้งหมดตอนนี้
> เทสจริงบน production พบว่า edge fn `jek-ai` คืน **500 `server not configured`** = ขาด env **`ANTHROPIC_API_KEY`** → JEK chat / check-in / week-plan **พังทุกตัว** (ยิง function เดียวกัน). ข้อความ check-in ที่เห็นบน Main = cache เก่า ไม่ใช่ call สด. ⚠️ ถ้าเปิดขายตอนนี้ คนจ่าย Pro แล้ว AI ใช้ไม่ได้เลย

0a. ⭐ **ตั้ง Anthropic key:** เอา key จาก console.anthropic.com (ต้องมีเครดิต) → `npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` → AI ใช้ได้ทันที ไม่ต้อง redeploy
0b. 🤖 **เทสซ้ำหลังตั้ง key** — ยิง jek-ai ดูว่าได้ 200 + chat/check-in/week-plan ตอบจริง (ตอนนี้บัญชี monmon7735 เป็น temp-Pro อยู่ พร้อมเทส; entitlement หมดอายุเอง 1 วัน หรือ revert ด้วย SQL ใน chat)
0c. ⭐ **เช็คราคา Lemon Squeezy ให้ตรงแอป (verified ราคาแอป 2026-06-28, train.html:1265-67):**
   - แอปโชว์ (TH): regular **Pro ฿79/mo · ฿490/yr**, founders **฿59/mo · ฿359/yr**, **Pro+ ฿149/mo · ฿990/yr**
   - LS products สร้างไว้แค่ **Pro ฿99/mo + Yearly ฿890/ปี** (2 ตัว) → **ไม่ตรงทั้งคู่** + ขาด founders/Pro+ variants
   - ผลถ้าไม่แก้: คนเห็น ฿79/฿59 ในแอป แต่ LS ชาร์จ ฿99 → ผิดราคา/chargeback. **ต้องตัดสินใจราคาจริงก่อน** แล้วทำให้ LS variant = ตัวเลขที่แอปโชว์ (รวม West/Mid ที่ตอนนี้ guard "coming soon" ไว้แล้ว)
   - หมายเหตุ: West/Mid checkout ถูก guard ไม่ให้ redirect ไปสินค้า TH แล้ว (train.html:1054 `lsCheckoutUrl` คืน '' + ขึ้น "coming soon") — เปิดต่างประเทศต้องสร้าง LS variant ของ region นั้นก่อน

---

## PART 1 — Deploy ของที่เพิ่งแก้ 2026-06-21 (ทำก่อนเลย) ⭐
> session ล่าสุดแก้ AI cap (กัน Pro+ ขาดทุนจาก spam week-plan) + ซ่อม week-plan ที่เคยพัง — ต้อง re-deploy

1. **รัน SQL ก่อน** (ลำดับสำคัญ — ผิดลำดับ AI ล่มชั่วคราว): Supabase → SQL Editor → เปิด `supabase_billing.sql` → paste → Run
   *(ไฟล์นี้ drop `bump_ai_usage` ตัวเก่าแล้วสร้างตัวใหม่ที่รับ credit-weight)*
2. **แล้วค่อย deploy:** `npx supabase functions deploy jek-ai`
3. **เทสต์ week-plan:** เปิดแอป (บัญชี Pro) → Week view → กด 🪄 → ดูว่า ghost blocks ขึ้นบนตาราง ✅ *(ของนี้เคยพังเงียบ ต้องยืนยัน)*

---

## PART 2 — เทสต์ก่อนเปิดขาย (Test mode ไม่เสียเงินจริง) ⭐
4. **เปิด Storage bucket รูป** (ถ้ายังไม่มี): Supabase → Storage → ดูว่ามี bucket `user-images` ไหม → ไม่มี → SQL Editor → รัน `supabase_user_images.sql`
   *(ถ้าไม่รัน รูป avatar/GIF จะไม่ sync ข้ามเครื่อง — text sync ยังทำงาน)*
4b. **🔴 ยืนยัน/รัน `supabase_schema.sql`** — โค้ดส่ง `.eq('status','accepted')` (friend requests). ถ้า column `friendships.status` ยังไม่มี **leaderboard จะ error**. ไปที่ SQL Editor ลองรัน (idempotent) ถ้าไม่แน่ใจว่าเคยรัน
4c. **(ถ้าจะใช้ Web Push) รัน `supabase_push.sql`** — edge fn `push-reminders` deploy แล้ว แต่ถ้า SQL นี้ไม่รัน background push ไม่ทำงาน (foreground reminder ยังทำงาน)
5. **Auth Site URL:** Supabase → Authentication → URL Configuration → **Site URL** เปลี่ยนจาก `localhost:8000` → `https://withered-block-4669.monmon7735.workers.dev` → Save
6. **Confirm-email = ON:** Supabase → Authentication → ตั้งให้ยืนยันอีเมลก่อนใช้ (กันสแปม)
7. **เทสต์จ่ายเงิน (Test mode):** LS เปิด Test mode → แอป → Plan & billing → Subscribe → บัตร `4242 4242 4242 4242` (วันหมดอายุอนาคต, CVC อะไรก็ได้) → จ่าย → กลับมาแอป Pro เด้งเอง ~10 วิ
   - ไม่ขึ้น → ดู LS Webhook logs + Supabase function logs (`ls-webhook`)
8. **เทสต์ trial + downgrade:** กด "ทดลอง 7 วัน" → ได้ Pro → ลอง Pro→Free → ข้อมูลต้องไม่หาย
8b. **QA เต็มรูปแบบก่อนเปิดขาย** (ดู checklist ละเอียดใน `DEPLOY.md`): multiplayer flow ครบวง (sign-in → friend code → push score → leaderboard → 1v1 race) · reminders (Pro) · achievements/streaks · ME-drag · landing สวยทั้ง mobile+desktop · manifest/icons ไม่มี warning · Lighthouse PWA ผ่าน

---

## PART 3 — เปิดขายจริง (go live) ⭐
9. **🔴 เปลี่ยน signing secret ใหม่** (ตัวเก่า `ijekwhsec9f3k2j8x5m7q1zw4` หลุดในแชท/รูปแล้ว):
   - สร้าง secret ใหม่ใน LS webhook settings → คัดลอก
   - `npx supabase secrets set LEMONSQUEEZY_SIGNING_SECRET=ตัวใหม่`
9b. **🔴 Revoke Supabase PAT `sbp_…` ที่หลุดในแชท** (security — คนละตัวกับ signing secret): Supabase → Account → Access Tokens → ลบ token เก่า. ถ้า CLI ยังต้องใช้ค่อยสร้างใหม่
10. **Upgrade Supabase Pro $25/mo** — ก่อนรับ paying user คนแรก (free ไม่มี SLA + pause 7 วันถ้าว่าง)
11. **LS go-live:** LS → Settings → Identity verification → business type = **Individual** (บุคคลธรรมดา ไม่ต้องใช้เลขทะเบียน) → กรอก + บัตรประชาชน → Activate
12. **เชื่อม Payout** (PayPal/Wise) ให้เรียบร้อย
13. ~~PDPA legal~~ **✅ เสร็จสมบูรณ์ 6/25** (privacy+terms เป็นเวอร์ชัน LemonSqueezy + redeploy ขึ้น live แล้ว version `8a27739c`)
14. **ปิด Test mode → ขายจริงได้** 🚀

---

## PART 4 — ก่อนทำการตลาด (ไม่ใช่ blocker)
15. **Custom domain** (เช่น ijek.app ~฿350/ปี) → ผูก Cloudflare Worker → Custom Domains (ใช้บน Workers free ได้ ไม่ต้องจ่าย $5/mo) → อัปเดต URL ใน `desktop/main.js` + Supabase Redirect URLs + Google redirect ให้ตรงโดเมนใหม่
16. **(cleanup) ลบ edge fn เก่า:** `npx supabase functions delete promptpay-charge charge-status opn-webhook` *(เหลือ fn ค้างบน server)*
17. **⚠️ แก้ความเข้าใจผิด (verified 2026-06-28): `PromptPayModal` ไม่ใช่ dead code — อย่าลบทั้งก้อน!** มันคือ modal ของ flow **trial** ที่ยังใช้จริง (`m==='trial'` → `ppStartTrial()` ซึ่งมี definition). render ที่ train.html:12636 ผ่านปุ่ม `startTrial`. ที่ตายจริง = แค่ branch `ppCreateCharge`/`ppChargeStatus` (undefined) ข้างใน ซึ่ง `m` เป็น `'trial'` เสมอ (`startPay`/`startTrial` ไม่เคย set mode='pay'; `trialused`→ปุ่ม Subscribe เรียก `onSubscribe`/LS ไม่สลับ mode) → **เข้าไม่ถึง = ไม่ crash**. การลบ PromptPayModal = trial พัง. cleanup ที่ปลอดภัยคือผ่าตัดเฉพาะ branch pp* ออก (เสี่ยง/ได้น้อย) — แนะนำ**ปล่อยไว้** harmless. `pp.*` i18n ยังถูกใช้โดย modal นี้ (trial copy) ก็อย่าลบ

---

## หมายเหตุ
- redeem code (โค้ดแจก/ของขวัญ) พร้อมใช้ — สร้างด้วย mint block ใน `supabase_redeem.sql`
- variant UUID เหมือนกันทั้ง test/live (test mode เป็นแค่ toggle)
- ค่า fee Lemon Squeezy ~5%+$0.50/ดีล → รายเดือน ฿99 เสีย fee ~22%, รายปี ฿890 เสีย ~7% → **ดันแพ็กรายปี**
