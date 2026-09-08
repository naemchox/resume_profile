# The Bed Phatthanakan 20 — upgrade log (2026-08-17)

Brief: the zamil (Maya Green) recipe — **audit before adding · the mark used large ·
motion drawn from this subject only · numbers that arrive** — applied without changing
the stack, the palette direction, or any factual claim.

Stack unchanged: one `index.html`, Tailwind via CDN, Google Fonts, no npm, no build,
no new JS library. All motion is hand-written CSS + IntersectionObserver + rAF.

---

## 1. เร่งของเดิม (decoration that was already declared but never reached the screen)

| # | Where | Was | Now | Why it was invisible |
|---|---|---|---|---|
| 1 | Suites section glow | `opacity 0.04`, gold radial on `#0A0908` | `opacity 0.13`, wider radials | gold at 4% over near-black is a ~1% luminance lift — nothing on a real screen |
| 2 | Contact diamond lattice | `opacity 0.10`, stroke `0.5` | `opacity 0.22`, stroke `1.1` | a 0.5px stroke at 10% is below one display pixel of contrast |
| 3 | Suite card border | `rgba(gold, 0.18)` | `0.34`, hover `0.75` + 3px lift + gold-tinted shadow | card and section are both `#0A0908`; at 0.18 the three cards read as one dark slab |
| 4 | Card footer rules | `border-gold/15` | `border-gold/30` | same problem, smaller surface |
| 5 | **Contrast, measured** | `gilded #CA8A04` on cream = **2.61:1** | `gilded #A87103` = **3.71:1** (display only) + new `burnish #8F6000` = **4.86:1** for 11–12px eyebrows and numerals | under the 3:1 floor for large text and nowhere near 4.5:1 for the small labels — every gold accent on the light sections read as a smudge |
| 6 | Hero light | — | the band now **exits** (`58%`) instead of parking at `12%` | held at its end position it left a permanent bright wash over the façade and crushed the gold eyebrow under it |
| 7 | `.reveal` no-JS behaviour | `opacity: 0` unconditionally | gated behind `html.js` | with JS off (or the CDN blocked) every section was invisible: the page was a blank white screen. **Verified**: with `html.js` removed, computed `opacity: 1`, no transform, no clip-path |
| 8 | `will-change` | left on every section forever | dropped on arrival | a live compositor layer per section, permanently |

## 2. ของใหม่ (added)

| Layer | What | Notes |
|---|---|---|
| Mark, large | Outlined **20** numeral behind the hero at `44vw` — the address *is* the identity (Soi Phatthanakan **20**) | clipped by the hero; `-webkit-text-stroke` with an `@supports` fill fallback |
| Mark, large | Footer wordmark **THE BED** at `15.3vw`, outlined, lifted out of its own frame | transform only — a fade on a surface this wide is exactly what the grain layer makes stutter |
| Motion | **Light arriving**: a warm band drifts once across the façade; the photograph settles out of a 6% overscale | the settle animates `scale`, not `transform`, because the parallax script owns this element's transform |
| Motion | **Words rise from a mask**, staggered 55ms, on the h1 and all seven h2s | only text nodes are wrapped; `<br>`, the italic spans and copy-paste all survive |
| Motion | **Curtain drawn** on every photograph, the map, and the floating frame — `clip-path`, top to bottom, staggered 85ms | replaces the old slab fades |
| Motion | **Rules are drawn**, not switched on: the three `.gold-rule` divs are now SVG lines animating `stroke-dashoffset`, sharing one gradient `<defs>` so the soft ends survive | a `border-bottom` cannot be drawn, only appear |
| Motion | Eyebrow ticks grow out of the text they mark; suite cards and review cards arrive in sequence | |
| Numbers | Storeys, years, the four nearby-minute figures, the review count and the 4.7 rating **count up** on arrival, `tabular-nums` so nothing shifts | no new numbers were invented; only the ones already on the page animate |
| Correctness | The **4.7 rating no longer draws five full stars** — the gold row is clipped to the real fraction (94%) over a dim row, and it fills on arrival | five full stars for a 4.7 was the one place the page overstated its own facts |
| Correctness | Review histogram bars fill from the left instead of sitting pre-filled | |

## 3. Technical rules held to

- Every reveal is `IntersectionObserver`, never a scroll handler; `rootMargin: 0px 0px 25% 0px`
  (**positive**, so motion finishes before the eye arrives) and `unobserve` on arrival.
- Anything already on screen at load is **measured** and released after two frames —
  the observer does not fire in a prerendered or background tab, and one frame is not
  enough for the browser to have resolved the freshly-created word spans' start style.
- Only `transform / opacity / clip-path / stroke-dashoffset / width` animate. No layout properties.
- `prefers-reduced-motion` **clears every start state**, not just the durations, and the
  counters write their final value. Verified with `--force-prefers-reduced-motion`:
  nothing stayed hidden.
- 360px: no horizontal overflow (`scrollWidth == innerWidth`). 1440px: same.
- Bug found and fixed during verification: **`clip-path` on the observed element makes its
  intersection ratio permanently 0**, so every curtain stayed hidden forever. The clip now
  sits on the child; the frame is what gets observed.

Verified with headless Chrome over CDP at 1440×900 (scroll 0 / 1200 / 2600 / 4300 / 7200 / 9000),
360×760, and once with reduced motion forced. Zero console errors in every run.

---

## 4. Facts on this page that cannot be sourced

There is **no `FACTS.md` for this site** (zamil has one, and it is what keeps that site
honest). Everything below is currently asserted on the page with nothing behind it:

1. **Rating 4.7 / 18 reviews / "Google Verified"** and the whole 83/11/6/0/0 histogram.
2. **Three named reviewers** — "Memufie", "Wichayaporn Srichan", "Thomas Caldwell" — and
   their quotes, dates and review counts.
3. **Suite names, sizes and prices** — The Atelier 28 sqm ฿12,500 · The Reader 42 sqm
   ฿17,800 · The Salon 58 sqm ฿24,500 — plus "Most Loved".
4. **04 storeys · 12+ years** of continuous care.
5. **Nearby times** — 2 min 7-Eleven, 5 min ARL Hua Mak, 12 min Suvarnabhumi, 20 min Sukhumvit.
   (12 minutes to Suvarnabhumi from Suan Luang is optimistic on any real day.)
6. **Amenity claims** — TB TheBed Café "4.4 rating", Classy Gel "five-star", 24-hour
   security team, weekly housekeeping included, fibre throughout, resident pizza evenings.
7. **Reception opens daily at 10:00**, phone **098 654 8848**, Plus Code PJH5+8M.
8. **`concierge@thebed-phatthanakan.example`** is a placeholder address, and it is displayed
   without its TLD.
9. Footer **LINE / Instagram / Facebook** links are `href="#"` — they go nowhere.
10. The contact form submits to nothing: no endpoint, no honeypot, no error state — it
    only rewrites its own button.

## 5. What to ask the client before this goes live

1. **Photographs.** Every image is hot-linked from `c2.hongpak.in.th` — a third-party
   listing site. If they change a path, or block the referer, the page goes blank; and the
   usage right is theirs, not ours. Get the originals and put them in `work/the-bed/assets/`.
2. The real Google rating, review count, and permission to quote reviewers by name.
3. Suite inventory: names, sizes, current rents, what is actually included.
4. Storeys, year the building opened, years under current management.
5. A working concierge email, and the real LINE / Instagram / Facebook URLs.
6. Where the viewing-request form should send — an inbox, a LINE OA, or a sheet.
