# Gloss — ทำอะไรต่อ (พักไว้ 2026-08-06 · วัดซ้ำ 2026-08-10)

## วัดสดบน Windows 2026-08-10
- **audit บน Windows: 20/22 pass · 0 fail · 2 skip** (2 skip = permission ของ macOS ซึ่งถูกต้อง — Windows ใช้ BitBlt + WH_KEYBOARD_LL)
  - `scripts/audit.sh` เป็น mac-only (`~/Applications/Gloss.app` + `pkill` + `open -a`) → บน Windows ต้องรันเอง:
    `electron . --remote-debugging-port=9222 --inspect=9229` แล้วดึง ws URL จาก `/json` ทั้งสองพอร์ต ส่งเข้า `node scripts/audit.js <pageWs> <mainWs>`
  - **`CC starts, runs, and stops` เคย ERROR ทุกครั้งเงียบๆ** — เช็คอ่าน `#captionBox` ที่ถูกลบไปพร้อมกล่องคำบรรยาย throw ทิ้งทั้งเช็ค แปลว่า **CC ไม่เคยถูกตรวจเลยสักรอบ** ทั้งที่ผลรวมดูเต็ม · แก้แล้ว 10/8 (อ่าน card แทนกล่อง + ย้ายจุดอ่าน hint)
  - `hover holds "card" open` fail 1 ใน 4 รอบ (หายตอน 12.7s) — โพรบเดี่ยวๆ ค้างครบ 16s, `elementFromPoint` คืน `SECTION.result` ทุก sample, settings ไม่รั่ว → **flaky ยังหา trigger ไม่เจอ** อย่าเพิ่งเชื่อว่าไม่มีอะไร
- **ยอดโหลดวันนี้: mac 10 (arm64 1 + x64 1 + `Gloss-mac.dmg` เก่า 8) · win 8 = รวม 18** (เกณฑ์ 30) — ขยับจาก 8/8 แค่ 2 เพราะยังไม่ได้โพสต์ตามข้อ 1
- ลิงก์โหลดทั้ง 3 ไฟล์ + เว็บ = 200 ทุกตัว

## เจอใหม่ 10/8 — ยังไม่ตัดสิน
- **CC ไม่บอกตัวเองว่ายังทำงานอยู่หลังสนิป** [วัดแล้ว sample ทุก 500ms 6 วิ]: toggle CC → hint = "Live · watching subtitles" ถูกต้อง · พอมีสนิปจบ hint กลับไปเป็น hint พัก ("Ctrl+Alt") **ทั้งที่ CC ยังโพลอยู่** (ปุ่มยังเป็น "◉ Stop live subtitles")
  - ตัวบอกเดียวที่เหลือคือ label ปุ่มในพาเนล ซึ่งต้องเปิดพาเนลถึงจะเห็น
  - **ยังไม่ใส่เป็นด่านตรวจใน audit** เพราะเป็นการตัดสินใจว่า hint ควรกลับมาไหม — ไม่ควรถูกล็อกเงียบๆ โดย harness

## สถานะตอนพัก
- โค้ด: `main` สะอาด push แล้ว (`8e7995a`) · audit **21/21 สามรอบติด**
- แอปที่ติดตั้งใน `~/Applications/Gloss.app` = ตัวล่าสุด (build 2026-08-06 15:34)
- ไฟล์โหลดสาธารณะ: mac DMG + win EXE ใหม่ทั้งคู่บน GitHub release `v1.0.0` (ของเก่าลบแล้ว)
- เว็บ https://gloss-6xm.pages.dev live ยิงตรงไป release
- **ยังไม่มีใครนอกจาก jek เคยเปิดใช้** ← นี่คือช่องว่างเดียวที่สำคัญตอนนี้

## ทำต่อทันทีเมื่อกลับมา (เรียงตามลำดับ ห้ามข้าม)

1. **[คุณ] โพสต์ r/macgaming** — โพสต์ก๊อปวางอยู่ท้าย `SALES-REDDIT.md`
   - อ่านกฎ self-promo ใน sidebar ก่อน (บาง sub ต้องมี karma ขั้นต่ำ)
   - ~~r/VisualNovels · r/LearnJapanese~~ **ตกไปแล้ว 2026-09-03** — แอปเป็นรุ่นอังกฤษ→ไทย กลุ่มพวกนี้อ่านญี่ปุ่นเป็นข้อความต้นทาง ไม่ใช่ลูกค้าอีกต่อไป · ช่องทางใหม่รอแผนขายฉบับไทย (ดู SALES-TH.md)
2. **[คุณ] จดคนที่ถามเรื่องราคา** — เกณฑ์ตัดสิน 7 วันอยู่ท้าย `SALES-REDDIT.md`
   (โหลด ≥30 · บอกชื่อเกมที่ลอง ≥5 · **ถามราคา ≥3**)
   - **ตัวเลขโหลดไม่ต้องนับมือ** — `gh api repos/monmon7735-coder/gloss-downloads/releases --jq '.[].assets[] | "\(.name) \(.download_count)"'`
     (บน Windows ให้รันใน bash — PowerShell แยก `--jq` เป็นสองอาร์กิวเมนต์แล้ว gh ตาย)
   - วัดล่าสุด **10/8/26: mac 10 · win 8 = 18** (8/8/26 คือ mac 8 · win 8) → ยังห่างเกณฑ์ 30 เพราะยังไม่ได้โพสต์ตามข้อ 1
3. **[ครึ่งนึงเช็คแล้ว] เทส Windows จริง** — วัดบน Win11 เครื่อง jek 8/8/26:
   - ✅ `Windows.Media.Ocr` **ทำงาน** — server ready 208ms · อ่าน 89ms · อ่านซ้ำ 6ms (engine cache ติด)
   - ✅ **ครบสาย end-to-end**: BitBlt (14-19ms ตรงกับที่คอมเมนต์เคลม ~15ms) → PNG → OCR 348ms → อ่านข้อความจากหน้าจอจริงได้
   - ✅ hook พร้อม: koffi 3.1.1 · `winhook-ll.isAvailable()` และ `winkeyhook.isAvailable()` = true ทั้งคู่
   - ❌ **ยังเหลือ: Ctrl+Alt hold-drag** — ต้องมีคนลากจริง เครื่องเดียวที่วัดไม่ได้
   - ⚠️ **ช่องโหว่ตัวจริงที่เพิ่งเจอ:** เครื่องนี้มี OCR pack แค่ `["en-US"]` — **ไม่มี ja/zh/ko** ทั้งที่ jp game คือ use case หลักของแอป บน Windows มันจะตกไป tesseract เงียบๆ (ตอนนี้มี banner บอกแล้ว) → คนที่จะเทสต้องลง pack ก่อน ไม่งั้นเทสไปก็วัดผิดตัว
4. **[คุณตัดสิน] `lean` — merge ไม่ได้ ต้องเลือกหยิบเป็นชิ้น** (ตรวจ 8/8/26)
   - **[วัดแล้ว] `lean` กับ `main` เป็นคนละ history กันสนิท** — `git merge-base main origin/lean` คืนค่าว่าง · root คนละตัว (`0d1d057` vs `69a2f67` "fork of GameTranslator-Hover") แปลว่า **merge ปกติทำไม่ได้** และ `--allow-unrelated-histories` จะ conflict แทบทุกไฟล์
   - `lean` มีแค่ 5 commit หยุดที่ 6/8/26 · **ตามหลัง `main` อยู่ 194 commit** (ไม่มีงาน offline, overlay bounds, โหมดสนิปใหม่, dwell gate ทั้งหมดของ 7-8/8)
   - ต่างกัน 63 ไฟล์ · `renderer/main/index.js` อย่างเดียว **−872 บรรทัดสุทธิ** (lean pass ตัดของออก)
   - **ค่าของ `lean` คือ "การตัดสินใจ" ไม่ใช่โค้ด** — โค้ดมันเก่ากว่า main แล้ว
   - ✅ **port มาแล้ว 1 ชิ้น:** `17ed1dd` flip นับการ์ด coach ด้วย — main มีบั๊กเดียวกันเป๊ะ (การ์ดต้อนรับของผู้ใช้ใหม่โดนตัดขอบแทนที่จะพลิกลงล่าง)
   - **เหลือให้คุณตัดสินว่าจะเอาไอเดียไหน** (ต้องเขียนใหม่บน main ทั้งหมด ไม่ใช่ก๊อป):
     - 👁 watch แทน CC (เหลือ snip gesture เดียว) ← อันนี้กระทบ audit + หน้าเว็บ
     - ปุ่ม global 4 ตัวแทน 9
     - hover dictionary อังกฤษ (`dict/enth.json` + `hover-dict.js` + `scripts/build-dict*.js`) — เปิดพจนานุกรมในเครื่อง ไม่เรียก AI
     - word breakdown แปะไปกับการ์ด (`5c77bc8`)
5. **[รอผล]** ผ่านเกณฑ์ข้อ 2 เมื่อไหร่ค่อย deploy worker + สมัคร Lemon Squeezy (ตอนนี้ยังไม่ต้อง — อย่าตั้งร้านให้ของที่ยังไม่รู้ว่ามีคนซื้อ)

## ของที่รู้แล้วแต่ยังไม่ได้แก้
- ~~**Intel Mac ไม่มีไฟล์ให้โหลด**~~ — **แก้ที่ config แล้ว 8/8/26** (`package.json` → `mac.artifactName = "Gloss-mac-${arch}.${ext}"`) ต้นเหตุคือ x64/arm64 เขียนทับชื่อ `Gloss-mac.dmg` ตัวเดียวกันแล้วชน `hdiutil detach`
  - ~~**ยังไม่ได้ build จริง**~~ — **build แล้ว 8/8/26 บนเครื่อง Mac ได้ 2 ไฟล์จริง** (`dist/Gloss-mac-arm64.dmg` + `dist/Gloss-mac-x64.dmg`) · แต่ต้องแก้ `package.json` ก่อนถึงจะ build ผ่าน: คีย์คอมเมนต์ `_artifactNameNote` ที่ใส่ไว้ใน block `build` ทำให้ electron-builder 25 ปฏิเสธทั้ง config (`dist:mac` ตายทุกครั้ง) ย้ายโน้ตออกมานอก block แล้ว (`2aff1dd`)
  - ~~**ยังไม่ได้อัปโหลดขึ้น release**~~ — **ขึ้นแล้ว** (วัด 10/8: `Gloss-mac-arm64.dmg` / `Gloss-mac-x64.dmg` / `Gloss-win.exe` = HTTP 200 ทั้งสามตัว, arm64 กับ x64 มียอดโหลดตัวละ 1)
  - ~~**ต้องแก้ลิงก์ในเว็บ**~~ — **แก้แล้ว** (`website/index.html`: ปุ่มหลัก → `Gloss-mac-arm64.dmg` :262 · ลิงก์ Intel `Gloss-mac-x64.dmg` :269 · chip :248 และ dl-note :267 พูดถึง Apple Silicon **และ** Intel แล้ว · footer :392 ก็ arm64)
  - เหลือของเก่าค้างไว้: `Gloss-mac.dmg` (ชื่อเดิม 8 โหลด) ยังอยู่บน release — ไม่มีอะไรลิงก์ไปหาแล้ว ลบทิ้งได้ถ้าอยากให้สะอาด
- 🚨 **ad-hoc sign = สิทธิ์ของผู้ใช้ตายทุกครั้งที่อัปเดต** (วัดเอง 8/8/26 — อันนี้ใหญ่กว่าที่เคยเขียนไว้มาก)
  - `codesign -d -r-` คืน `designated => cdhash H"..."` = macOS ผูกสิทธิ์ไว้กับ**แฮชของ build นั้นเป๊ะๆ** แก้โค้ดตัวเดียว build ใหม่ → ไม่ตรง → Accessibility + Screen Recording ถูกปฏิเสธ
  - **แต่ toggle ในหน้า System Settings ยังเขียวอยู่** (ลิสต์ผูกกับชื่อแอป ไม่ใช่แฮช) → ผู้ใช้เห็นว่า "อนุญาตแล้ว" แต่แอปเงียบสนิท เดาไม่ออกแน่นอนว่าต้องแก้ยังไง
  - jek เจอกับตัวเอง 8/8/26 แล้วงงจริง ทั้งที่เป็นคนเขียนแอปเอง
  - **บรรเทาแล้ว (`2aff1dd`)**: banner + dialog บอกเคสนี้ตรงๆ และมีปุ่ม "Show me the app" เด้ง Finder ชี้ `.app` ตัวที่รันอยู่ (ตอนแรกชี้ผิดเป็นไบนารีข้างในบันเดิล ซึ่งลากใส่ลิสต์ไม่ได้ — แก้แล้ว)
  - **แต่ยังไม่หายจริง** ผู้ใช้ยังต้องมานั่งลบ-เพิ่มเองทุกอัปเดต → **ตัวที่ลบทิ้งจริงคือ Developer ID ($99/ปี)** เพราะ designated requirement จะเปลี่ยนเป็น `identifier + TeamID` ซึ่งคงที่ข้าม build (แถมได้ notarize = Open Anyway หายด้วย)
  - **ตัดสินใจก่อนเก็บเงินคนแปลกหน้า** — อาการนี้ในมือลูกค้า = "อัปเดตแล้วแอปพัง" = ขอเงินคืน
- pill style มีโหมดที่ 4 แล้ว: **Tucked + Faded** (`ghostdim`) ซ่อนขอบแล้วโผล่กลับมาแบบจาง · มีด่านตรวจใน `scripts/audit.js` ของตัวเอง
- audit รันกับแอปที่ **ติดตั้งใน `~/Applications`** ไม่ใช่ซอร์ส → ต้อง `npm run pack:dev && cp -R dist/mac-arm64/Gloss.app ~/Applications/` ก่อนทุกครั้ง
