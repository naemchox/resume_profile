# SUMMIT

A polished landing page for "SUMMIT," a fictional premium insulated water bottle brand themed around the outdoors ("Built for the Wild"). It is a static, single-file marketing site built with pure HTML and CSS, presenting a full e-commerce homepage layout: hero slideshow, product grid, brand story, feature highlights, collections, reviews, and newsletter signup.

## Features
- Auto-playing CSS-only hero slideshow (4 slides) with crossfade, Ken Burns zoom, and an animated progress-bar indicator
- Sticky navigation bar with animated underline hover states and a cart badge
- Category and product grids with hover image zoom and color swatches
- Split-screen brand story section
- Feature/benefit grid with inline SVG icons
- Two-column featured collections and a three-column customer reviews section
- Newsletter signup form with a no-JS submit confirmation (inline handler)
- Fully responsive layout (desktop, tablet, mobile breakpoints)
- Respects `prefers-reduced-motion` for accessibility

## Tech Stack
- HTML5
- CSS3 (CSS custom properties, grid, flexbox, keyframe animations, media queries)
- Inline SVG icons
- Google Fonts (Oswald, Inter) via CDN
- No JavaScript frameworks (only a tiny inline form handler)

## Files
- `index.html` — the complete landing page (markup, styles and the motion layer)
- `slideshow1-4.webp` — hero slideshow images
- `_contrast.mjs` + `_contrast.py` — วัด contrast จากพิกเซลที่เรนเดอร์จริง (ENGINE §4)
  รันจากรากโปรเจกต์: `node work/summit/_contrast.mjs /tmp/ct && python3 work/summit/_contrast.py /tmp/ct`

## How to Run
Open `index.html` in a modern web browser. The local `slideshow1-4.png` files must remain in the same folder for the hero to display. An internet connection is recommended: Google Fonts and several product/lifestyle photos load from external CDNs (Google Fonts, Unsplash), and the page falls back to system fonts and placeholder backgrounds when offline.


## รอบ "แก้เว็บจืด" — 2026-08-20

ใช้สูตรเดียวกับ zamil / Velvet Leaf / The Bed (`playbook/PROMPT-JUED.md`) 4 ชั้น
stack ไม่เปลี่ยน: ยังเป็น `index.html` ไฟล์เดียว ไม่มี npm ไม่มี build ไม่มี JS lib จาก CDN
motion เขียนเองด้วย CSS + IntersectionObserver + rAF ทั้งหมด

### 1. เร่งของเดิม (audit ก่อนเพิ่ม)

| # | จุด | เดิม | ใหม่ | ทำไมถึงพัง |
|---|---|---|---|---|
| 1 | **hero ตอนเปิด reduced motion** | `animation-duration: 0.01ms !important` ทับทุกอย่าง | หยุด slideshow แล้วค้างสไลด์แรก | rule กวาดทั้งหน้าทำให้ `heroFade` กระโดดไปเฟรม 100% ทันที ซึ่งคือ `opacity: 0` ทั้งสี่สไลด์ — คนที่เปิด reduce motion เห็น hero เป็นกล่องดำล้วน |
| 2 | ตัวบอกสไลด์ | `36x2px` ที่ alpha `.30` | `40x3px` ที่ `.55` | เส้น 2px ที่ 30% บนท้องฟ้าสว่าง = ไม่มีอยู่จริงบนจอ ทั้งที่มันเป็นตัวเดียวที่บอกว่า hero เลื่อนได้ |
| 3 | `will-change` | ค้างบน 4 สไลด์ + 4 รูป ตลอดกาล | ปลดทิ้ง ยกขึ้น compositor เฉพาะตอนวิ่ง | layer ถาวร 8 ชั้นตั้งแต่โหลดหน้า |
| 4 | **contrast บนรูปถ่าย** | eyebrow/ย่อหน้าของ hero กับ banner อ่านไม่ออกบนสไลด์ท้องฟ้าสว่าง | scrim ฝั่งข้อความของ hero + เร่ง scrim ของ banner + เร่ง gradient ของการ์ดหมวดหมู่ | วัดจากพิกเซลจริงหลังแก้: hero eyebrow **5.69:1** · hero ย่อหน้า **11.59:1** · banner eyebrow **8.02:1** · banner ย่อหน้า **12.35:1** · "SHOP NOW" **11.31:1** |
| 5 | grain | ไม่มีเลย | fractal noise ทับทั้งหน้าที่ `.038` | ENGINE §1 — พื้นสีเรียบอ่านเป็นจอ ไม่ใช่วัสดุ |

### 2. มาร์กที่ใช้ใหญ่

**สันเขาซ้อนชั้น 3 ชั้น** — ตัวเดียวกันทั้งเว็บ ต่างแค่สีกับที่วาง:
hero (ขาว `.22`) และ story (ทราย `.18`) ทั้งคู่วาดตัวเองด้วย `stroke-dashoffset` ตอน section มาถึง
ตั้ง alpha ที่ `.18-.22` ไม่ใช่ `.04` ตามบทเรียนของ The Bed: ทองที่ 4% บนพื้นเกือบดำคือความสว่างขึ้น ~1%

เป็น **ภาษาเดียวกับเส้นคั่นใต้หัวข้อ** (`.ridge`) แค่ขยายใหญ่ → ทั้งเว็บพูดภาษาเดียว

#### ทางที่เดินผิดมาก่อน (เก็บไว้เตือน)

1. **เส้นชั้นความสูง (contour) วาดมือ** — วงปิดสมมาตรซ้าย-ขวาปลายบนแหลม อ่านเป็น "หยดน้ำซ้อนกัน"
2. **contour ที่เจนด้วยสูตร** — วงปิดรูปร่างไม่สม่ำเสมอ ถูกต้องตามหลักแผนที่ทุกอย่าง
   แต่เจ้าของงานบอกตรงๆ ว่า *"เหมือนลายนิ้วมือมากกว่าภูเขา"* — ซึ่งจริง เพราะ contour map
   หน้าตามันเป็นวงซ้อนวง **ถูกตามหลักการ ≠ สื่อสารได้** จะให้อ่านเป็นภูเขาต้องใช้เส้นสันเขา
3. **viewBox ฮาร์ดโค้ด** — ตั้ง `0 0 600 340` ไว้ก่อนรู้ว่า path กว้างแค่ไหน วงนอกโตเกินกรอบ
   SVG ตัดทิ้งตามค่าเริ่มต้น เห็นเป็นเส้นขาดกลางอากาศ
4. **ปล่อยล้นขอบ** — ตอนเป็นวงปิดล้นขอบได้ (ลายมุมกระดาษ) แต่พอเป็นเทือกเขาที่ตั้งบนพื้น
   การล้นขอบตัดฐานเขาทิ้ง เหลือแต่ยอดลอย = อ่านเป็นเส้นขาดอีก
   → ตอนนี้ **ทุกที่อยู่ในกรอบครบเหมือนกันหมด** และทุกสันลาดลงจบที่พื้นของตัวเอง

#### สัดส่วนกับตำแหน่ง

ต้องอิงกับอะไรสักอย่าง ไม่ใช่ลอยห่างขอบจอเท่าๆ กัน (แบบนั้นอ่านเป็นสติกเกอร์แปะ)

| ที่ | ค่า | เหตุผล |
|---|---|---|
| hero จอใหญ่ | `right: max(24px, calc((100% - 1400px)/2 + 24px))` · `bottom: 5%` · กว้าง 42vw (สูงสุด 560px) | ขอบขวาตรงกับขอบในของ `.container` เป๊ะ · ที่ 15% มันลอยขึ้นไปคร่อมตัวสินค้าในรูป ต้องนั่งต่ำติดพื้นภาพ · ถ่วงกับตัวหนังสือฝั่งซ้ายเป็นสองคอลัมน์ |
| hero มือถือ | `right: 16px` · `top: 7%` · กว้าง 72vw | ครึ่งล่างเป็นหัวเรื่อง+ปุ่มเต็มความกว้าง วางล่างจะไปนอนใต้ปุ่ม |
| story | `left: 26px` · `bottom: 26px` · กว้าง 72% | มุมซ้ายล่างคือที่ว่างเดียวของแผงดำ ไม่ชนปุ่ม "READ THE STORY" |

### 3. motion ที่เป็นของแบรนด์นี้เท่านั้น

- **หัวข้อขึ้นทีละคำ** จากใต้ mask — ช่องว่างระหว่างคำยังเป็น text node จริง ลากคลุมแล้ว copy ออกมาได้เป็นประโยคปกติ
- **เส้นคั่นใต้หัวข้อเป็นสันเขาที่วาดตัวเอง** ด้วย SVG `stroke-dashoffset` ไม่ใช่ `border-bottom` (รูปทรงมาจากคำว่า summit)
- **น้ำไต่ขึ้น** — กล่องไอคอนของ feature และการ์ดในแถบตัวเลข ถูกเติมจากล่างขึ้นบนเหมือนของเหลวในขวด
  (ไอคอนสลับเป็นขาวตอนน้ำเต็ม: ทรายบนส้มเหลือ 2.02:1 ส่วนขาวบนส้มวัดได้ 4.34:1)

### 4. ตัวเลขที่วิ่งมา

แถบใต้ hero: **36** ชม.เย็น · **18** ชม.ร้อน · **40** รอบทดสอบ · **14,000+** รีวิว
ทุกตัวมีอยู่ในเนื้อหาหน้านี้อยู่แล้ว (ย่อหน้า hero / Our Story / หัวข้อ Reviews) — ไม่มีตัวไหนคิดขึ้นใหม่

### กติกาที่บังคับไว้ในโค้ด

- reveal ยิงด้วย IntersectionObserver ทั้งหมด ไม่ผูกกับ scroll event · `rootMargin` เป็นบวก · `unobserve` หลังเผย
- มี fallback วัด `getBoundingClientRect()` รอบเดียวตอนโหลด — observer ไม่ยิงในแท็บที่ซ่อนอยู่/หน้า prerender
- start state ทุกตัวอยู่ใน CSS และ gate ใต้ `html.js` — **ปิด JS แล้วหน้าอ่านได้ครบ ไม่มีจอขาว**
- `prefers-reduced-motion` ปิดได้จริงทั้งฝั่ง CSS และ JS (JS ตั้งค่าปลายทางเอง ตัวเลขขึ้นเต็มทันที)
- อนิเมตแค่ transform/opacity · ค่าที่ script คำนวณส่งเป็น px

### ตรวจแล้ว

`node playbook/verify.mjs work/summit` → **ตก 0** · เทสจริงด้วย Playwright: เปิด/ปิด JS, reduced-motion,
และที่ 360px (ไม่มี horizontal scroll, ไม่มี console error)

## รอบ audit — 2026-08-20 (รอบสอง)

ถอด **สไลด์ใบที่ 4** ออกจาก hero: เหลือ 3 ใบ รอบ 21 วิ ใบละ 7 วิ เท่าเดิม
(ทุก % ใน keyframes คูณ 4/3 — ถ้าย่อรอบเฉยๆ ช่วงจางกับช่วงค้างจะหดตามไปด้วย)
`slideshow4.webp` ยังอยู่ในโฟลเดอร์แต่ไม่มีอะไรอ้างถึงแล้ว

### บั๊กที่เจอและแก้แล้ว

| # | อาการ | สาเหตุ | หลักฐาน |
|---|---|---|---|
| 1 | **ป้ายเลขตะกร้าลอยอยู่นอกปุ่ม** | `.cart-count` เป็น `position:absolute` แต่ไม่ได้ตั้ง `top`/`right` เลย มันจึงเกาะ "ตำแหน่ง static" ของตัวเอง ซึ่งอยู่*ถัดจาก*ปุ่ม 40px ไม่ใช่บนปุ่ม แล้ว `translate(12px,-10px)` ก็ดันออกไปอีก | วัดทุกความกว้าง 360-1920: กรอบป้ายไม่ทับกรอบปุ่มเลยสักครั้ง · **ที่ 1280px ดันจนหน้าเลื่อนแนวนอนได้ (scrollWidth 1286 > 1280)** · แก้แล้วทับปุ่มครบทุกความกว้าง ไม่มี overflow |
| 2 | **ปุ่มแฮมเบอร์เกอร์กดแล้วไม่มีอะไรเกิดขึ้น** | มีแต่ปุ่ม ไม่เคยมีแผงเมนู — ที่ ≤1024px จึงไปหา section ไหนไม่ได้เลย | วัดแล้ว `display` ของ `.nav-links` = `none` ทั้งก่อนและหลังกด · ตอนนี้เปิดเป็นแผง กดลิงก์แล้วปิดเอง กด Esc ปิด ลากจอกว้างเกิน 1024 ปิดเอง |
| 3 | หัวข้อที่คลิกจากเมนูไปจอดใต้แถบเมนู | ไม่มี `scroll-margin-top` ทั้งที่ nav เป็น sticky สูง 72px | `#bottles` ไปหยุดที่ `top: 0` (ใต้ nav ทั้งแถบ) · ตอนนี้หยุดที่ 72 |

### รอบเก็บงาน (ข้อ 5-10 ของรอบ audit)

**รูป — เลิกลิงก์สด เก็บไฟล์เอง**
เดิมลิงก์ตรงไป `images.unsplash.com` 12 ใบ แล้ววันหนึ่ง ID สองใบก็ชี้ไปคนละรูปเอง:
หมวด **Tumblers กลายเป็นโซฟาในห้องนั่งเล่น** และ **Accessories กลายเป็นรถสปอร์ตสีแดง**
โดยไม่มีใครแตะโค้ดเลย — รูปที่เราไม่ได้ถือไฟล์เอง = หน้าเว็บที่พังได้เองตอนไหนก็ได้
ตอนนี้โหลดมาเก็บครบทุกใบเป็น webp ในโฟลเดอร์นี้ (`bash work/summit/_fetch-img.sh` รันซ้ำได้)
สองใบที่ผิดเรื่องเปลี่ยนเป็น: กล้อง+กระติกโอลีฟ+แผนที่ (Tumblers) · คาราไบเนอร์เทา-ส้มที่เข้ากับสี
accent ของแบรนด์ (Accessories) — เลือกจาก 8 ตัวเลือกที่เรนเดอร์เทียบกันในกรอบการ์ดจริงก่อน
`banner` ย่อจาก 2000px เหลือ 1600px (ใบเดียว 444K หนักกว่ารูปที่เหลือทั้งหน้ารวมกัน)

**อื่นๆ ในรอบนี้**

| ข้อ | เดิม | ตอนนี้ |
|---|---|---|
| CLS | รูป 16/16 ใบไม่มี `width`/`height` | ใส่ครบทุกใบตามขนาดไฟล์จริง |
| โหลด | ทุกใบโหลดพร้อมกันตั้งแต่วินาทีแรก | สไลด์ hero 3 ใบ `eager` (ใบแรก `fetchpriority=high` เพราะเป็น LCP) ที่เหลือ `lazy` |
| SEO/แชร์ | ไม่มี description / og: / favicon / JSON-LD เลย | ครบ · favicon เป็น data-URI จะได้ยังเป็นไฟล์เดียว |
| a11y | ไม่มี `<main>` ไม่มี skip link · 8 section ไม่มีชื่อ | มีครบ · Tab แรกเจอ "Skip to products" |
| เป้ากด | ปุ่มไอคอน 40x40 · `link-arrow` สูง 27px | 44x44 ทั้งคู่ (`link-arrow` ใช้ padding+margin ลบ ตัวหนังสือไม่ขยับ) |
| ลิงก์ตาย | `href="#"` 41 จาก 48 | เหลือ 33 — การ์ดหมวด/คอลเลกชัน/ปุ่ม banner ชี้ไปกริดสินค้าจริง ที่เหลือคือหน้าที่เดโมนี้ไม่มี **จงใจปล่อยเป็น `#`** ดัดให้วนกลับที่เดิมยิ่งหลอกคนกด |
| ปิด JS ที่มือถือ | ปุ่มแฮมเบอร์เกอร์โชว์แต่กดไม่ได้ | ซ่อนปุ่ม แล้วเรียงลิงก์ให้เลย ยังไปครบทุก section |
| test hook | ไม่มี | `?reduce=1` บังคับโหมดลดการเคลื่อนไหวได้จาก headless (หยุด hero ในฝั่ง JS จะได้ไม่ต้องก๊อปกฎ CSS ไว้สองที่) |

**เหลือไว้ตั้งใจ:** ลิงก์ท้ายเว็บสูง 16px (ต่ำกว่า 44) — ระยะห่างระหว่างบรรทัด 12px
ทำให้ผ่านเกณฑ์ AA ข้อ target-spacing อยู่แล้ว การดันให้สูง 44 จะทำให้ท้ายเว็บยาวเป็นสองเท่า

**ตรวจซ้ำหลังเปลี่ยนรูป:** contrast วัดจากพิกเซลจริงใหม่ทั้ง 9 จุด ผ่านหมด
(`node work/summit/_contrast.mjs /tmp/ct && python3 work/summit/_contrast.py /tmp/ct`)

### ยังค้าง — ต้องตัดสินใจก่อนเอาไปโชว์ลูกค้า

1. **การ์ด SUMMIT ยังไม่มีในกริดผลงาน** ของ `index.html` และ `reference.html` (มีแต่ใน hero reel กับบนปก)

