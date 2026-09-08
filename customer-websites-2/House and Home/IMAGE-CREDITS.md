# Image provenance — House and Home

Every image in `index.html` is embedded as a base64 WebP data URI (the site is a
single self-contained file). This is the record of where each one came from and
what may legally be done with it.

---

## 0. Three service-card photos — section `#shots` — ADDED 2026-08-10

The three card images (`ออกแบบ + ภาพ 3D` · `รับเหมาก่อสร้าง` · `รีโนเวท`) are no
longer the customer's renders. ผู้ใช้สั่งให้เปลี่ยนเป็นรูปที่ "สื่อตรงกับ keyword ของการ์ด"
แบบเดียวกับรูปฮีโร่ — เดิมทั้งสามใบเป็นภาพ 3D บ้านเสร็จแล้ว ซึ่งไม่ได้บอกว่าการ์ดนั้นขายอะไร

| Card | Photographer | Source | Licence |
|---|---|---|---|
| ออกแบบ + ภาพ 3D | Salman Saqib | https://unsplash.com/photos/a-3d-rendering-of-a-modern-house-with-a-pergolated-roof-JUh-heqpKms | Unsplash License |
| รับเหมาก่อสร้าง | Sinan Sarıhan | https://unsplash.com/photos/buildings-under-construction-against-a-clear-blue-sky-ggOjGVzCYYQ | Unsplash License |
| รีโนเวท | Brett Jordan | https://unsplash.com/photos/brown-brick-building-during-daytime-jEP4vsHrSM8 | Unsplash License |

**Licence checked on each photo's own page** (all three show the free
"Download free" button — no Unsplash+). Unsplash blocks headless browsers and
`curl` with 403, so the pages were opened through the user's own Chrome.

**Processing:** CDN original at `?q=90&w=1800&fm=jpg` → cover-crop to 690×460
(3:2, same aspect the cards already used) → WebP, quality stepped down until
≤34 KB → 32 KB each. `รับเหมาก่อสร้าง` is cropped low (`fy 0.78`) because a
centre crop gave half a frame of empty sky. Script: `scratchpad/crop.js`.

690 px against a `max-width: 460px` card = ~1.5× density, so the cards stay
crisp on retina — the old 450 px renders were exactly 1:1 at best.

**Labelling:** these are stock illustrations of the *type of work*, not House and
Home's portfolio. The disclosure line under the section was rewritten to say so
(`ภาพประกอบขอบเขตงานด้านบนเป็นภาพจากคลังภาพเสรี ไม่ใช่ผลงานของ House and Home`) and the three
photographers were added to the footer credit line. Do not let a caption imply
these are the company's own jobs.

---

## 1. The four 3D renders — section `#shots` ("04 · ภาพ 3D Presentation")

**Status 2026-08-10:** three of the four were replaced by the stock photos in §0.
Only one render survives in the page — the `#contact` section background
(`--bg` on `<section class="deep" id="contact">`). The rest of this section is
the record of how all four were made.

**Source:** House and Home's own marketing artwork.
Lifted from `Screenshot 2569-08-07 at 13.03.41.png` (2030×692), which is a
higher-resolution capture of the same poster as `hh-src-01.jpg` (1024×572).

**Rights:** the customer's own material. No third-party licence involved.

**Processing:** card bounds located from the marble gutters between the dark
panels → crop `(x+12, 350) → (x−12, 650)` → 3:2 → LANCZOS to 450×300 →
UnsharpMask(1.2, 55%, 3) → saturation ×1.06 → WebP q84. ~14 KB each.

**Resolution ceiling:** 450 px is all the detail that exists. `.shot` is capped
at `max-width: 460px` so no breakpoint ever renders them below 1:1 — without
that cap the single-column band stretched them to 569 px (0.79×) and it showed.

**Labelling — do not change without thinking:** these are 3D *presentation
renders*, not photographs of completed buildings, and the section says so
explicitly. The business sells "we tell you the truth up front"; implying a
render is a finished building undercuts the whole page.

---

## 2. Four building-type photos — section `#types` — REMOVED 2026-08-09

**ตัด section นี้ออกจากหน้าแล้ว** (ซ้ำกับ #services และรูปเป็น stock ทั้ง 4 ใบ)
รูปทั้งสี่ถูกลบไปพร้อมกัน — เครดิตด้านล่างเก็บไว้เป็นบันทึกว่าเคยใช้อะไร

### เดิม: Four building-type photos

One free-licence photograph per building type the card names. These replaced
the line-art elevations.

| Card | Photographer | Source | Licence |
|---|---|---|---|
| บ้านชั้นเดียว | Rana Matloob Hussain | https://www.pexels.com/photo/36871546/ | Pexels License |
| บ้านสองชั้น | Hardik Panchal | https://unsplash.com/photos/gto28gGSTcY | Unsplash License |
| ตึกแถว · อาคารพาณิชย์ | Poojan Thanekar | https://unsplash.com/photos/F-slnkFvcag | Unsplash License |
| โกดัง · โรงงาน · หอพัก | set.sj | https://unsplash.com/photos/TxYTr0dNA50 | Unsplash License |

**Each licence was checked on its own photo page, not inferred from search.**
Pexels search results interleave sponsored iStock/Getty items and Unsplash
interleaves paid **Unsplash+** — neither is free, and neither is used here.
All four carry the plain free licence.

**Processing:** cover-crop to 480×286 (1.68, the aspect the line-art SVGs used)
→ saturation ×0.94 → WebP, quality stepped down until ≤24 KB. 18–23 KB each.
`.type-shot` is capped at `max-width: 480px` so the single-column band cannot
stretch them past 1:1 — worst density across all breakpoints is exactly 1.00×.

**These are illustrations of a building type, not portfolio.** The note under
the grid says so verbatim — *"ภาพด้านบนเป็นภาพประกอบประเภทงานจากคลังภาพเสรี
ไม่ใช่ผลงานของ House and Home"* — and the footer credits every photographer.
The credit line is not required by either licence; it is there because a
visible credit is what tells a reader these are stock. **If the photos ever
move to a slot that reads as portfolio, that disclaimer has to move with them.**

### Rejected for these cards

- **Pexels "shophouse"** — returns heritage Peranakan shophouses in Singapore.
  Beautiful, and wrong: the card means modern ร้านค้า / ออฟฟิศ / คลินิก / โชว์รูม,
  not colonial heritage frontage.
- **Pexels "modern commercial building facade"** — abstract close-ups of glass
  towers. The card is about 2–4 storey street-facing buildings.
- Several single-storey results were weathered or derelict houses, which is the
  opposite of what a contractor is selling.

---

## 3. Drawings on site — section `#method` — REMOVED 2026-08-09

**ตัด section นี้ออกจากหน้าแล้ว** (ปรัชญาการทำงาน ซ้ำกับ #engineer และ #choose)
รูปถูกลบไปพร้อมกัน

### เดิม: Drawings on site

| Photographer | Source | Licence |
|---|---|---|
| Maren Ferraro | https://www.pexels.com/photo/29502895/ | Pexels License |

Checked on its own photo page — genuine Pexels, not a sponsored iStock result.

**Why this photo and not a house.** All four principles in this section are
about deciding on paper before touching the site, and the sharpest of them is
*"วิศวกรต้องอยู่เหนือหน้างาน ไม่ใช่อยู่ในกระดาษ"*. Real construction drawings
open on a real site table says that. A house exterior would say something else
entirely — and would read as portfolio, which this slot must not.

**No identifiable face, on purpose.** A photo of a person here would read as
*"this is our engineer"* — a claim about staff, not about method. Hands only.

**Processing:** cover-crop to 520×650 (4:5, the `.split .media` aspect) →
saturation ×0.92 → WebP q70, 25 KB.

**Bug found while capping it:** `.split .media` needs an explicit `width: 100%`
alongside `max-width` + `margin-inline: auto`. Auto margins cancel a grid
item's default stretch, and this box's only child is absolutely positioned, so
without it there is no content to size against and the whole slot collapses to
0×0. Uncapped it had stretched to 720px (0.72×) in the stacked layout.

---

## 4. Two atmospheric backdrops — sections `#engineer` and `#contact`

Free-licence photographs, used as darkened background texture only.

| Section | Photographer | Source | Licence |
|---|---|---|---|
| `#engineer` | Jusuf Bachtiar | https://unsplash.com/photos/nyceoSzBZxk | Unsplash License |
| `#contact` | Salman Saqib | https://unsplash.com/photos/QlrpgvmdOSU | Unsplash License |

**Licence terms** (https://unsplash.com/license): free for commercial use, no
permission or attribution required, irrevocable and worldwide. Both were checked
individually and confirmed to carry "Free to use under the Unsplash License" —
neither is **Unsplash+**, which is the paid tier and must never be used here.
Attribution is not required; the footer credits them anyway, because a visible
credit line is also what signals to a reader that these are stock and not
House and Home's own projects.

**Processing:** cover-crop to 1400×620 → brightness ×0.42 → contrast ×0.88 →
saturation ×0.55 → blended 42% toward `--c-deep` (#0A1520) → WebP q58.
~10 KB each, because darkened low-contrast images compress hard.

**Placement rationale — the important part.** On a contractor's website any
legible house photo reads as *"we built this."* Putting stock into the `.media`
slots, the `.type-card`s, or the `#shots` strip would be a claim the business
cannot back. As a backdrop sunk into the navy behind text it reads as depth —
which is exactly what the customer's own poster does with photography behind
its dark panels — and cannot be mistaken for portfolio.

**Verified:** composited against the CSS overlay in-browser, the *brightest*
pixel either backdrop can put behind text still gives 14.5:1 for body,
10.6:1 for gold, 7.6:1 for captions. The backdrops cannot harm legibility.

---

## 5. The service-card icons — drawn, not stock

The nine service cards used to open with an empty 4:3 `.media` photo slot.
Nine of those in one grid read as an unfinished site — it is the "image failed
to load" pattern, and dressing the empty state up did not change what it says.
They now open with `.ico-tile`: a solid 56px navy plate with a filled gold
glyph, inverted to a gold plate with a navy glyph in dark mode.

**The nine glyphs are drawn for this site**, not taken from an icon set. They
sit on the same axis-aligned / 45° geometry as the dimension motif and use
drawing conventions rather than icon clichés:

| Service | Glyph |
|---|---|
| ออกแบบ + ภาพ 3D | axonometric mass, three tonal faces |
| เขียนแบบ + ยื่นขออนุญาต | sheet with fold + approval check |
| รับเหมาก่อสร้าง | gable mass on a datum line |
| รีโนเวท | house half solid, half **hatched** — the drawing convention for "this part changes" |
| ต่อเติม | existing mass + attached bay + plus badge |
| Built-in เฟอร์นิเจอร์ | carcase with drawer divisions |
| ตกแต่งภายใน | paint roller |
| งานระบบ | bolt |
| ปรับปรุง + ซ่อมแซม | roof with one panel lifted for replacement |

Two-colour by construction: `.m` is the mass, `.c` / `.s` knock back out to the
tile colour. That is why the tile colour is the `--tile-bg` variable and not a
literal — the knock-outs have to follow it when dark mode inverts the plate.

**Measured:** tile vs card 17.4:1 light / 13.0:1 dark; glyph vs tile 11.9:1 in
both. The first dark-mode attempt (a *darker* tile) measured **1.01:1** — the
card is already navy, so a navy chip on it is invisible. Hence the inversion.

### Photos are not gone

`.media` and its empty state are still defined in the stylesheet, deliberately.
When real photography exists, that is how it goes back in:

```html
<div class="media"><img src="…" alt="…"><svg class="media-ico">…</svg></div>
```

`.media:has(img)` removes the grid, frame, corner slashes and watermark
automatically — no CSS change, no layout shift.

**Best source:** their own Facebook page (facebook.com/houseandhome15, 13k
followers) already carries real in-progress and completed project photos.
Those are worth more here than any stock library, and they carry no licence
or misrepresentation risk at all.

---

## Page weight — the live tradeoff

Everything above is embedded as base64 in `index.html`, because the brief is a
single self-contained file that opens by double-click. That has a cost:

| | KB |
|---|---|
| base HTML + CSS + JS | ~150 |
| 4 × 3D renders (`#shots`) | ~76 |
| 4 × type photos (`#types`) | ~105 |
| 1 × drawings-on-site (`#method`) | ~33 |
| 2 × deep-band backdrops | ~27 |
| **total** | **~399** |

399 KB is all *blocking* — it is the HTML document, so none of it lazy-loads
and none of it caches separately. On a mobile-first Thai audience that is the
one real argument for breaking the single-file rule: moving the nine images to
an `assets/` folder would cut the initial document to ~150 KB, let the
below-fold ones lazy-load, and let repeat visits cache them. Relative paths
still work by double-click, so only the "one file" property is lost.

That is a call for the owner, not a bug. Until it is made, keep new images
small: step WebP quality down until each is ≤24 KB rather than raising the cap.

---

## Rejected candidates, and why

Searched Pexels and Unsplash for a Thai/tropical match to the reference renders:

- **US suburban** (Pexels 106399, 186077, 4933643) — attached garages, vinyl
  siding, gable dormers. Reads as American instantly.
- **Nordic/Alpine** (Pexels 13752348, 4626268, 4626277, 7031407) — snow, stone
  and timber facades.
- **Pexels "thailand house"** — returns traditional stilt and riverside wooden
  houses, i.e. heritage architecture, not contemporary residential.

Free stock essentially does not carry Thai contemporary residential
architecture, which is a studio-render genre rather than a photographic one.
The four kept Unsplash tropical shots were the closest available, and only two
were needed once the decision was "atmosphere, not portfolio".

---

## 6. Hero photograph — `hero.jpg` (added 2026-08-09)

| Photographer | Source | Licence |
|---|---|---|
| Salman Saqib | https://unsplash.com/photos/WaC-JFfF21M | Unsplash License |

**Licence checked on the photo's own page**, not inferred from a search result:
it reads "Free to use under the Unsplash License" and is **not** Unsplash+.
Same photographer as the `#contact` backdrop (§4), different photo.

**This is the one image on the site that breaks the rule in §4** — a big legible
house photo above the fold. That was a deliberate client request (match the
"Quad" reference layout: one large sharp hero image). The mitigation is the
caption burned into the hero, verbatim:

> ภาพประกอบสไตล์งาน — ไม่ใช่ผลงานของ House and Home

**คำบรรยายนี้ถูกถอดออกแล้ว 2026-08-09 ตามที่ลูกค้างานสั่ง** — การเปิดเผยว่าเป็น
ภาพประกอบยังเหลืออยู่ที่บรรทัดเครดิตใน footer ซึ่งขึ้นต้นว่า
"ภาพประกอบ (ไม่ใช่ผลงานของ House and Home):" พร้อมชื่อช่างภาพครบทุกคน
ถ้าจะเอาคำบรรยายกลับมา ให้ใส่ figcaption คืนในบล็อก C7 ของสคริปต์ variant C

**When real site photography arrives, replace the file** (คำบรรยายเดิมคือ (`index.html`, the C7 block in the variant-C script). Nothing else has to
change — the markup is generated, the `<img>` is 16:9 `object-fit: cover`.

**Not embedded as base64, on purpose.** At 1600×901 / q62 it is 294 KB — inlining
it would have pushed the blocking HTML document from ~437 KB to ~830 KB. As a
sibling file it caches separately, and a relative path still opens by
double-click, so the "no build step" property survives. Worst density measured:
0.69× at 1280, 0.45× at 768, 0.21× at 390 — never upscaled.
