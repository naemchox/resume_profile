# House and Home — Handoff

Single-file website. Open `index.html` with Live Server (or double-click it).
Built following `Skill/Website/website_building.md`. Decisions: `DESIGN.md`. Source content: `BRIEF.md`.

```
index.html     ← the whole site (CSS + JS inline, no build step)
robots.txt     ← AI-crawler allowlist (verified user-agent names, Aug 2026)
llms.txt       ← plain-Markdown summary for AI assistants
sitemap.xml    ← 1 URL
```

---

## ✅ Verified this session (not claimed from memory)

| Gate | Result |
|---|---|
| Theme | **White by default.** Verified with the OS in dark mode: page stays `#FAF8F5`, no `data-theme` set. Toggle switches dark↔light both ways, icons swap |
| Contrast, both modes | ink/page **12.89:1** light · **17.03:1** dark — target was 8.4:1. All pairs pass. Computed OKLCH→sRGB→WCAG, gamut-clipped |
| Accent in sRGB gamut | Light accent was out of gamut at C .100; lowered to **.090** (cap at hue 85 / L .45 is .093) |
| Horizontal scroll | **None** at 320 / 390 / 768 px (measured `scrollWidth` vs `clientWidth`) |
| Comparison table on mobile | Stacks to cards — `td: block`, `thead: none` at 390px |
| Touch targets | Smallest interactive element **25px** (WCAG 2.5.8 floor is 24px) |
| Accessible names | 37 focusable elements, **0** missing a name |
| Landmarks | 1 `<h1>`, 1 `<main>`, 1 `<nav>`, 1 `<header>`, 1 `<footer>`, skip link works (reveals at top:16px on focus) |
| Focus ring | 2px solid accent, 2px offset, resolves on controls |
| **Reduced motion** | Verified by serving a copy with `(prefers-reduced-motion: reduce)` rewritten to `(min-width: 0px)` — i.e. the block genuinely applied — then reading every section visually. Whole page complete, blueprint fully drawn. (An earlier DOM-based check of this was unreliable: `getComputedStyle` in the automation context returns pre-recalc values, so it reported stale numbers. The forced-CSS + screenshot method does not depend on that.) |
| Console | No errors |
| JSON-LD | Parses. `GeneralContractor` + `WebSite` + `FAQPage`, shared `@id`, `sameAs` populated, 8 `Offer`s, **no fabricated `aggregateRating`** |
| Content in raw HTML | Identity statement ×5 in `index.html`, phone + "วิธีเลือกผู้รับเหมาก่อสร้าง" present via `curl` |
| robots.txt | 4 AI-crawler families allowed, no `noindex` anywhere |

**Not yet run** (needs a real deployed URL): Lighthouse / Core Web Vitals, the schema.org rich-results
validator, and the AI-assistant baseline test. See "After deploy" below.

---

## 🔴 Needed from the client before this goes live

The site was built with **real-shaped copy, never invented facts**. There is no fake statistic,
testimonial, rating or logo strip anywhere. These 11 gaps are marked `[NEEDS: …]` in the source:

**Blocking — the site is weaker without these**
1. **ราคา / ช่วงราคา** — ค่าออกแบบคิดยังไง, ค่าก่อสร้างต่อ ตร.ม. หรือราคาเริ่มต้น.
   Right now all three tiers say "ประเมินฟรี". Real numbers are the single biggest lever for both
   conversion and getting quoted by AI assistants — "สอบถามราคา" is unquotable.
2. **รูปผลงานจริง 6–12 รูป** (ก่อน/หลัง, ภาพ 3D คู่กับของที่สร้างเสร็จ).
   **I checked their Facebook and it does not have them.** Their only albums are
   `รูปโปรไฟล์` (7) and `รูปภาพหน้าปก` (36 marketing banners). The timeline photo grid is
   mostly infographics plus about five genuine site shots (rebar, wiring, a boundary wall) —
   and those serve at **414×414**, too small for a gallery and unglamorous besides.
   There is no portfolio of finished work anywhere on the page.
   → **Ask the client directly for a photo set.** This is the single biggest remaining gap:
   a builder with no pictures of finished buildings is the hardest thing on this site to
   explain away. In the meantime the site ships a `#types` section of **line-art elevations**
   (single-storey, two-storey, shophouse, warehouse) in the hero's blueprint language. They are
   openly labelled as drawings, not photographs, with a link out to the real Facebook work —
   honest, and they stop the page reading as image-less.
3. **ชื่อ + ตำแหน่ง + รูปถ่ายของเจ้าของ/วิศวกรผู้ควบคุมงาน** — for the "สิ่งที่เราไม่ทำ" block.
   Anonymous companies are trusted less by people and cited less by models.
4. **เงื่อนไขรับประกันหลังส่งมอบ** (กี่ปี, ครอบคลุมอะไร) + มีสัญญาจ้างมาตรฐานไหม.
   This is the strongest doubt-killer available and the slot is already built for it.

**Important**
5. ที่อยู่เต็ม (สำหรับ Google Business Profile — ต้องตรงกันทุกตัวอักษรทุกช่องทาง)
6. ลิงก์ TikTok ที่แน่นอน (ใส่ใน footer + `sameAs` ของ JSON-LD)
7. ตัวเลขจริงเรื่องต้นทุนของปัญหา — เช่น งบบานปลายเฉลี่ยกี่ %, เคสที่เข้าไปแก้ต่อจากผู้รับเหมาเดิมกี่ราย
8. รีวิวลูกค้าจริง (มีแค่ 1 รีวิวบน Facebook ตอนนี้)

**Before deploy**
9. โดเมนจริง — replace `houseandhome.example` in `index.html` (canonical + OG + JSON-LD),
   `robots.txt`, and `sitemap.xml`
10. `og-image.jpg` 1200×630 — generate from the finished hero (Step 17)
11. Update `lastmod` in `sitemap.xml`

---

## After deploy — three things that must actually be run

1. **Lighthouse** on the live URL (`npx lighthouse <url> --view`). Quote the real LCP/INP/CLS.
   Watch the Google Fonts request — it's the only external resource and the likeliest LCP drag.
   Self-hosting + subsetting the two Thai fonts is the fix if it fails.
2. **Rich Results Test** (`search.google.com/test/rich-results`) *and* `validator.schema.org` —
   both, they catch different things.
3. **The AI-assistant baseline test.** Run the 10 Thai test prompts in `DESIGN.md` against ChatGPT,
   Claude, Gemini and Perplexity. Record position + what they say. Expect nothing on day one —
   indexes and third-party sources take weeks to months. Re-run at 1 and 3 months.

---

## 🟡 The half we cannot build for them

A site with perfect schema and no third-party footprint still loses to a mediocre competitor with
fifty reviews. Assistants cross-check what *other* sources say. Ranked by effort-to-payoff:

1. **Claim and fully complete the Google Business Profile** — for a local Thai contractor this
   outweighs everything else on this list combined.
2. **Get real reviews** onto Google and Facebook. Ask every finished customer.
3. **Consistent NAP everywhere** — same name, same address string, same phone format, same
   category words, same description on Facebook, TikTok, LINE OA, Google, and any directory.
   Five different self-descriptions read to a model as five weak entities.
4. Thai construction/contractor directories and marketplaces.
5. Honest participation where the category is discussed (Pantip, Facebook groups).

**Be straight with them:** none of this guarantees a top-5 AI recommendation. It depends on real
reputation and competitors nobody controls. Anyone promising guaranteed AI ranking is selling
something.

---

## Notes for whoever edits this next

- **The whole site re-themes from one line.** Change `--h: 85` in `:root`. If you change a
  *lightness*, re-measure contrast — `scratchpad/palette.py` does it. OKLCH `L` is not CIE `L*`,
  so hand-estimating ratios will be wrong.
- **Accent chroma is gamut-capped per hue.** At hue 85: `L .45 → max C .093`. Exceed it and the
  browser silently clips to a duller, different colour and the ramp breaks.
- **Nothing was pulled from a component library** — no React/shadcn here, so there is no foreign
  hex, radius, font or duration anywhere. Everything consumes the nine `--c-*` job tokens.
- Motion budget is spent on **one** wow moment (the hero blueprint). Don't add a second heavy
  piece — three spectacles cancel each other out and hurt INP.
- **Never use `Z` (closepath) on a `.bp-draw` path.** `getTotalLength()` omits the closing
  segment, so the JS writes a `stroke-dasharray` shorter than the path and the final edge never
  draws — this silently left all four hero windows missing their left edge. Write the closing
  edge explicitly (`… H100 V148`) instead. Same reason the `--len` fallbacks in the markup are
  rounded generously **up**: too short truncates, too long is free.
- **To restore OS-following dark mode**, wrap the `:root[data-theme="dark"]` block in
  `@media (prefers-color-scheme: dark)` as `:root:not([data-theme="light"])`, and make
  `currentTheme()` in the JS consult `matchMedia` again. It's commented at both sites.
- Section order follows the doubt sequence, not convention. If you insert a section, insert it
  where the doubt it answers actually arises.
