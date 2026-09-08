# House and Home — Decision Record (Step 0)

Built with `Skill/Website/website_building.md`. Every "you pick" below was decided by me.
Source content: `BRIEF.md` (scraped from their Facebook page 2026-08-07).

---

## DESIGN

| | |
|---|---|
| **Site type** | Marketing one-pager (lead generation) |
| **Success metric** | Phone calls + LINE adds → free site survey booked |
| **Primary action** | โทร 097-936-4619 / แอด LINE |
| **Audience** | Thai homeowners & small commercial owners, 30–55, mobile-first, medium tech comfort |
| **Language** | Thai primary (Latin for brand/numerals only) |
| **Style recipe** | Luxury/serif × technical-blueprint hybrid — navy, gold, hairline linework |
| **Base hues** | `--h: 85` warm neutral · `--hg: 95` brand gold · `--hb: 76` gold darkened · `--hc: 250` brand navy — **all four sampled from the customer's own artwork** (`hh-src-01.jpg`), see "The palette" below |
| **Mode** | **White / light-only by default.** Dark is opt-in via the toggle — there is deliberately **no** `prefers-color-scheme: dark` branch, so a visitor whose OS is in dark mode still gets the white site. |
| **Fonts** | Display **Noto Serif Thai** · Body **IBM Plex Sans Thai** (1.75 line-height) |
| **Motion** | Expressive (skill default) |
| **Density** | Airy/spacious |
| **Stack** | **Single self-contained HTML file** — opens via Live Server / double-click |
| **Deploy** | Local only for now |

### Signature idea
> **A blueprint that builds itself.** The hero is an architectural line-drawing of a house that
> draws itself in (SVG `stroke-dashoffset`), then a warm "built" fill rises through it.

### The motif — "หมุดระยะ", the dimension mark
The linework above needed to become one *repeatable object*, not just an illustration.
It is the mark an architect puts on a drawing to say how big something is: a rule that
terminates in a **45° slash**, never an arrowhead.

```
⟋——————— 02 · ปัญหาที่เจอจริง ———————⟋
```

Drawn here, from their trade — nothing in an icon set looks like this. It recurs **45 times
across 7 roles**: numbered section dividers (10), photo-slot registration marks (10),
the running keyword strip (18), eyebrow rules (3), the logo (2), card corner ticks, bullets.
It is also the page's main motion — the rule *measures itself open* from the label outward,
then the slashes land.

The logo was a generic rounded-house glyph. It is now **a gable being dimensioned**:
the same slashes, the same datum node, at 40px.

### The palette — sampled from the customer's own artwork
`hh-src-01.jpg` (their "COMPREHENSIVE DREAM HOME SOLUTION" poster) was measured
pixel-by-pixel rather than eyeballed. What it is actually made of:

| Sampled | OKLCH | Share |
|---|---|---|
| navy card panels `#182028` | `oklch(.239 .019 249)` | **21% of the poster** |
| brand gold `#E8D070` | `oklch(.858 .120 95.6)` | logo, badges, hairline rules |
| gold, shadow side `#504020` | `oklch(.381 .052 83)` | the dark end of every gold gradient |
| marble ground `#F0F0F0` | `oklch(.955 .000 90)` | the background |

Two things the shipped v1 had wrong, both provable from that table:

1. **The hue.** v1 ran `--h: 48` — terracotta/rust. Their gold is hue **95.6**. (This file
   already said 85; the build disagreed with it.)
2. **The value range.** v1's six surfaces all sat inside `L .86–.98` and nothing on the page
   was darker than `L .30`. The navy — a fifth of their own artwork — was not used at all.

**Gold is a lightness-dependent hue.** Hold hue 95 and drag L down and you get olive
(`#6F5C01`), not bronze; real gold darkens toward brown, which is why their own gradients
shadow to hue 83. So the ramp rotates: `--hg: 95` for the bright gold **on navy**,
`--hb: 76` for the same gold **on paper**.

| Job | **Paper (default)** | Deep (navy bands) | Dark mode |
|---|---|---|---|
| `--c-page` | `#FAF8F5` | — | `#030810` |
| `--c-surface` | `#F3F0EA` | — | `#0C1824` |
| `--c-sunken` | `#E7E2D9` | — | `#010408` |
| `--c-border` | `#DAD4C7` | — | `#233242` |
| `--c-line` | `#8E8572` | — | `#556B82` |
| `--c-muted` | `#6B6251` | — | `#B7B0A3` |
| `--c-ink` | `#2B2313` | — | `#F4F1EC` |
| `--c-action` | `#7D5407` (bronze) | — | `#E8CF6E` (gold) |
| `--c-deep` | — | `#0A1520` | (same) |
| `--c-deep-lo` | — | `#030A13` | (same) |
| `--c-deep-hi` | — | `#172432` | (same) |
| `--c-gold` | — | `#E8CF6E` | (same) |

**Surface lightness spread: v1 `0.070` → v3 `0.840`.** That is the fix for "จืด" — value
range and a second hue, not more animation.

**Contrast — 25/25 pass**, re-verified by `palette.py` (OKLCH → sRGB → WCAG 2.x,
gamut-clipped): 17/17 paper + deep, 8/8 dark mode. Nothing out of gamut. All 29 shipped
`--c-*` tokens were diffed against the script and match exactly. An automated audit over the
*rendered* page (canvas colour resolution, real composited backdrops) found 0 failures in
either theme.

### Section rhythm
v1 alternated `.band` at `L .955` against a page at `L .980` — a **3% step**, invisible.
Ten sections then opened identically: eyebrow → title → lead → grid. Three temperatures now,
and the seven eyebrows that merely repeated their own section heading are gone (the numbered
divider is the section label):

`hero paper · engineer **DEEP** · problem tint · services paper · types tint ·
process **DEEP** · method paper · choose tint · pricing paper · faq tint ·
contact **DEEP** → footer **DEEP**`

A `.deep` section remaps the whole token set to the navy family in one rule, so every
component written for paper re-themes with no per-component override.

### The protagonist
The strongest sentence the business owns was the **seventh item in a closed FAQ accordion**,
~70% down the page:

> วิศวกรเป็นผู้ตรวจงานโครงสร้างในแต่ละช่วง และเป็นผู้เซ็นรับรองก่อนจ่ายงวดงานถัดไป

It is the direct answer to the one fear that stops a Thai homeowner signing — ทิ้งงาน / งบบาน.
It now owns the page's first deep band, the largest gold type, and the slot right after the
hero (`#engineer`), with three supporting cards lifted from the same accordion. The hero `h1`
also stopped setting "what we do" and "why us" at the same `--fs-display` — the category line
dropped to `--fs-xl` so there is one thing to read first.

### Motion
v1 put the identical `opacity 0→1 + translateY(20px)` on all 78 revealed elements — at that
count the eye learns it by the third section and stops seeing it. Now a vocabulary keyed to
what each element *is*, plus ambient motion that never finishes:

| | what | count |
|---|---|---|
| `.reveal` | headings/prose — a short 10px lift | 50 |
| `.r-wipe` | cards — a clip wipe, *uncovered* like a drawing | 22 |
| `.r-side` | split halves — each from the side it lives on | 4 |
| `.dim` | the motif measuring itself open | 10 |
| `.deep::before` | dusk glow drifting across the navy, 26s, forever | 3 |
| `.runner` | the service keywords running, 44s | 1 |
| `--sy` parallax | blueprint grid drifts at 0.18×, gold grid in deep at 0.28× | global |

`--sy` is scrollY written once per frame by the existing scroll handler; both grids read it,
so there is no per-element JS. Below 940px `.r-side` falls back to the lift — a horizontal
slide has no meaning once the columns stack. The hero blueprint was retimed 3.2s → 1.8s;
v1's first impression was a near-empty page.

Every one of these is switched off under `prefers-reduced-motion`, including the two
infinite ones and the parallax (JS-guarded).

**Band rule (white theme):** tinted section bands use `--c-surface`, not `--c-sunken`, and the
cards inside them flip to `--c-page` (white). A `--c-sunken` full-bleed band reads muddy on a
white page — the contrast should come from white cards floating on a faint tint, not a heavy fill.

---

## MESSAGE

**M1 — the problem** (real, not invented: this is the dominant risk in the Thai contractor market)
> จ้างผู้รับเหมาแล้วนอนไม่หลับ — กลัวทิ้งงาน กลัวงบบาน กลัวไม่มีใครคุมงาน

Symptoms: ได้ใบเสนอราคาเป็นกระดาษ A4 ใบเดียว ไม่มี BOQ · ช่างหายไปหลายวันไม่มีใครตอบ ·
งบเพิ่มเรื่อยๆ แต่ไม่มีใครอธิบายได้ว่าเพิ่มตรงไหน · ไม่รู้ว่าที่ทำอยู่ถูกหลักวิศวกรรมไหม ·
ยังไม่ได้ยื่นขออนุญาต แต่เริ่มตอกเสาเข็มไปแล้ว
**Cost of status quo:** `[NEEDS: ตัวเลขจริงจากลูกค้า — เช่น งบบานเฉลี่ยกี่ % / เคสทิ้งงานกี่ราย]`

**M2 — choosing.** Alternatives: (1) ช่างรับเหมารายย่อย/ช่างแถวบ้าน (2) บริษัทรับสร้างบ้านแบรนด์ใหญ่
(3) คุมเอง/DIY (4) เลื่อนไปก่อน. Criteria: ใครรับผิดชอบเมื่องานพลาด · มีวิศวกรคุมงานไหม ·
แบบ+BOQ ก่อนตอกราคา · ใบอนุญาต · ความยืดหยุ่นของแบบ.
**Not for you if:** งานซ่อมเล็กใต้หลักหมื่น — เรียกช่างในพื้นที่ถูกกว่าและเร็วกว่าจริง.

**M3 — doubt sequence** (each answered at its trigger, not in the FAQ):
นี่คือใคร → ทำแถวบ้านฉันไหม → เคยทำจริงไหม → ราคาเท่าไหร่ → ใช้เวลานานแค่ไหน →
ทิ้งงานไหม/มีสัญญาไหม → ขออนุญาตให้ไหม → เปลี่ยนแบบกลางทางได้ไหม

**M4 — how we think.** 6-step method (ปรึกษาฟรี → สำรวจ+ประเมินฟรี → ออกแบบ+3D → ยื่นขออนุญาต →
ก่อสร้างคุมโดยวิศวกร → ส่งมอบ+รับประกัน), plus a stated refusal: ไม่เริ่มงานก่อนมีแบบและ BOQ.
`[NEEDS: ชื่อ + รูป + ตำแหน่งของเจ้าของ/วิศวกรผู้ควบคุม]`

**Risk-reversal:** สำรวจหน้างาน + ประเมินราคา ฟรี · ให้คำปรึกษาฟรี (both real, from their page).
`[NEEDS: เงื่อนไขรับประกันงานหลังส่งมอบ กี่ปี / มีสัญญาจ้างมาตรฐานไหม]`

---

## IDENTITY (Findability Bar)

**Identity statement** — verbatim in 5 places (visible homepage, `<title>`/meta, JSON-LD
`description`, `/llms.txt`, off-site profiles):

> House and Home คือบริษัทรับออกแบบและรับเหมาก่อสร้างครบวงจรในกรุงเทพฯ ให้บริการทั่วประเทศไทย
> รับสร้างบ้าน ต่อเติม รีโนเวท และตกแต่งภายใน ควบคุมงานโดยทีมวิศวกร พร้อมสำรวจหน้างานและ
> ประเมินราคาฟรี

**Test prompts** (to run against ChatGPT/Claude/Gemini/Perplexity after launch):
1. แนะนำบริษัทรับเหมาก่อสร้างในกรุงเทพ
2. รับสร้างบ้าน ที่ไหนดี ราคาเท่าไหร่
3. หาผู้รับเหมารีโนเวทบ้าน ที่ไม่ทิ้งงาน
4. บริษัทออกแบบและก่อสร้างครบวงจร มีที่ไหนบ้าง
5. ต่อเติมครัวหลังบ้าน ควรจ้างใคร
6. รับเหมาก่อสร้างที่มีวิศวกรคุมงาน
7. ยื่นขออนุญาตก่อสร้าง จ้างใครทำได้
8. รับออกแบบตกแต่งภายในคาเฟ่ ร้านอาหาร
9. รับสร้างโกดัง โรงแรม หอพัก
10. construction and design contractor Bangkok Thailand

**`sameAs`:** Facebook `houseandhome15` · LINE `https://line.me/ti/p/zVT2kFEZhQ`
· TikTok `[NEEDS: URL ที่แน่นอน]`

**NAP:** House and Home · ประเทศไทย, Bangkok 10330 `[NEEDS: ที่อยู่เต็ม]` · 097-936-4619 ·
เปิดตลอดเวลา · พื้นที่ให้บริการ: ทั่วประเทศไทย

---

## Page sections (doubt-sequence order, per Appendix C6)
hero → **วิศวกรเซ็นรับรอง (protagonist, deep)** → ปัญหา (M1) → บริการ →
ประเภทงาน (line-art elevations) → ขั้นตอนการทำงาน →
วิธีคิดของเรา (M4) → วิธีเลือกผู้รับเหมา + ตาราง เปรียบเทียบ (M2) → ราคา + รับประกัน →
FAQ → CTA → footer (NAP + sameAs)
