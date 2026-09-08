# DESIGN-KITCHEN.md — ตามสั่ง Redesign: "ครัวตามสั่ง"
Art direction spec, ล็อกตายตัว. Branch: `redesign-kitchen`.
Concept: Thai made-to-order kitchen / order-ticket editorial. เท่ระดับ studio ไม่ใช่ร้านข้าวแกงการ์ตูน.

## 0. หลักการที่ล็อก
- Palette: ถ่านดำ + ส้มไฟวอก (accent เดียว) + ครีมกระดาษ + เขียวใบตอง (สีที่ 2, ใช้เฉพาะ success/tick — ห้ามขยาย)
- ห้าม: emoji อาหาร, การ์ตูน, stock photo, gradient blob, glassmorphism, violet/cyan เดิม
- Motif: ใบสั่ง/ใบเสร็จ (perforation, notch, tear), เมนูบอร์ด, ตัวเลขคิว mono, ตราปั๊ม, เส้นขอบคม 1–2px แทนเงาฟุ้ง
- คงชื่อ semantic variable เดิมทั้งหมดใน tokens.css (ไม่ rename) — เปลี่ยนแค่ "ค่า" ที่ map ทับ
- Dark theme ต้องยังทำงาน 100% (AA, focus ring, reduced-motion, touch 44px) — ห้ามถอยหลัง

---

## 1. TOKEN TABLE (ล็อกแล้ว)

### 1.1 Primitives ใหม่ — Charcoal (แทน violet ramp)
เนื้อสีอุ่นเล็กน้อย (hue ~50 = ไม้/ถ่าน ไม่ใช่เทาเย็นแบบเดิม)

| token | OKLCH | ใช้แทน |
|---|---|---|
| `--charcoal-25` | `oklch(0.985 0.004 50)` | `--neutral-25` |
| `--charcoal-50` | `oklch(0.97 0.006 50)` | `--neutral-50` |
| `--charcoal-100` | `oklch(0.94 0.008 50)` | `--neutral-100` |
| `--charcoal-200` | `oklch(0.89 0.010 50)` | `--neutral-200` |
| `--charcoal-300` | `oklch(0.80 0.012 50)` | `--neutral-300` |
| `--charcoal-400` | `oklch(0.68 0.014 50)` | `--neutral-400` |
| `--charcoal-500` | `oklch(0.56 0.015 50)` | `--neutral-500` |
| `--charcoal-600` | `oklch(0.46 0.016 50)` | `--neutral-600` |
| `--charcoal-700` | `oklch(0.36 0.017 50)` | `--neutral-700` |
| `--charcoal-800` | `oklch(0.27 0.017 50)` | `--neutral-800` |
| `--charcoal-850` | `oklch(0.22 0.016 50)` | `--neutral-850` |
| `--charcoal-900` | `oklch(0.18 0.016 50)` | `--neutral-900` |
| `--charcoal-950` | `oklch(0.14 0.015 50)` | `--neutral-950` |

### 1.2 Paper cream (พื้นกระดาษ, light bg only)
| token | OKLCH |
|---|---|
| `--paper-0` | `oklch(1 0 0)` (ticket white, surface การ์ด) |
| `--paper-25` | `oklch(0.985 0.010 75)` (ค่า default bg) |
| `--paper-50` | `oklch(0.97 0.014 75)` |
| `--paper-100` | `oklch(0.94 0.018 75)` |

### 1.3 Ember — ส้มไฟวอก (accent เดียว, แทน violet+cyan)
| token | OKLCH |
|---|---|
| `--ember-50` | `oklch(0.96 0.03 45)` |
| `--ember-100` | `oklch(0.92 0.06 45)` |
| `--ember-200` | `oklch(0.85 0.10 45)` |
| `--ember-300` | `oklch(0.78 0.14 44)` |
| `--ember-400` | `oklch(0.72 0.18 42)` |
| `--ember-500` | `oklch(0.65 0.20 40)` — base accent |
| `--ember-600` | `oklch(0.58 0.20 36)` |
| `--ember-700` | `oklch(0.50 0.19 32)` |
| `--ember-800` | `oklch(0.42 0.16 30)` |
| `--ember-900` | `oklch(0.34 0.13 28)` |

### 1.4 Leaf — เขียวใบตอง (สีที่ 2, จำกัดใช้เฉพาะ success/tick/live-dot)
| token | OKLCH |
|---|---|
| `--leaf-50` | `oklch(0.95 0.04 148)` |
| `--leaf-500` | `oklch(0.62 0.15 148)` |
| `--leaf-600` | `oklch(0.52 0.14 148)` |

Status อื่น (warning/error/info) **คงค่าเดิมทุกตัว** ไม่แตะ

### 1.5 Semantic mapping — LIGHT
| var (คงชื่อเดิม) | ค่าใหม่ |
|---|---|
| `--color-bg` | `var(--paper-25)` |
| `--color-bg-subtle` | `var(--paper-50)` |
| `--color-surface` | `var(--paper-0)` |
| `--color-surface-2` | `var(--paper-100)` |
| `--color-border` | `oklch(0.20 0.02 50 / 0.14)` |
| `--color-border-strong` | `var(--charcoal-800)` |
| `--color-text` | `var(--charcoal-900)` |
| `--color-text-muted` | `var(--charcoal-600)` |
| `--color-text-subtle` | `oklch(0.50 0.016 50)` |
| `--color-text-on-brand` | `var(--charcoal-950)` |
| `--color-brand` | `var(--ember-600)` |
| `--color-brand-hover` | `var(--ember-700)` |
| `--color-brand-soft` | `var(--ember-100)` |
| `--color-brand-text` | `var(--ember-700)` |
| `--color-accent` | `var(--leaf-500)` |
| `--color-focus` | `var(--ember-600)` |
| `--color-success` | `var(--leaf-500)` |
| `--color-success-bg` | `var(--leaf-50)` |
| `--gradient-brand` | **ลบทิ้ง** — ไม่ใช้ gradient |
| `--gradient-hero` | **ลบทิ้ง** — แทนด้วย texture กระดาษเบาๆ (noise SVG inline) |

### 1.6 Semantic mapping — DARK (`[data-theme="dark"]`)
| var | ค่าใหม่ |
|---|---|
| `--color-bg` | `var(--charcoal-950)` |
| `--color-bg-subtle` | `var(--charcoal-900)` |
| `--color-surface` | `var(--charcoal-900)` |
| `--color-surface-2` | `var(--charcoal-850)` |
| `--color-border` | `oklch(1 0 0 / 0.10)` |
| `--color-border-strong` | `var(--charcoal-700)` |
| `--color-text` | `var(--paper-50)` |
| `--color-text-muted` | `var(--charcoal-400)` |
| `--color-text-subtle` | `oklch(0.66 0.015 50)` |
| `--color-text-on-brand` | `var(--charcoal-950)` |
| `--color-brand` | `var(--ember-400)` |
| `--color-brand-hover` | `var(--ember-300)` |
| `--color-brand-soft` | `oklch(0.30 0.10 40)` |
| `--color-brand-text` | `var(--ember-300)` |
| `--color-accent` | `var(--leaf-500)` |
| `--color-focus` | `var(--ember-400)` |
| `--color-success` | `oklch(0.72 0.15 150)` |

### 1.7 Font stack (ใหม่ — ยืนยันมีจริงบน Google Fonts แล้ว)
| var | ค่า |
|---|---|
| `--font-display` | `"Anuphan", "Noto Sans Thai", system-ui, sans-serif` |
| `--font-body` | `"IBM Plex Sans Thai", "Anuphan", system-ui, sans-serif` |
| `--font-mono` **(ใหม่)** | `"IBM Plex Mono", ui-monospace, monospace` — เฉพาะตัวเลข (คิว, ราคา, เลขใบสั่ง); ไม่รองรับไทย |

`<link>` ที่ต้องใช้แทนของเดิมใน `index.html`:
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600;700&display=swap" />
```

### 1.8 Radius — คมกว่าเดิมทั้งสเกล
| var | เดิม | ใหม่ |
|---|---|---|
| `--radius-sm` | 0.375rem | `0.1875rem` |
| `--radius-md` | 0.625rem | `0.3125rem` |
| `--radius-lg` | 1rem | `0.5rem` |
| `--radius-xl` | 1.5rem | `0.75rem` |
| `--radius-full` | 999px | คงเดิม (เฉพาะ pill/stamp/queue-badge) |
| `--button-radius` | md | `var(--radius-sm)` |
| `--card-radius` | lg | `var(--radius-md)` |

### 1.9 เงา — hard offset แทน blur ฟุ้ง (signature)
```css
--shadow-sm: 1px 1px 0 0 oklch(0.20 0.02 50 / 0.20);
--shadow-md: 2px 2px 0 0 oklch(0.20 0.02 50 / 0.22);
--shadow-lg: 4px 4px 0 0 oklch(0.20 0.02 50 / 0.24);
--shadow-xl: 6px 6px 0 0 oklch(0.20 0.02 50 / 0.26);
```
Dark:
```css
--shadow-sm: 1px 1px 0 0 oklch(0 0 0 / 0.5);
--shadow-md: 2px 2px 0 0 oklch(0 0 0 / 0.55);
--shadow-lg: 4px 4px 0 0 oklch(0 0 0 / 0.6);
--shadow-xl: 6px 6px 0 0 oklch(0 0 0 / 0.65), 0 0 24px oklch(0.65 0.20 40 / 0.12);
```
hard shadow = "กระดาษซ้อนกัน" ไม่ใช่ SaaS glow. glow ส้มใน dark ใช้เฉพาะปุ่ม primary hover เท่านั้น ห้ามใส่ทุกการ์ด

### 1.10 Border
- default: `1px solid var(--color-border)`
- เน้น (การ์ด featured, ticket separator, focus): `2px solid var(--color-border-strong)` หรือ `var(--color-brand)`

### 1.11 Motion (คง token เดิมทุกค่า)
- ปุ่ม active: `transform: translateY(1px) scale(0.98)` ("กดตราปั๊ม") แทน translateY(-1px) เดิม
- การ์ด hover: `translateY(-3px)` + hard shadow ขยับตาม (ไม่เพิ่ม blur)
- ทั้งหมดอยู่ใน `@media (prefers-reduced-motion: no-preference)` ตามเดิม

---

## 2. TYPE SCALE + การจับคู่ฟอนต์
`--text-*` **คงตัวเลขเดิมทั้งหมด** ไม่แตะ

| ระดับ | ฟอนต์ | น้ำหนัก | letter-spacing |
|---|---|---|---|
| Display (h1, h2, ราคา) | Anuphan | 700 | **0em บนไทย** |
| Eyebrow / label อังกฤษล้วน | Anuphan หรือ IBM Plex Mono | 600 | `+0.06em` uppercase |
| Body | IBM Plex Sans Thai | 400/500 | 0em |
| ตัวเลข/ราคา/เลขคิว/เลขใบสั่ง | IBM Plex Mono | 600 | 0em |
| ปุ่ม | IBM Plex Sans Thai | 600 | 0em |

**Fix บังคับ**: ลบ `letter-spacing: -0.02em` ออกจาก `.hero h1` ใน styles.css — tracking ติดลบทำให้สระ/วรรณยุกต์ไทยเกยกัน (บั๊ก a11y เดิม)

---

## 3. สเปกทีละ SECTION

### 3.0 Header / Nav
- `.brand-mark`: จากวงกลม → สี่เหลี่ยม `--radius-sm` พื้น `--ember-600` ตัว "ต" สีเข้ม = ตราปั๊มยาง
- `.nav-links a:hover`: เอา background soft ออก ใช้ `border-bottom: 2px dashed var(--color-brand)`
- Header CTA: **คงคำเดิม "ปรึกษาฟรี"** (friction ต่ำสุด, เห็นตลอดการสกอลล์)

### 3.1 Hero
- Layout `.hero-grid` คงเดิม
- `.pill-badge`: `"เปิดครัว • ตอบออเดอร์ภายใน 24 ชม."`
- H1: **คงข้อความเดิม** — ลบแค่ letter-spacing ติดลบ
- Lead: `"ทีมพัฒนามืออาชีพ ปรุงเว็บไซต์ เว็บแอป และโมบายแอป ที่รวดเร็ว สวยงาม และใช้งานง่าย ดูแลคุณตั้งแต่สั่งออเดอร์แรก จนเสิร์ฟระบบที่ใช้งานจริง"`
- Primary CTA: `"สั่งงานกับเรา"`
- Secondary CTA: `"ดูเมนูผลงาน"`
- `.hero-note`: คงเดิม
- `.mock-hero`: เอา `--gradient-brand` ออก → พื้นทึบ `--color-brand` + เส้น diagonal 1px ทับเบาๆ
- `.hero-float` → เพิ่ม `.hero-float--ticket`: ขอบหยักครึ่งวงกลม + border-dashed ด้านล่าง + ไอคอนในกรอบสี่เหลี่ยมคม
- เพิ่ม `.queue-stub` (signature #1, ดู 4.1)
- **ขอบบนของกรอบ reel = เส้นใต้ header (2026-08-20)** — `--reel-top` วัดจาก JS (= `header.offsetHeight` ลบตำแหน่งจริงของคอลัมน์ ใช้ `offsetTop` ไม่ใช่ rect เพราะ `.reveal` ยังกดกล่องต่ำอยู่ 20px) ค่าเป็น**ลบ** ดึงกรอบขึ้นไปชนใต้ header แล้ว `.reel` บวกความสูงคืนเท่ากัน → ขอบล่าง/rail/fold อยู่ที่เดิม; การ์ดถูกตัดบนเส้นเดียวกับ header = อ่านว่า "การ์ดวิ่งลอดหลังแถบ" (เฉพาะ ≥1025px)
- `.queue-stub` ย้ายจาก `top:-18px` → `top:0` เพราะเส้นบนกลายเป็นใต้ header แล้ว 18px นั้นไปอยู่ใต้แถบ sticky (คำว่า "คิวที่" หายไป เหลือแต่เลข)
- **ป้ายทั้ง 3 ใบมี motion แล้ว (2026-08-20)** — stub พิมพ์ตัวเองลงบนขอบ (`queuePrint`) + เลขคิวเดินทีละใบแบบ split-flap (`queueTick`, ticker ใน `js/main.js` เดิน 001→008 ทุก 4.2 วิ) · ตั๋ว 2 ใบเข้าจากฝั่งตัวเอง (`ticketIn-right` / `ticketIn-left`) แล้วหายใจเบาๆ (`ticketBob` 5px, คนละคาบ/คนละดีเลย์) · ทั้งหมดอยู่ใน `prefers-reduced-motion: no-preference` และ gate ด้วย `.hero-visual.reveal.in` · ticker หยุดเองเมื่อแท็บอยู่หลังฉากหรือเลื่อนพ้น hero

### 3.2 Services → "เมนู"
- eyebrow: `"เมนูของเรา"` / h2: `"เมนูครบ จบในครัวเดียว"`
- p: `"ตั้งแต่หน้าเว็บแรก ไปจนถึงระบบหลังบ้านและแอปมือถือ — เราออกแบบ พัฒนา และดูแลให้ครบทุกเมนู"`
- `.feature-icon` → class ใหม่ `.menu-chit`: กรอบสี่เหลี่ยม clip-path มุมขวาบนเฉียง 8px (มุมพับใบเมนู), border 1px `--color-border-strong`, พื้น `--color-surface`, `::before` เป็นเลข mono "01"–"06" จางๆ มุมซ้ายบน
- card copy อื่นคงเดิม

### 3.3 Why
- eyebrow: `"ทำไมต้องสั่งกับเรา"` / h2 คงเดิม
- `.tick` → `.stamp-tick`: สี่เหลี่ยมคมมุม, border 2px `--leaf-600`, check stroke 3px = QC stamp
- copy 6 ข้อคงเดิม, inline CTA คงเดิม

### 3.4 Member → "ทีมในครัว"
- h2: **"Member" → "ทีมในครัว"** (อังกฤษล้วนโดดจากทั้งหน้า = บั๊กเดิม)
- **ห้ามเปลี่ยน job title เป็นคำครัว** — CEO/Technician แบก credibility
- `.member-avatar` คงรูปแบบ เปลี่ยนแค่ค่าสี

### 3.5 Process → "ขั้นตอนในครัว"
- eyebrow: `"ขั้นตอนในครัว"` / h2 คงเดิม
- เพิ่ม `.step-kitchen-tag` เหนือ h3 เดิม (ไม่แทนที่): 01 รับออเดอร์ / 02 เตรียมวัตถุดิบ / 03 ลงมือทำ / 04 เสิร์ฟ
  mono, uppercase, `--color-brand-text`, `--text-xs`, tracking +0.06em
- `.step-num`: ใช้ `--font-mono`

### 3.6 Work → "เสิร์ฟไปแล้ว"
- eyebrow: `"เสิร์ฟไปแล้ว"` / h2: `"ผลงานที่เสิร์ฟจริง"` / p คงเดิม
- `.tag` หมวดหมู่ + `.live-badge` "กดใช้งานได้จริง": **คงคำเดิม** (scannable + trust signal)
- hover = signature #3 (4.3)

### 3.7 Pricing → "ใบออเดอร์ราคา"
- eyebrow: `"ใบออเดอร์ราคา"` / h2 คงเดิม
- **ชื่อแพ็กเกจคงเดิมทั้งหมด** (ต้อง scan-compare เร็ว)
- `.ribbon` "ยอดนิยม": คงคำ ทำเป็นตราปั๊มเอียง
- ปุ่ม 2 แพ็กแรก: `"สั่งแพ็กเกจนี้"`; แพ็ก 3: คงเดิม `"ขอใบเสนอราคา"`
- เพิ่ม `.ticket-head` + `.ticket-no` (`TS-01`…) บนสุดของทุกการ์ด + perforation (4.2)

### 3.8 FAQ
- eyebrow/h2 คงเดิมทั้งคู่
- แต่ละ `<details>`: `::before` เลข mono `Q01`… (counter-increment), border-top เป็น dashed

### 3.9 Contact → "ใบสั่งงาน"
- `.cta-band h2`: `"พร้อมสั่งงานกับเราแล้วหรือยัง?"`; primary: `"กรอกใบสั่งงาน"`; secondary คงเดิม
- `.contact-info h2` "ติดต่อเรา" คงเดิม
- `.form-card`: เพิ่มก่อน `.form-status`
  ```html
  <div class="ticket-head ticket-head--form">
    <span>ใบสั่งงานใหม่</span><span class="ticket-no">No. ______</span>
  </div>
  ```
  ตามด้วย perforation
- **field label คงเดิมทั้งหมด ห้ามธีม**
- ปุ่ม submit: `"ส่งใบสั่งงาน"`

### 3.10 Footer
- tagline ท้าย: `"...ดูแลคุณตั้งแต่สั่งจนเสิร์ฟเสร็จ"`
- ที่เหลือคงเดิมทั้งหมด (wayfinding)

---

## 4. 3 SIGNATURE MOMENTS (CSS ล้วน)

### 4.1 Hero: เลขคิวก้านตั๋ว

> โค้ดข้างล่างเป็นสเปกตั้งต้น — ของจริงใน `css/styles.css` ไม่มี mask หยัก (มันกิน border บน WebKit และทำให้ box-shadow หาย) และมี motion เพิ่มตาม §3.1

```html
<div class="queue-stub" aria-hidden="true">
  <span class="queue-label">คิวที่</span>
  <span class="queue-num">001</span>
</div>
```
```css
.queue-stub {
  position: absolute; top: -18px; left: 24px;
  background: var(--color-surface); border: 1.5px solid var(--color-border-strong);
  padding: var(--space-2) var(--space-4); box-shadow: var(--shadow-md);
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  mask-image:
    radial-gradient(circle 6px at 50% 100%, transparent 99%, #000 100%),
    linear-gradient(#000, #000);
  mask-composite: intersect;
}
.queue-label { font-family: var(--font-body); font-size: var(--text-xs); color: var(--color-text-muted); }
.queue-num { font-family: var(--font-mono); font-weight: 700; font-size: var(--text-2xl); color: var(--color-brand-text); }
```

### 4.2 Pricing: ใบสั่งฉีกได้ (perforation + notch)
```css
.ticket-head { display: flex; justify-content: space-between; align-items: center;
  padding-bottom: var(--space-3); margin-bottom: var(--space-4); }
.ticket-no { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.06em; color: var(--color-text-subtle); }

.card.price::before {
  content: ""; display: block; height: 1px; margin: 0 -1px var(--space-4);
  background-image: repeating-linear-gradient(90deg, var(--color-border-strong) 0 6px, transparent 6px 12px);
  position: relative;
}
.card.price::after {
  content: ""; position: absolute; top: calc(var(--space-8) + 2px); left: -8px; right: -8px; height: 16px;
  background:
    radial-gradient(circle 8px at 0 50%, transparent 99%, var(--color-bg) 100%) left / 16px 16px no-repeat,
    radial-gradient(circle 8px at 100% 50%, transparent 99%, var(--color-bg) 100%) right / 16px 16px no-repeat;
  pointer-events: none;
}
.card.price.featured .ribbon { transform: translateX(-50%) rotate(-4deg); border: 1.5px solid var(--color-text-on-brand); }
```
notch เจาะด้วย `var(--color-bg)` → ต้อง match พื้นหลัง section pricing จริง (ตรวจก่อน implement)

### 4.3 Work card hover: ยกฝาชี
```css
.work .thumb .preview {
  filter: saturate(0.35) brightness(0.9) blur(1px);
  transition: filter var(--dur-slow) var(--ease-out);
}
.work:hover .thumb .preview,
.work:focus-visible .thumb .preview { filter: saturate(1) brightness(1) blur(0); }
.work .thumb .tag { transition: transform var(--dur-mid) var(--ease-out); transform-origin: top center; }
.work:hover .thumb .tag,
.work:focus-visible .thumb .tag { transform: translateY(-6px) rotate(-2deg); }
@media (prefers-reduced-motion: reduce) {
  .work .thumb .preview { filter: none; transition: none; }
  .work .thumb .tag { transition: none; }
}
```

---

## 5. ACCESSIBILITY CHECK
ค่าด้านล่างเป็น **ค่าประมาณจาก OKLCH-L** (calibrate กับตัวเลขที่ทีมเดิมวัดไว้ในคอมเมนต์ tokens.css) — **ต้อง verify ซ้ำด้วย contrast checker จริงก่อน ship**

### Light
| คู่สี | ใช้ที่ | ≈ ratio | เกณฑ์ |
|---|---|---|---|
| text (charcoal-900) / bg (paper-25) | body | ~15:1 | AAA |
| text-muted (charcoal-600) / bg | p, card body | ~7.5:1 | AA |
| text-subtle (L.50) / surface (paper-0) | hint | ~5.0:1 | AA |
| brand-text (ember-700) / bg | ลิงก์ส้ม | ~4.7:1 | **ตึงสุด — วัดจริง; ไม่ผ่านให้ลด L อีก 0.03–0.05** |
| text-on-brand (charcoal-950) / brand (ember-600) | ปุ่ม primary | ~7:1 | ผ่าน |
| border-strong (charcoal-800) / bg | เส้นขอบ | ~10:1 | ผ่าน (UI ต้อง 3:1) |

### Dark
| คู่สี | ใช้ที่ | ≈ ratio | เกณฑ์ |
|---|---|---|---|
| text (paper-50) / bg (charcoal-950) | body | ~15:1 | AAA |
| text-muted (charcoal-400) / bg | p | ~9:1 | ผ่าน |
| text-subtle (L.66) / surface-2 | hint | ~5.5:1 | AA |
| brand-text (ember-300) / bg | ลิงก์ | ~9:1 | ผ่าน |
| text-on-brand / brand (ember-400) | ปุ่ม | ~8:1 | ผ่าน |
| border (10% white) / bg | ขอบ decorative | ~1.3:1 | ขอบที่ต้องเห็นชัดใช้ border-strong |

**วัดจริงแล้ว 21/8/2026 บนเว็บจริง (WebKit, ทั้ง light และ dark) — ผ่านทั้งหมด**
วิธีวัด: อ่าน computed style จากหน้าจริง แล้วให้เบราว์เซอร์แปลงสีผ่าน canvas 1x1 ก่อนคำนวณ
(สีในระบบนี้เป็น `oklch()` การแยกตัวเลขด้วย regex ได้ค่ามั่ว — วัดผิดมาแล้วสองรอบ ได้ 1.0:1 ทุกช่อง)

| จุด | light | dark | เกณฑ์ |
|---|---|---|---|
| ตัวหนังสือปกติ | 7.13:1 | 6.51:1 | 4.5 |
| ตัวหนังสือรอง (.per, ticket-no) | 6.02:1 | 6.03:1 | 4.5 |
| `--color-brand-text` (Q01, ลิงก์ส้ม) | 6.29–6.58:1 | 8.92–9.47:1 | 4.5 |
| FREE ในการ์ด START HERE | 6.04:1 | 8.29:1 | 3 |
| eyebrow | 5.75:1 | 6.4:1 | 4.5 |
| ตัวอักษรบนปุ่มส้ม | 5.00:1 | 7.53:1 | 4.5 |
| **focus ring (outline 2px)** | **3.66:1** | **7.10:1** | 3 |

ค่าที่ตารางข้างบนเดาไว้ว่า "~4.7:1 ตึงสุด" วัดจริงได้ 6.29–6.58:1 — ไม่ต้องลด L
เหลือข้อเดียวที่ยังไม่ได้ทำ: รัน axe/Lighthouse เต็มชุดทั้ง 2 theme (เกินขอบเขตการวัดด้วยมือนี้)
