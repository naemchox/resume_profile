# PROMPT-REBUILD.md — พรอมป์สร้างเว็บ ตามสั่ง (TarmSung) ใหม่ทั้งใบ

ก๊อปทั้งบล็อกข้างล่างไปวางใน session ใหม่ (`/clear` ก่อน) แล้วสั่งได้เลย

> **จะทำเว็บให้ลูกค้ารายอื่น ห้ามใช้ไฟล์นี้** — ไฟล์นี้ผูกกับ "ครัวตามสั่ง" ทั้งใบ
> ให้ใช้ `playbook/ENGINE.md` (เครื่องยนต์ เหมือนเดิมทุกงาน) + `playbook/BRIEF-TEMPLATE.md` (ตัวตนของลูกค้ารายนั้น กรอกใหม่) แทน

---

## พรอมป์

สร้างเว็บไซต์ agency ชื่อ **ตามสั่ง (TarmSung)** — รับทำเว็บไซต์ เว็บแอป โมบายแอป ลูกค้าคือ SME ไทย
static site ล้วน: `index.html` + `css/tokens.css` + `css/styles.css` + `js/main.js` ไม่มี framework ไม่มี build step ภาษาไทยทั้งเว็บ

### 1. Concept ที่ต้องยึดทุกการตัดสินใจ

**"ครัวตามสั่ง" — order-ticket editorial** ชื่อแบรนด์แปลว่า "สั่งอะไรก็ทำให้" เว็บทั้งใบเลยเป็นครัวตามสั่ง: ลูกค้าเขียนออเดอร์ → ครัวรับ → ปรุง → เสิร์ฟ ทุก section คือหนึ่งจังหวะของครัวนั้น ไม่ใช่ธีมตกแต่ง — เป็นโครงเรื่อง หน้านี้ต้องอ่านจบแล้วรู้สึกว่า "สั่งแล้วได้ของ"

**ห้ามทำ**: SaaS template สีม่วง-ฟ้า, glassmorphism, เงาฟุ้ง blur, gradient mesh, ไอคอน 3D, stock photo คนใส่สูทจับมือ

### 2. Design tokens (3-tier: primitive → semantic → component, สีเป็น OKLCH)

คิดแบบ grayscale-first: ลำดับความสำคัญมาจาก **น้ำหนัก+ขนาด+ระยะ** สีเป็นแค่ชั้น accent

- **Charcoal** — neutral ramp อุ่น hue ~50 (เหมือนไม้/ขี้เถ้า ไม่ใช่เทาอมฟ้า) ไล่ 25→950
- **Paper** — ครีมกระดาษใบสั่ง hue 75 ใช้เป็นพื้น light theme เท่านั้น
- **Ember** — ส้มไฟ `oklch(0.65 0.20 40)` = accent **สีเดียว** ของทั้งเว็บ
- **Leaf** — เขียวใบตอง ล็อกไว้ใช้เฉพาะ success/tick/live-dot ห้ามขยายขอบเขต
- **Flame** — น้ำเงินไฟแก๊ส hue 235 ตรงข้าม ember บนวงล้อ ใช้น้อยมาก (เปลวไฟเป็นรายละเอียดในครัว ไม่ใช่สีผนัง)
- **Radius คม** ทั้งสเกล **เงาเป็น hard offset ไม่ blur** (นี่คือลายเซ็น — เหมือนหมึกพิมพ์ทับกระดาษ)
- Motion: `--ease-out: cubic-bezier(0.22,1,0.36,1)`, `--ease-spring: cubic-bezier(0.34,1.45,0.5,1)` คู่กับ `--dur-spring: 380ms` (ที่ 250ms overshoot เร็วเกินจนอ่านเป็นกระตุก ไม่ใช่สปริง)

**ฟอนต์** (Google Fonts): `Anuphan` = display, `IBM Plex Sans Thai` = body, `IBM Plex Mono` = เลขคิว/ราคา/ตั๋ว
พื้นทุก surface มี grain texture ละเอียด (tile ~160px) ให้รู้สึกเป็นกระดาษ ไม่ใช่จอ

### 3. Section (ใช้คำครัว ไม่ใช่คำ agency)

| section | ชื่อบนหน้า |
|---|---|
| Hero | ใบสั่งงาน + เลขคิวก้านตั๋ว |
| Services | **เมนู** |
| Why | จุดเด่นของครัวนี้ |
| Member | **ทีมในครัว** |
| Process | **ขั้นตอนในครัว** (4 จังหวะ: รับออเดอร์ → เตรียม → ปรุง → **เสิร์ฟ**) |
| Work | **เสิร์ฟไปแล้ว** |
| Pricing | **ใบออเดอร์ราคา** |
| FAQ | คำถามที่พบบ่อย |
| Contact | **ใบสั่งงาน** (ฟอร์ม) |
| Footer | ปิดด้วยคำว่า `SERVED` ตัวใหญ่เต็มจอ |

### 4. Signature moments (CSS ล้วน ห้ามใช้รูป)

1. **Hero: เลขคิวก้านตั๋ว** — เลขออเดอร์แบบ mono บนก้านตั๋วที่หนีบอยู่จริง
2. **Pricing: ใบสั่งฉีกได้** — ขอบ perforation (รูฉีก) + notch ซ้ายขวา ทำด้วย radial-gradient/mask
3. **Work card hover: ยกฝาชี** — ฝาครอบอาหารเปิดขึ้นเผยผลงานข้างใต้
4. **Footer: `SERVED`** — Anuphan weight 300 ขนาด `27.4vw` (กว้าง ~93% ของจอทุกความกว้าง) กล่อง `overflow:hidden` margin ลบตาม metric ของฟอนต์จริง ไม่ใช่ตามความรู้สึก เป็นภาษาอังกฤษคำเดียวของทั้งหน้า เพราะไทยที่ weight 300 ยังหนาอยู่ (สระ+วรรณยุกต์ไม่บาง)

### 5. Motion doctrine (สำคัญที่สุด — เว็บนี้แพ้ชนะที่ตรงนี้)

- **primitive แค่ 5 ตัว duration เดียว**: `reveal` (ขึ้น 20px), `--left`, `--right`, `--scale`, `--fade`, `--band` ห้ามคิดท่าเฉพาะกิจรายชิ้น ท่าเยอะ = แข่งกันเอง = ไม่มีท่าไหนเด่น
- **1100ms + `cubic-bezier(0.33,0,0.3,1)`** ทุกตัว
- IntersectionObserver ต้องใช้ **rootMargin บวก** `0px 0px 25% 0px` + threshold 0.12 → เริ่มตั้งแต่ block ยังอยู่ใต้ fold หนึ่งในสี่จอ ให้ animation **จบก่อน** ตาไปถึง (margin ลบ = ไปถึงตอนยังโปร่งครึ่งเดียว = ที่คนเรียกว่า "ไม่ smooth")
- reveal แล้ว `unobserve` ทันที ห้ามย้อนกลับ; ชิ้นที่อยู่ในจอตั้งแต่โหลดให้ `.in` ทันทีจากการวัด rect ไม่ใช่รอ observer (observer ไม่ยิงใน tab ที่ซ่อน/prerender)
- state เริ่มต้นทั้งหมด gate ใต้ `html.js` — ถ้า JS ไม่รัน หน้าต้องอ่านได้ปกติ
- **ของใหญ่ห้าม fade** — ชิ้นที่กว้างเต็ม viewport (`SERVED`, band เต็มจอ) ให้ใช้ transform/wipe แทน opacity: fade แผ่นใหญ่ = recomposite ทั้งแผ่นทับ grain ทุกเฟรม = กระตุก `SERVED` ใช้กล่อง `overflow:hidden` ของตัวเองเป็นกรอบ แล้วดัน span ขึ้นมาจากใต้ขอบ (transform ล้วน) — และมันคือท่าที่ถูกอยู่แล้ว จานต้อง**ยกขึ้นมาที่ pass**
- `prefers-reduced-motion: reduce` ต้องเคลียร์ **ทุก start state** ไม่ใช่แค่ลด duration (ชิ้นที่ค้างอยู่ที่ `clip-path: inset(0 0 100% 0)` จะไม่มีวันโผล่)

### 6. Theme toggle (light/dark)

สลับธีมด้วย **wipe เป็นวงกลมโตออกจากปุ่มที่กดจริง** ห้าม crossfade — fade สองธีมพร้อมกันจะลากทั้งคู่ผ่านเทากลางเดียวกัน (วัดแล้ว contrast ตก 16.8 → 1.1 → 16.8) ซึ่งอ่านเป็นตัวหนังสือกะพริบหาย

วาดเองบน overlay element **ห้ามใช้ View Transitions**: Safari snapshot จากบนสุดของ document ทำให้หน้าเด้งไปบนสุดตลอดช่วง wipe แล้วเด้งกลับทุกครั้งที่กด overlay ไม่มี snapshot ให้วางผิดที่ เลยเหมือนกันทุกเบราว์เซอร์ (WAAPI promise ไม่ settle ใน background tab → ต้องมี `setTimeout` เก็บกวาดด้วย)

### 7. กฎที่ห้ามข้าม

- **contrast ต้องวัด ไม่ใช่เดา** เขียนตัวเลขที่วัดได้ไว้ใน comment (เช่น ember L.58 ได้แค่ 4.24:1 กับหมึกที่พิมพ์ทับ ต้องขยับเป็น L.62 → 5.01:1)
- semantic var name ห้ามผูกกับสี (`--color-accent` ไม่ใช่ `--color-orange`) เปลี่ยน palette ต้องแตะแค่ tier 1
- ทุกตัวเลข "ตามความรู้สึก" ที่ฝืนสายตา (margin ลบของ wordmark, 27.4vw) ต้องมี comment บอกว่าวัดมาจากอะไร คนอ่านทีหลังจะได้ไม่ลบทิ้ง
- ฟอร์มต้องมี honeypot + สถานะ loading/success/error จริง
- เขียน comment ในไฟล์แบบ "ทำไม" ไม่ใช่ "อะไร" — โดยเฉพาะจุดที่เคยพังแล้วแก้

### 8. ลำดับทำงาน

1. `DESIGN-KITCHEN.md` — ล็อก token table + สเปกราย section + a11y ก่อนแตะโค้ด
2. `css/tokens.css` — primitives → semantics → components
3. `index.html` โครงทั้งหน้า → `css/styles.css` ทีละ section
4. `js/main.js` — nav, theme wipe, reveal observer, scroll spy, ฟอร์ม, order bar มือถือ
5. เทสจริงบน **Safari** ด้วย (jek ใช้ Safari) + เช็ค reduced-motion + เช็คจอกว้าง
