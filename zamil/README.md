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
  hooks/           reveal + scroll, list (cart), form submit
  components/      header, list drawer, search, age gate, toast, primitives
  sections/        one file per page section, in render order
  App.tsx          composes the page and owns list / overlay state
```
