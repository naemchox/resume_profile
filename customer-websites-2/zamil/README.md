# MAYA GREEN

Single-page site for **MAYA GREEN@Selected Cannabis Boutique** — Soi Pridi Banomyong 40,
Ekkamai, Bangkok. React + Vite + Tailwind.

Built on the ZAMIL storefront shell, with every placeholder replaced by the shop's real
data. The source of truth for that data is [`FACTS.md`](./FACTS.md): if a fact is not
listed there as CONFIRMED, it is not on the site.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview  # serve the build
```

## What is real

- **Identity** — name, address, phone `082 553 4873`, Instagram `@mayagreen.bangkok`,
  X `@MAYAGREEN420`. No Facebook / LINE / TikTok links: no accounts were found.
- **Hours** — Mon, Wed–Sun 12:00–23:00, **closed Tuesdays**. Confirmed from the shop's own
  Google Business Profile, and stated in the hero, the visit block, the footer and the
  structured data.
- **Menu** — the SAMURAI WEED board transcribed strain for strain: 8 strains, flat
  **฿700**, THC 18–29%. Plus the drink board: 20 items across 6 groups, ฿20–฿23,000.
- **Photography** — eight of the client's own photographs, in `public/img/`, each used
  exactly once on the page. The library is only seven distinct frames (`shelf-jars` is a
  second crop of the `shelf-samurai` frame), which is why the category tiles are
  typographic and the footer has no photo strip. `storefront-wide.jpg` was dropped: it was
  a 2:1 crop of `storefront-day.jpg`. Four further photographs the client supplied are
  unused; the reasons are in `FACTS.md`.
- **Positioning** — medical, GACP-certified Thai farm, partner farms `#samuraiweed` and
  `#izumogreenbangkok`, Japanese-owned and Japanese-operated.

## What changed from the ZAMIL shell, and why

- **Age gate is 20+, not 21+** — Thailand's legal age. It also states the ID requirement
  and the no-sale rule for pregnant and breastfeeding customers.
- **No checkout, no delivery.** The shop sells over the counter only. The cart is now a
  **list** you bring with you; its button explains where to bring it rather than
  pretending to take an order. The Delivery section is gone.
- **No medical claims.** Thailand's rules let a shop describe its sourcing, not advertise
  what cannabis treats. The old Benefits/FDA copy is replaced by the shop's own three
  standards, and the medical note says only that prescription questions are answered in
  store.
- **Testimonials and blog removed.** The shop's 5.0/114 Google rating is real but the
  quotes were not, and there are no articles. Nothing invented is left on the page.
- **Baht, not dollars** — one `baht()` / `priceLabel()` pair in `src/data.ts` formats
  every price, so ฿ and the per-gram / per-bottle unit can never drift between the menu,
  the search overlay and the list.

## The motion and graphic layer

The page had a decoration vocabulary and every item in it was set too faint to survive its
own blur — a haze at .30 alpha behind 60px of blur on a near-black field, a "texture" of
white dots at .03, ghost words at .09 stroke. All of it was in the stylesheet and none of
it was on screen, which is what made seven sections of the same eyebrow / serif heading /
grid read flat. The fix was to raise the exposure on what was already there and add the
three things it did not have: a mark used large, motion that belongs to this shop, and
numbers that arrive rather than sit.

- **`Aurora`** — the lounge's own cove lighting, three drifting pools (violet, green, gold)
  at three periods that never resynchronise. Replaces `.haze`.
- **`NeonLeafMark`** — the shop's leaf in neon *tube* rather than filled, straddling the
  shopfront photograph in screen blend. It strikes twice like a real transformer, then
  breathes. Also opens the age gate.
- **`Motes`** — twelve specks of light on a fixed table of positions and periods. Not
  `Math.random()`: a random field re-rolls every render and deals you four in one corner.
- **`WordReveal`** — headings set word by word out of a `clip-path` mask instead of a
  9th identical fade. The words are wrapped, not substituted; the heading still copies as
  a sentence.
- **`VineRule`** — the rule under every section title, drawn rather than printed: two stems
  out from the centre, a leaf on each, and the mark last. Path lengths are measured in an
  effect so the geometry can be edited without re-measuring by hand.
- **`useCountUp`** — the flat ฿700 and the eight THC arcs animate to their values. The
  screen-reader text always states the real figure, whatever the animation is showing.
- **Category tiles** carry the count as their own numeral with the leaf run off the corner,
  and a gold pool follows the cursor (`spotlight`). They were four dark boxes seven times
  the size of their own contents.

### What runs it

**Anime.js v4** drives everything with a sequence or a scroll position in it; CSS keeps
everything a compositor can run on its own forever. The split is in `src/motion.ts`.

| Anime.js | CSS |
| --- | --- |
| Hero arrival (one `createTimeline` — supporting copy, bullets, neon strike, hours card) | Aurora pools, motes, neon breathe |
| `WordReveal` heading staggers | Hover transitions, nav underline, image zoom |
| `PhotoFrame` corner brackets (timeline) | Every *starting* state — `.reveal`, `.word-mask`, `.bracket` |
| `VineRule` (`svg.createDrawable` — replaces a hand-rolled `getTotalLength()` + dash-offset dance) | |
| `Reveal` | |
| `useParallax` (`onScroll({ sync })` — replaces a hand-rolled rAF loop + scroll listener) | |

Bundle cost: **+56 kB raw, +21 kB gzipped**.

### Three things that bite, written down

Anime.js v4 fails **silently**. An animation with any of these reports itself as running,
ticks, and completes, having moved nothing — no error, no console warning:

1. **Percentages in transform shorthands.** `y: ['112%', '0%']` does nothing. Keep
   percentage start positions in CSS, where they work, and hand the library **numbers** —
   `WordReveal` measures its own line box at arrival and animates in px.
2. **`animate()` on a plain JS object.** The obvious one-liner for a counter. It did not
   tick: the price rendered ฿0 and all eight THC meters 0%. `useCountUp` is therefore a
   plain `requestAnimationFrame` loop on purpose — see the note in the file.
3. **`onScroll()` for enter triggers.** Its thresholds are resolved against the document as
   it was when the observer was built, and every observer here is built before the
   photographs below it have loaded. Above-the-fold reveals never fired for a visitor who
   landed and did not scroll — and scrolling re-measures, which is exactly why it survives
   casual testing. Reveals now fire on an `IntersectionObserver` (`onceInView` in
   `motion.ts`); `onScroll` still scrubs the parallax, where being tied to scroll position
   is the point, and is refreshed on `load`.

`prefers-reduced-motion` is honoured twice over: the rule at the top of `index.css`
collapses the CSS half, and every Anime.js call site checks `reducedMotion()` and jumps to
the end state with `utils.set` — a stylesheet cannot flatten a value a script computes.

## Before going live

1. **Confirm the ฿700 unit.** The board reads "ALL 700B" with no unit; the site says
   `/ g`, which is the normal reading — but get it in writing.
2. **Confirm the drink serving sizes.** Bottle vs glass is inferred from the board's group
   headings, not printed on it.
3. **Get the tasting notes approved.** The eight strain descriptions are marketing copy
   based on each strain's known character. They are not lab data and not the shop's words.
4. **Connect the message form.** Copy `.env.example` to `.env` and set
   `VITE_CONTACT_ENDPOINT`. Until then the form says so instead of pretending to send. The
   shop has no published email address, so Instagram DMs are the live channel.
5. **Set the real host.** `og:url` is absent and `og:image` is relative because there is
   no domain yet. Point both at the real host, and add a `<link rel="canonical">`.
6. **Licence number.** Not supplied. If the shop wants it on the page, ask for it — do not
   guess.
7. **Which house number is right?** `FACTS.md` has **984, 49** (from the Google Maps link in
   the shop's own Instagram bio) but the wall in the published photographs reads **984/48**,
   legibly, in both the day and night frontage shots. The site uses the confirmed one
   everywhere and the day caption no longer states a number at all. A visitor navigating to
   a walk-in shop cannot be given two — ask, then fix `src/data.ts` and the JSON-LD together.
8. **Say what the contact form does with a name and an email.** There is no privacy line
   anywhere on the page. Either add one next to the form, or drop the form and leave
   Instagram DMs as the channel — which is what the copy already tells people to use.
9. **Verify the drink prices against the board.** The eight strains and their THC figures
   were re-read directly from `public/img/shelf-samurai.jpg` and match. The 20 drinks were
   only checked against `FACTS.md`; the drink board photograph lives in the other repo
   (`customer-websites/Maya Green/assets/images/menu_drink.png`) and has not been re-read
   here.
10. **Two photographs publish facts the copy withholds.** `shelf-samurai.jpg` shows the
   framed certificate above the board — "Japanese companies in Chiang Mai / High quality
   cannabis produced by Japanese growers" is legible in it, and `FACTS.md` says not to make
   a Chiang Mai origin claim until the client confirms the wording. `storefront-night.jpg`
   and `terrace.jpg` both show the A-board reading "2025.12 NEW OPEN!!". Either confirm
   those two facts and put them in the copy, or crop the photographs.
11. **Consent for the counter photograph.** `counter.jpg` shows an identifiable person. It
   is the shop's own marketing image, but get their sign-off for web use. The night
   frontage also has a legible car registration plate in the lower left.
12. **Don't publish the unconfirmed claims.** Two levels, a cafe, the Chiang Mai grower
   certificate, the December 2025 opening date, the pre-roll board: all listed in
   `FACTS.md` as unconfirmed or held back.

## Layout

```
src/
  data.ts          identity, hours, menu, formatting — edit copy here
  images.ts        photo slots -> files in public/img/
  motion.ts        the motion vocabulary: eases, onceInView, reduced-motion check
  hooks/           reveal + scroll, parallax, count-up, spotlight, list, form
  components/      header, list drawer, search, age gate, toast, primitives,
                   and the motion layer: Aurora, Motes, NeonLeafMark,
                   WordReveal, VineRule, PhotoFrame
  sections/        one file per page section, in render order
  App.tsx          composes the page and owns list / overlay state
```
