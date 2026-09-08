# Photographs

**Status: received and published, 2026-07-25.** The client supplied 11 first-party
photographs, all carrying the shop's own "MAYA GREEN OFFICIAL" watermark. Originals
are kept in `assets/images/`; the cropped, compressed web derivatives live here.

## What is published

| File | Ratio | Where | Source |
|------|-------|-------|--------|
| `hero-dark.jpg` | 12:7 | index — full-bleed behind the hero | Foliage from the logo artwork, two bands tiled (not a photograph) |
| `logo-hero.jpg` | 2.883:1 | **unused** — was the hero plate | The MAYA GREEN logo artwork (not a photograph) |
| `storefront-wide.jpg` | 2:1 | index — wide gallery plate | The shopfront and its black-and-gold fascia |
| `lounge.jpg` | 4:5 | index — tile 1 | The lounge: pendant lamps, bean bags, violet cove light |
| `counter.jpg` | 4:5 | index — tile 2 | Staff rolling at the counter, sign behind |
| `terrace.jpg` | 4:5 | index — tile 3 | Terrace seating and the neon leaf "Open" sign |
| `shelf-samurai.jpg` | native | menu — above the strain list | The Samurai Weed board and the flower jars |
| `shelf-jars.jpg` | 4:5 | index — "We don't stock everything" plate | Second cut of the same frame, jars only |
| `brand-wall.jpg` | 3:2 | menu — "If it doesn't pass" plate | Gold wordmark and leaf on the living plant wall |
| `hero-leaves.jpg` | 8:5 | **standby** — the light hero's backdrop | Foliage from the logo artwork, blurred (not a photograph) |
| `storefront-day.jpg` | 4:5 | visit — pair, left | The frontage by day |
| `storefront-night.jpg` | 4:5 | visit — pair, right | The frontage by night, sign lit |

## What was held back, and why

Four of the eleven are not on the site. None of this is a quality judgement on the
photographs — they just don't serve these pages:

- **Glass pipes in a lit display case.** Neon blue and pink, third-party brand logos
  on the pieces. Fights the ivory/gold/forest palette badly, and puts another shop's
  branding on this one's homepage.
- **STRAINZ Premium pre-roll display.** Shows four strains and THC figures that are
  *not* on the menu we transcribed (Gary Payton 28%, Sherbet x Runtz 25%, Gelato 33
  19%, Lemon Cherry Gelato 22%). Publishing it advertises a product line the site
  does not list. If the shop wants pre-rolls on the site, get that board properly and
  it becomes a second menu section — not a decorative tile.
- **Second lounge angle.** Near-duplicate of `lounge.jpg`; the published one has the
  better composition.
- **Party photograph** (balloons, novelty smoking device, safety glasses). Reads
  recreational and jokey. The site is positioned medical throughout — see FACTS.md.

## The hero image

The index hero is now a dark photographic band: `hero-dark.jpg` full-bleed, with the
copy ranged left over it, under `.hero--dark`. Built to a supplied reference.

`hero-dark.jpg` (1920 × 1120) is foliage from the logo artwork again, but sharp rather
than blurred, and it needs two bands to make a wide frame out of a tall one:

- `x 70 → 795` and `x 4800 → 5425`, both `y 95 → 1815`. The y inset matters — the full
  height carries the artwork's own top and bottom gold borders, which land as gold
  slivers down the left and right edges once the band is rotated.
- Rotate the first 90° and the second 270°, so the join does not read as a mirror.
- Stack them with a 170 px cross-faded overlap, cover to 1920 × 1120, brightness ×0.74,
  saturation ×1.05, JPEG q84.

Two scrims sit over it in `.hero--dark .hero__leaves`: a horizontal one that carries
the text side, and a vertical one that seats the bar at the top and lands on `--forest`
at the bottom, so the marquee reads as the same surface continuing rather than a new
band butting up against it.

`.dark-hero` on `<body>` is the other half. The bar is transparent until it sticks, so
on this page it spends that time over the photograph and every part of it inverts —
wordmark, links, language chips, CTA, burger. All of it is scoped to that flag, and the
ivory scrim from the light hero is switched off. Menu and visit are untouched.

### `logo-hero.jpg` is no longer on the page

It was the hero plate before this. The file is kept, not deleted — restoring it is
putting the `<figure class="hero__blob">` back into `index.html` and dropping the
`hero--dark` class. Its `.hero__blob` CSS is also still in place.

### The wave frame, if you want it back

The hero used to be cut to an organic wave. The path is still defined as `#blob-wave`
in the `<defs>` block of `index.html`, marked unused. Re-enable it by adding
`clip-path: url(#blob-wave)` to `.hero__blob img` — **but the artwork has to be
rebuilt for it first**, and this is the part that is easy to get wrong:

- **Nothing can be painted outside the path.** Border, shadow and inner frame are all
  cut away with the mask. The shape has to carry the edge on its own.
- **The wave eats the edges — up to 6.3% top and bottom, 14% at the corners.**
  Anything that matters has to be held inside that inset.
- **The logo cannot simply be cropped to fit.** At 2.885:1 with the wordmark running
  almost edge to edge, no 2.2:1 crop keeps the whole of MAYA GREEN *and* clears the
  wave — it slices the gold rule and the outer letters.

The version that did work was composited, not cut: the artwork scaled to cover
1600×727 as a backdrop (Gaussian blur 20, brightness 0.82) to give the wave foliage to
bite into, then the complete logo pasted over it at 84% of the canvas width, centred,
through a rectangular mask feathered by ~34 px so the sharp plate dissolved into the
blur instead of showing a seam. The feather has to stay smaller than the artwork's own
frame inset (~15%) or the gold rule goes soft.

### Photograph crops that fitted the wave

Both full width of their originals:

- Plant wall — `y 80 → 442` of `Screenshot 2569-07-25 at 13.02.19.png`, a plain centre
  cut that puts the wordmark at 19–83% of the width.
- Shopfront — `y 53 → 416` of `Screenshot 2569-07-25 at 13.03.12.png`. Its fascia has
  to clear the wave's deepest bite rather than sit at the frame edge: the fascia's top
  edge is row 77, so that crop carries 24 px of lead-in above it (6.3% of 363 = 22.9,
  plus 1).

## The blurred foliage behind the first screen

**This is the light hero, which `.hero--dark` currently sits on top of.** Nothing here
is on the page as it stands — `.hero--dark .hero__leaves` replaces the background
outright. It is all still wired and correct, so taking the `hero--dark` class off
`index.html` brings this back exactly as described. Kept for that reason.

`hero-leaves.jpg` (1920 × 1200) is the out-of-focus leaf field behind the top of the
index page. It is not a photograph and not one of the eleven: it is cut from the
foliage border of the logo artwork itself, `assets/images/Maya Green logo.png`
(5481 × 1900), so the greens match the plate that sits on top of it exactly.

To rebuild it: crop `x 45 → 800` full height — inside the gold frame, outside the
green plate — rotate 90°, scale to cover 1920 × 1200, Gaussian blur radius 22,
saturation ×1.08, JPEG q82. The rotate is only there to turn a tall band into a wide
one; at that blur nobody can tell. Resolution barely matters after the blur, which is
also why the file is only ~60 KB at full-bleed size.

**The file is deliberately left rich — all the lightening happens in CSS.** Two layers
tune it, and both are worth understanding before touching either:

- `.hero__leaves` carries an ivory veil as a second background layer on the same
  element. It is not a simple fade: it opens up to .42 behind the logo plate, where
  the leaves should read, then closes to .90 by 54% so the eyebrow, heading, lede and
  facts row sit on near-ivory. Retune the whole effect from those stops.
- `.nav:not(.is-stuck)::before` is an ivory scrim under the top bar. On every other
  page it is invisible — ivory fading into ivory — and it exists only because the
  wordmark's `SELECTED CANNABIS BOUTIQUE` tagline is small and `--muted`, which needs
  a veil of .93 over dark leaves to hold 4.5:1. Putting that into the backdrop instead
  would have flattened the leaves across the whole top of the page.

Every piece of hero text was checked against the darkest tenth-percentile patch of the
image behind it, and clears 4.5:1. If you open the veil further, re-check the eyebrow
and the tagline first — they are the two that fail before anything else does.

The layer needs no measuring to cover "top of the page down to the marquee": `.hero`
already starts at y 0, because the bar is `position:fixed` and floats over it, and it
clips with `overflow:hidden`.

## The two cuts of the jar shelf

`shelf-samurai.jpg` and `shelf-jars.jpg` come from the same original
(`Screenshot 2569-07-25 at 13.02.33.png`). The menu page gets the whole frame, board
and all. The index philosophy plate needs 4:5 and needs to say "we choose" without
advertising anything, so it takes `x 300 → 687, y 90 → 574` — jars only.

That window is forced from three sides, and it is the only 4:5 this frame has:

- **Left**: the framed Samurai Weed board runs to x≈295 and carries per-strain THC
  figures. Any crop including its edge puts sliced-off percentages against the frame.
- **Top**: the wall certificate ends at y≈90. That is the one about Japanese growers
  in Chiang Mai which FACTS.md says we cannot read well enough to stand behind.
- **Bottom**: the watermark pill starts at y≈574.

The watermark spans x 224 → 580, so keeping it whole would mean pulling the left edge
back over the strain board — hence no watermark on this one. If the client wants the
mark on this plate, the fix is a fresh photograph, not a re-cut of this one.

At 387 × 484 it is also the softest file here: the plate renders about 548 px wide on
a 1240 px shell, so it is upscaled ~1.4×. A straight-on shot of the jar shelf at
camera resolution replaces it cleanly — it is on the list below.

## Why the menu plate is landscape

Both `.split__art` plates are 4:5 by default. The menu one carries
`.split__art--wide` and is 3:2, because the plant-wall photograph is a wide sign on a
wide wall: MAYA GREEN runs from 18% to 83% of the frame, so a 4:5 window — 418 px of
a 796 px original — cannot hold the wordmark at all. Every candidate crop slices it
mid-word. The photo is used essentially whole instead (`x 6 → 789`, full height), which
also means no upscaling: 783 px rendering at ~548 px.

Keeping the plate at 2:1 was the other option and was rejected — at that ratio it is
the same composition as `storefront-wide.jpg` on the index page, a gold wordmark on a
dark panel. The extra height is what makes it read as a different place: the living
wall around it, and the counter beneath.

## Watermarks and people

Most published files carry the shop's own "MAYA GREEN OFFICIAL" watermark, burned in
at the foot of the frame. Kept deliberately: it is the client's own mark and it
evidences provenance. Crops were chosen so it is never clipped mid-word.

Three do not show it — `brand-wall.jpg`, whose original was never watermarked, and
`storefront-wide.jpg` and `shelf-jars.jpg`, whose crops stop above the watermark.
(`logo-hero.jpg`, `hero-leaves.jpg` and `hero-dark.jpg` are artwork, not
photographs, so the question doesn't arise.) None is
a problem; just don't assume the mark is present when re-cropping.

`brand-wall.jpg` includes the counter below the sign, and among the objects on it are
two small picture frames holding photographs of people. They are decor inside the
client's own photograph and are a few pixels across — but if either is a customer
rather than family, crop the bottom band off before launch. A `y 0 → 442` cut drops
them and keeps the sign whole; the plate ratio would go with it.

`counter.jpg` shows an identifiable person in MAYA GREEN uniform. The client supplied
the photograph for use on their own site, which is consent for the shop's own staff —
but if that person is not the owner, confirm before launch. See the consent rule at
the bottom of this file.

## Re-cropping

Derivatives were produced from the originals in `assets/images/` by centre-cropping to
the target ratio, then JPEG q86 progressive, capped at 300 KB. There is no build step —
if a crop needs changing, re-cut it from the original and overwrite the file here.
**Source resolution is only ~800 px**, so nothing should be displayed much wider than
that; `.plate` is capped at 620 px for exactly this reason.

## Why we are not lifting these from Google Maps

The Google listing has photos, and it is tempting. We are not using them:

1. **Mixed ownership.** The listing has 114 reviews. Google place photos are a
   blend of owner uploads and customer uploads. Customer photos belong to those
   individuals — republishing them on the shop's own commercial site is
   infringement, and the risk lands on the shop, not on us.
2. **Google's terms.** Scraping Maps content and reusing Maps imagery outside
   Google Maps is against Google's terms of service.
3. **They are the worse file anyway.** Google serves downscaled, re-compressed
   derivatives from `lh3.googleusercontent.com`, and those URLs rotate and
   expire — hotlinking them would break the site silently, without warning.

Whatever the owner uploaded to Google, the owner still has the original of, at
full resolution. That is the file we want. Asking is faster than scraping.

## Still worth asking for

The gallery is full, but these would all be upgrades on what we have:

- **Higher-resolution originals of everything.** What we received tops out around
  800 px on the long edge — fine at current display sizes, with no headroom. The
  camera originals will be several times larger.
- **A straight-on evening shot of the plant wall with the neon on.**
  `brand-wall-hero.jpg` is the daylight version.
- **A wider shot of the frontage.** `storefront-wide.jpg` is cut from a near-square
  original, so the 2:1 crop has no room to spare above or below the fascia.
- **A close detail** — one jar, one label, hands. Texture, not product claims.
- **The jar shelf straight on, without the strain board in frame.** It would replace
  `shelf-jars.jpg`, which is cropped out of a corner of another photograph and is the
  one file on the site being upscaled.
- **The Samurai Weed certificate**, shot square on and legible. See FACTS.md: it
  appears to reference Japanese growers in Chiang Mai, which we cannot use until it
  can actually be read.

## Specs

- **Format**: JPEG or WebP. WebP is ~30% smaller at the same quality.
- **Size**: 1600px on the long edge is plenty. Keep each file under ~300 KB.
- **Crop**: supply at the ratio in the table, or wider — CSS crops to fill,
  so anything important must not sit near the edges.
- **No text baked into the image.** It cannot be translated or read aloud.

## When adding an image

- Keep `width` and `height` attributes on every `<img>` — they reserve the
  space so the page doesn't jump as photos load.
- Keep `loading="lazy"` on everything except the wide storefront shot if it
  ever moves above the fold.
- Write a real bilingual `alt`. Not "photo" — describe what is in the frame.
- **Do not photograph customers' faces** without their written consent, and do
  not use any photo that shows a person who has not agreed to appear on a
  public cannabis retail site.
