---
name: website-building
description: >
  Step-by-step process for building a website end-to-end, with the UX/UI design guidance
  that matters at each step embedded inline. Read it top-to-bottom: each step tells you what
  to BUILD and, right beside it, the UX/UI DESIGN that step needs (e.g. the button step
  carries the full button design spec). Full-stack: plan → tokens → layout → components →
  states → data → backend → auth → commerce → motion → a11y → responsive → perf/SEO →
  deploy → test/ship. For exhaustive topic detail, see the companion reference frontend.md.
metadata:
  type: reference
  scope: full-stack build sequence (design + engineering)
  version_baseline: mid-2026
---

# Building a Website — the steps, with UX/UI design at each step

> **How to read this.** This is the *sequence*. Work the steps in order. Every step has the
> same shape:
> - **Build** — the concrete engineering actions.
> - **🎨 UX/UI design at this step** — the design knowledge that attaches *here*. This is the
>   point of the document: design isn't a separate phase, it's embedded in each step.
> - **Done when** — move on once these are true.
>
> Each step ends with `← frontend.md §X` pointing to the deep topic reference for the long
> tail. Don't make the user choose low-level defaults this doc already answers — make the
> call, state it, proceed. Some steps (backend, deploy) genuinely have little UX/UI; those
> sections stay short rather than padded.

**The 16 steps**

| # | Step | The UX/UI design it carries |
|---|---|---|
| 1 | Plan & define | IA, user flows, content hierarchy, navigation model |
| 2 | Scaffold + design foundations | **The design system**: tokens, color, type, spacing, radius, elevation |
| 3 | Layout & page shell | Grid, whitespace, alignment, responsive layout |
| 4 | Core UI components | **Per-component design** (buttons, inputs, forms, cards, nav, overlays, icons) |
| 5 | Compose pages/sections | Section patterns, focal point, premium-vs-amateur tells |
| 6 | UI states | Loading / empty / error+retry / success |
| 7 | Client state & data | Optimistic-update UX, perceived performance |
| 8 | Backend & APIs | (thin) error contract → user messages, latency budgets |
| 9 | Auth & accounts | Accessible auth, login/signup form UX |
| 10 | E-commerce | Low-friction checkout, cart states, trust signals |
| 11 | Motion & interaction | Timing/easing, purposeful motion, reduced-motion |
| 12 | Accessibility pass | Focus, target size, landmarks — a11y *is* UX |
| 13 | Responsive & mobile | Mobile-first, touch targets, responsive images |
| 14 | Performance & SEO | Perceived performance, CLS = visual stability |
| 15 | Deploy & infra (+ i18n) | (thin) RTL/locale layout mirroring |
| 16 | Test & ship | Visual Quality Bar + Pre-Ship checklist |

---

## Step 1 — Plan & define the site

**Build**
1. **Classify the site type:** marketing/landing · blog/content · docs · dashboard/app ·
   e-commerce · portfolio. This drives nearly every later choice.
2. **Infer requirements** (don't interrogate): SEO-critical? auth-walled? interactive vs
   static? global audience? content source (CMS/MD/DB)? JS budget? Ask one crisp question
   only if an answer changes the *architecture*; else pick a sensible default and note it.
3. **Choose stack + rendering** from the site type:
   - marketing/blog/docs → **Astro** (SSG + islands), near-zero JS, best CWV/SEO.
   - dashboard/app → **Next.js (App Router)** or React Router 7, SSR/CSR.
   - e-commerce → **Next.js**, PPR/ISR + streaming + edge.
   - Default stack: TypeScript (strict) · Tailwind v4 · shadcn/ui · Lucide · TanStack Query
     or RSC · Zustand · React Hook Form + Zod · Motion · Vitest + Playwright · Vercel.
4. **Draw the sitemap / IA** — pages, routes, and how they nest.
5. **Derive the section list from the client, not from the industry** — see below. This is
   the step that decides whether the finished site reads as designed or as generated.

**🧱 Where the sections come from — go and count the competitors first**

*(written 23 Aug 2026, after getting this wrong in this same file earlier the same day)*

Everything in Step 5 governs *how* a section presents its content. Nothing used to govern
*which sections exist*, so the list defaulted to "the content categories a business of this
type has" — derivable from the industry name alone, which is exactly what makes a page read
as machine-written.

The first attempt to fix that was worse than the gap. It invented three rules — cap the site
at 8 blocks, allow at most two of reviews/FAQ/location, prefer "argument" blocks over
"category" blocks — from six demos inside this repo, **without opening a single real site in
the industry**. Then real Thai clinic sites were measured:

| block | ราชเทวี | Timeless | รมย์รวินท์ | APEX | SLC | has it |
|---|---|---|---|---|---|---|
| promotions | ✓ | ✓ | ✓ | ✓ | ✓ | **5/5** |
| customer reviews | ✓ | ✓ | ✓ | ✓ | ✓ | **5/5** |
| articles / knowledge | ✓ | ✓ | ✓ | ✓ | ✓ | **5/5** |
| branches / location | ✓ | ✓ | ✓ | ✓ | ✓ | **5/5** |
| one page per treatment | ✓ | ✓ (18) | ✓ | ✓ | ✓ | **5/5** |
| popular services | ✓ | ✓ | — | ✓ | — | 3/5 |
| membership / sign-up | ✓ | — | ✓ | — | ✓ | 3/5 |
| news | ✓ | — | ✓ | — | ✓ | 3/5 |
| doctor team | — | — | — | ✓ | ✓ | 2/5 |
| Q&A / FAQ | ✓ | — | — | — | ✓ | 2/5 |
| real customers / KOL | — | ✓ | ✓ | — | — | 2/5 |
| online booking | — | — | — | — | ✓ | 1/5 |
| online shop | ✓ | — | — | — | — | 1/5 |

Every invented rule was contradicted. The cap said 8; ราชเทวี runs 12 sections and Timeless
runs 18 treatment pages. The trio rule said drop one of reviews/FAQ/location; 5/5 carry
reviews and 5/5 carry location. The advice that came out of it — *cut the review block from
the clinic demo* — would have made the demo worse than every real competitor, and it missed
promotions and machine/knowledge pages entirely, which 5/5 of the market runs.

And the profile is **not transferable between industries**. Measured on Thai restaurant sites
(สมบูรณ์โภชนา, MK): menu · branches · booking or delivery · promotions · membership — and
**neither site has a review page or an FAQ at all**. A rule derived from clinics would be
wrong for restaurants in exactly the same way.

**The rule this replaces all of them with**

1. **Before drawing the sitemap, open at least five real competitor sites** in the same
   industry *and the same market* (Thai clients → Thai sites; a US template is a different
   market with different expectations). List every navigation item and every homepage
   section from each, verbatim, and count how many of the five carry each one. That count
   table is a required Step 1 artefact — not a paragraph of reasoning about what buyers
   probably want.
   **Render the pages — do not read them as text.** A fetch-to-markdown tool strips every
   image before you see it, so a text-based sweep can only ever report the nav labels and
   headings. Run it and you will "find" the promotions page and the review page, because
   those are words in a menu, and you will completely miss the customer-photo collage, the
   price chips stamped on banner images, and the forum-screenshot proof block, because none
   of those carry text. That happened on 23 Aug 2026: a five-site clinic sweep produced a
   correct page inventory and missed that all five are image-led — the client had to point
   it out from having simply looked at the sites. Open them in a real browser, screenshot
   them, count the images. **And whenever a finding does come from text only, say so in the
   report**, so the reader knows what it could not have seen.
   **Count two things, not one.** Which pages exist *and what is on them* — for every block,
   record how many images it carries, and what instrument it uses (photo grid / price
   banner / table / screenshot of a review / machine shot / interactive picker). A page
   inventory alone produces the right skeleton with nothing on it. Measured 23 Aug 2026 on a
   clinic rebuild: the sitemap matched the market on all five mandatory blocks and the
   finished home page still carried **zero images**, because the table never recorded that
   every competitor's home page is image-led. If a block type carries an image at every
   competitor, it carries an image here. Not the same count — but not zero.
2. **Read the counts, do not overrule them.**
   - **4–5 of 5 → mandatory.** This is what the market treats as the price of being taken
     seriously. Leaving it out does not read as focus, it reads as an incomplete site.
   - **2–3 of 5 → optional.** Decide from what this client actually has.
   - **0–1 of 5 → the open ground.** This is where a site becomes distinctive, and it is
     worth more than any amount of rearranging the mandatory blocks.
3. **No fixed cap — but the number has to be defensible, not padded and not starved.** There
   is no correct block count to hit; there is a test every block has to pass. Each one must
   trace to exactly one of three things: the count table's 4–5 band (the market requires it),
   a fact about this client that you had to ask the owner for, or a deliberate pick from the
   0–1 band. **A block that traces to none of the three is padding — cut it.** And a site
   missing anything in the 4–5 band is starved, however tidy it looks. Write the trace next
   to each block in the sitemap; if the traces are honest, the count lands where the industry
   and the client put it, which is the only number that was ever right.
   Deciding what a *package* includes is a separate, later, commercial decision — never make
   it by quietly trimming the sitemap while designing.
4. **Differentiation lives in two places, and neither is subtraction.** Executing a mandatory
   block better than the competitors do (their review block is a wall of screenshots; yours
   aggregates four platforms with the source visible), and adding the blocks in the 0–1 band.
   A block that only this client can fill — one that traces to a fact you had to ask the
   owner for — is worth more than five that any competitor could copy.
5. **Match the page to its update clock.** Content that changes on its own schedule needs its
   own page, not a section inside another one. Clinic promotions change monthly and equipment
   changes as new machines land; both are separate pages in the real sites for that reason.
   A section buried in a long homepage cannot be updated, linked or advertised on its own.
6. **List what you cut, and why.** Nothing cut still means the template was copied — but cut
   against the count table, not against a quota.

**🚦 Before you call it done — the machine gates do not answer this question**

Technical audits (frame rate, tap targets, font size, overflow, link checks) answer *does it
work*. None of them answers *is it finished*. Passing them all and declaring the build
complete is how a clinic home page with no images on it got handed over on 23 Aug 2026.
Green gates are a floor, not a verdict.

Before the word "done" is used, do all three:
- **Put it beside a real competitor**, same viewport, and look at both. Not the count table —
  the actual rendered pages. Anything the competitor's page has that yours does not, name it
  out loud and say whether it was a decision or an omission.
- **Walk every page of the build as the client's customer would**, not as its author. Every
  block that a reader would expect to show something must actually show it.
- **Say what is still missing before handing it over.** A build presented as finished, that
  the person receiving it can see is unfinished in five seconds, costs more trust than one
  presented honestly as partial.

**⚠️ No detector yet.** `playbook/audit-sameness.mjs` compares class vocabulary — the
presentation axis — and its own header notes it cannot catch "same structure, renamed
classes", which is this failure exactly. There is also no detector for "was the competitor
count table actually produced". Until both exist, this is enforced by the artefact in rule 1
being present in the brief. A rule with no detector is a rule that gets skipped silently;
treat this paragraph as a debt, not as coverage.

**🎨 UX/UI design at this step**
- **Information architecture:** group content the way *users* think, not the way the
  database is shaped. Aim for a shallow tree — most pages reachable in ≤3 clicks.
- **User flows:** sketch the primary journey (e.g. land → browse → detail → convert) before
  any page. Every page should have one job and a clear next action.
- **Content hierarchy:** decide, per page, the single most important thing (the focal
  point). Everything else is secondary/tertiary. This decision drives layout in Step 3.
- **Navigation model:** pick it now — top nav (≤7 items), sidebar (apps/docs), or hub-and-
  spoke (mobile). Label by user vocabulary, not internal jargon.

**Done when** you have a site type, a chosen stack (stated), a competitor count table from at
least five real sites in the same industry and market, a sitemap that carries everything in
that table's 4–5 band plus at least one block from its 0–1 band, a written cut list, and the
primary user flow with one focal point per page.
`← frontend.md §0–1`

---

## Step 2 — Scaffold project & establish design foundations (tokens)

> This is where the **design system** is born. Establish tokens and scales *before* building
> any component — consistency comes from systems, not taste. Design in **grayscale first**;
> add color last so hierarchy is forced by spacing/size/contrast.

**Build**
1. Scaffold the canonical structure:
   ```
   src/
     app/ or routes/        # file-based routing
     components/ui/         # primitives (shadcn lives here)
     components/<feature>/  # composed components
     lib/                   # utils (cn(), fetchers), API clients
     hooks/  stores/  schemas/  types/
     styles/globals.css     # tokens, @theme, base layers
     content/               # MD/MDX (content sites)
   public/                  # static assets, fonts
   ```
2. Install the stack; set up Tailwind v4 (`@import "tailwindcss";` + `@theme {…}`).
3. Define **design tokens** in `globals.css` (the backbone of theming).

**🎨 UX/UI design at this step**
- **3-tier token taxonomy** — components consume only semantic/component tokens, never raw
  primitives:
  1. *Primitive:* `--blue-500: oklch(0.62 0.19 255)`, `--space-4: 1rem`.
  2. *Semantic:* `--color-bg`, `--color-text`, `--color-interactive: var(--blue-500)`.
  3. *Component:* `--button-bg: var(--color-interactive)`.
- **Color system** — define in **OKLCH** (perceptually uniform, P3). You need: one primary,
  a full **neutral ramp with *subtle* saturation** (pure gray looks dead), and semantic
  success/warning/error/info — each 5–9 shades (`50–950`, 500 ≈ base). **60-30-10 rule:**
  60% dominant surface, 30% secondary, 10% accent. Name tokens by intent
  (`action-primary`, `text-muted`), never literal (`blue-500`). Pair surfaces with a
  `-foreground` (shadcn convention).
- **Type scale** — one modular scale (~1.25 ratio). Hierarchy via **weight + color**, not
  size alone (dark = primary, medium-gray = secondary). Body ≥16px; line-height inverse to
  size (body 1.5–1.7, headings 1.1–1.3); measure 45–75 chars (`max-width: ~66ch`). One
  display + one body font, ≤3 weights.
- **Spacing scale** — constrained, non-linear: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96px`.
  Nothing eyeballed. Inconsistent spacing is the #1 reason dev UIs look "off."
- **Radius** — one system; nested radius = inner + padding.
- **Elevation** — one scale (sm/md/lg/xl); light from above (shadow below); two-part shadows
  (tight + diffuse) read naturally.
- **Dark mode** = a second set of semantic→primitive mappings toggled via
  `data-theme` (+ `color-scheme: light dark`). Never pure `#000`.

**Done when** `globals.css` has tokens + type/spacing/radius/elevation scales, and you could
restyle the whole site by editing only semantic tokens.
`← frontend.md §2.4, §5`

---

## Step 3 — Layout & page shell

**Build**
1. Build the page skeleton with **semantic landmarks**: `<header><nav><main><aside><footer>`
   (one `<main>`). Add a skip link.
2. Lay out with **CSS Grid** (2D/page) + **Flexbox** (1D/component). Use **subgrid** to align
   nested card content.
3. Make the grid fluid to minimize breakpoints:
   ```css
   .grid { display:grid; gap:1rem;
     grid-template-columns: repeat(auto-fit, minmax(min(100%,16rem), 1fr)); }
   ```

**🎨 UX/UI design at this step**
- **Grid & alignment** — align *everything* to a shared grid; misalignment is the loudest
  amateur tell. Use logical properties (`margin-inline`, `padding-block`) for RTL safety.
- **Whitespace** — add **more than feels necessary**; generous whitespace raises perceived
  quality/luxury and creates hierarchy for free. Bigger elements need more surrounding space.
- **Container queries for reusable components, media queries for page regions.** A card that
  restyles by its *parent's* width (`container-type: inline-size`) is truly portable.
- **Bento grids** — modular varied-size card grids for feature showcases/dashboards (durable
  2025/26 aesthetic). One focal cell per grid.
- 3–5 content-driven breakpoints (~480 / 768 / 1024 / 1280); `dvh/svh` for mobile chrome.

**Done when** the shell is responsive 320px→wide with correct landmarks, a skip link, and no
horizontal scroll.
`← frontend.md §2.5, §5, §10`

---

## Step 4 — Build core UI components (per-component design)

> The heart of the request: **each component carries its own UX/UI design spec, inline.**
> Build primitives into `components/ui/`, semantic-HTML-first, accessible by default. Use
> **cva**/tailwind-variants for type-safe variants. Below, every component lists its design.

### 4a. Buttons
**Build** — a `<button>` (or `<a>` styled as button for navigation) with variants/sizes/states
via cva.
**🎨 Design**
- **Variants (intent):** `primary` (one per view — the main action), `secondary`, `ghost`/
  `tertiary` (low emphasis), `destructive` (irreversible actions, needs confirm), `link`.
- **Sizes:** from your spacing scale — `sm / md / lg`; md ≈ `px-4 py-2`, text-base.
- **All states (never skip any):** `default · hover · active/pressed · focus-visible
  (2px outline, 2px offset — never remove without a replacement) · disabled (reduced
  contrast + `aria-disabled`, not just opacity) · loading (spinner + keep width, disable,
  announce)`.
- **Target size** ≥ 24×24 CSS px (WCAG 2.5.8); aim 44–48px on touch; ≥8px apart.
- **Labels:** verb-first, specific ("Save changes", not "Submit"/"OK"). Icon-only buttons
  need an `aria-label`. Don't rely on color alone to signal destructive — add an icon/word.

### 4b. Inputs & form fields
**Build** — `<label htmlFor>` + `<input>`/`<textarea>`/`<select>`, help text, error slot.
**🎨 Design**
- Always a **visible label** (placeholder is not a label — it vanishes on type). Order:
  label → input → help text → error.
- **States:** default · focus · filled · invalid (`aria-invalid` + red border *plus* an icon/
  message — not color alone) · disabled · read-only.
- Use placeholder for *format hints* only ("MM/YY"). `field-sizing: content` for auto-grow.

### 4c. Forms
**Build** — React Hook Form + Zod (`zodResolver`, `mode:'onBlur'`); reuse the same Zod schema
on the server.
**🎨 Design**
- **Layout:** single column (fastest to complete); group related fields with `<fieldset>`/
  `<legend>`; one primary submit.
- **Validation timing:** validate on **blur or after first submit** — don't nag while typing.
  Say *how to fix*, preserve input, move focus to the first error on submit, use a live region
  (`role="status"`/`alert`).

### 4d. Cards
**Build** — a container with optional media/header/body/footer (compound: `<Card><Card.Header/></Card>`).
**🎨 Design** — consistent elevation from the scale; nested radius = outer − padding; one clear
tap/click target per card; don't nest interactive elements ambiguously.

### 4e. Navigation
**Build** — navbar / sidebar / mobile drawer / breadcrumbs, all from `<nav>` + `<a href>`
(crawlable links, not `onClick` spans).
**🎨 Design** — mark the current item (`aria-current="page"`); ≤7 top-level items; mobile nav
≥44px targets; breadcrumbs for deep IA; sticky headers must not obscure focus (WCAG 2.4.11).

### 4f. Overlays (modal / dialog / popover / toast)
**Build** — use a headless primitive (Radix) via shadcn.
**🎨 Design** — **trap focus** inside, **return focus** to the trigger on close, Esc to dismiss,
backdrop click optional; lock body scroll (`:root:has(dialog[open]){overflow:hidden}`).
**Glassmorphism** (blur) only *restrained*, to signal layering over rich backgrounds.

### 4g. Icons
**Build** — **Lucide** (shadcn-native).
**🎨 Design** — one family, one stroke width (2px), sizes from your scale (`absoluteStrokeWidth`
for constant stroke across sizes). Decorative icons `aria-hidden`; meaningful icons get a label.

**Done when** primitives exist with all variants/sizes/**states**, keyboard-operable, and a
single button can't appear two different ways on two pages.
`← frontend.md §3, §5.1–5.3, §6, §9`

---

## Step 5 — Compose pages & sections

**Build** — assemble primitives into sections: hero, feature blocks, social proof, CTA,
footer. Keep content in digestible chunks.

**🎨 UX/UI design at this step**
- **One focal point per screen** — a single clear hero/CTA; everything else supports it.
- **Premium tells:** ruthless consistency (same buttons/spacing/fonts everywhere — the
  biggest tell), generous whitespace, purposeful motion, high-quality consistent imagery,
  refined details (aligned edges, optical centering, consistent icon stroke).
- **Amateur tells to avoid:** mismatched headings, random spacing, per-page button styles,
  everything competing for attention, text overload, untouched browser defaults.
- **Expressive typography** can be the hero element — pair big type with restraint elsewhere.
- **No orphan in a grid** — count the items BEFORE choosing the column count. 4 items in a
  3-column grid = three across and one stranded alone on a second row, with two card-widths of
  empty space beside it; the section reads as broken, not as breathing room. Same for 5-in-3,
  7-in-3, 3-in-2. Fixes, in order of preference:
  1. **Match the columns to the count** — 4 items → `repeat(2, 1fr)` (a 2×2 block) or four
     across; 6 items → 3×2. The layout should be a full rectangle.
  2. **Change the item count** — merge two weak items or add a real fifth/sixth one. An orphan
     is often the content telling you the list is the wrong length.
  3. **Let the last row fill** — `grid-template-columns: repeat(auto-fit, minmax(Xrem, 1fr))`,
     or span the orphan across the remaining tracks, so no dead half-row appears.
  Do NOT "fix" it by centring the orphan — a centred lone card still breaks the left edge every
  other card aligns to. Re-check at every breakpoint: a 4-item grid that is balanced at 3
  columns' desktop width becomes 2+2 (fine) at tablet and 4×1 (fine) at mobile, but a 5-item one
  is broken at both 3 and 2 — walk all three widths, not just the one you designed at.
- **Share the shell and the hero; never share the interior** — the hero pattern (full-bleed
  photo, headline, one primary + one secondary button) is a solved problem and reusing it across
  projects is fine — visitors do not compare two clients' front pages side by side. What must not
  repeat is everything *below* it: the instrument each section uses to present its content, and
  the detail language that runs through them. Measured on this repo (21 Aug 2026), two demos in
  different industries shared **78%** of their interior class vocabulary with the hero excluded —
  the same `section-head + kicker` → `cards` → `steps` → `facts` → `stat-row` chain in both, so a
  visitor who scrolls meets the same page twice.
  - **Pick a different instrument per data type, per project.** A list of prices is not a grid of
    cards; a sequence is not a grid; a comparison is a table; a location is a drawn map; a
    capacity question is a calendar. If every section of two projects is "three cards in a row",
    neither interior was designed — the data was poured into whatever container was already open.
  - **Give each project one detail signature and run it everywhere.** The strongest example in
    this repo is a boutique page whose leaf glyph appears as list bullets, as the divider under
    every heading, as the favicon and as a watermark behind the photo; whose product rows carry a
    circular percentage badge; whose section titles sit against outline display type used as
    background art. None of that is the hero — it is what the page does with the next 8,000
    pixels, and it is why that page is never mistaken for the others.
  - **Interaction is part of the interior.** A page the visitor can *operate* — filter the list,
    add to a list, see a running count in the header — reads as a different product from a page
    they can only scroll, even under an identical hero. Ask what the visitor would want to *do*
    on this page, not only what they should read.
  - **Automate the check.** A rule with no detector is a rule that gets skipped silently — this
    one was written down and skipped anyway. Compare each pair of projects' class vocabulary with
    the shared shell *and the hero* excluded, and fail over ~50%. See `playbook/audit-sameness.mjs`.
- **Reusable prompt for this class of fix** —
  > "Ignore the hero. List the presentation instrument each section of `<page A>` and `<page B>`
  > uses (cards / table / list-with-leaders / timeline / map / calendar / gallery), side by side.
  > Where both pages use the same instrument for different kinds of data, propose the instrument
  > that actually fits `<page B>`'s data, and name one detail motif for `<page B>` that can repeat
  > across its dividers, bullets, badges and empty states."
- **Reusable prompt for this class of fix** —
  > "This grid is unbalanced — `<N>` items in `<M>` columns leaves `<k>` stranded on the last
  > row. Rebalance so the block is a full rectangle: change the column count to divide `<N>`
  > evenly, or make the last row fill its track. Don't just centre the leftover item. Then check
  > desktop / tablet / mobile widths and tell me the count-per-row at each."

**Done when** each page reads as one coherent system with a single focal point, no section
competing for attention, every grid ends on a full row at every breakpoint, and the page's
skeleton is recognisably *not* the previous project's.
`← frontend.md §5.1–5.2`

---

## Step 6 — UI states (never skip these)

> AI-built frontends almost always omit these; they are part of "done."

**Build** — standardize reusable `LoadingSkeleton` / `EmptyState` / `ErrorMessage` /
`RetryButton`.

**🎨 UX/UI design at this step**
- **Loading → skeleton screens** that mirror the final layout (cuts perceived load ~30%,
  prevents CLS) over spinners.
- **Empty states** — explain what goes here + a primary action; differentiate "no data yet"
  from "no results."
- **Error states** — plain-language cause + how to fix + a **retry**; preserve user input;
  never dump stack traces.
- **Success/feedback** — confirm completion (toast / inline check / state change).

**Done when** every async surface has loading, empty, error+retry, and success states.
`← frontend.md §6`

---

## Step 7 — Client state & data fetching

**Build**
1. **Classify state first:** server (remote cache) → TanStack Query / RSC `fetch`;
   global client/UI → **Zustand**; local → `useState`; URL (filters/tabs/search) → search
   params / nuqs.
2. Fetch in async Server Components (Next) or `useQuery`; mutate via Server Actions /
   `onMutate`. Parallelize promises (`Promise.all`) to avoid waterfalls. Never store derived
   state — compute it.

**🎨 UX/UI design at this step**
- **Optimistic updates** — write the change immediately, roll back on error; the UI should
  feel instant. (`useOptimistic` / Query `onMutate` → rollback `onError` → invalidate
  `onSettled`.)
- **Perceived performance** — show skeletons (Step 6) the moment a fetch starts; stream slow
  sections with `<Suspense>` so fast content isn't blocked.

**Done when** state is correctly classified, mutations feel instant, and no fetch waterfalls.
`← frontend.md §7`

---

## Step 8 — Backend & APIs

**Build** — REST or GraphQL; model the data; Server Actions / route handlers; **share the Zod
schema** between client resolver and server (`schema.parse`) so validation can't drift; add
rate-limiting and caching where needed.

**🎨 UX/UI design at this step** *(thin — backend is mostly invisible, but two things shape UX)*
- **Error contract → user messages:** return structured, mappable errors (field + code) so the
  frontend can show *specific, fixable* messages instead of "something went wrong."
- **Latency budgets:** decide what must be fast (interactions <200ms feel instant) vs what can
  stream; this dictates which Step-6 loading state each call needs.

**Done when** endpoints validate with the shared schema and return errors the UI can turn into
clear, fixable messages.
`← frontend.md §7.4`

---

## Step 9 — Auth & accounts

**Build** — session or JWT auth, protected routes/middleware (Next 16: `proxy.ts`), login /
signup / reset flows; never put secrets in the client bundle.

**🎨 UX/UI design at this step**
- **Accessible authentication (WCAG 3.3.8):** allow paste and password managers; don't block
  autofill; offer a "show password" toggle. Don't require cognitive puzzles to log in.
- **Login/signup form UX:** minimal fields, inline validation (Step 4c), clear distinction
  between "wrong password" and "no such account" *without* leaking which (security) — a
  single generic-but-actionable message.
- **Auth error & loading states:** disable submit + spinner while authenticating; preserve the
  entered email on failure; obvious path to reset.

**Done when** auth flows are keyboard- and password-manager-friendly, with clear error/loading
states and no secrets client-side.
`← frontend.md §9`

---

## Step 10 — E-commerce (if applicable)

**Build** — product schema, cart, checkout flow, payment gateway, order confirmation; render
product pages SSR/SSG for SEO, keep cart/price dynamic (PPR/streaming/edge).

**🎨 UX/UI design at this step**
- **Low-friction checkout:** as few steps/fields as possible; allow guest checkout; show a
  progress indicator; never surprise with costs late (show shipping/total early).
- **Cart states:** empty cart (with a path back to browse), item added (toast/mini-cart),
  out-of-stock, quantity update — all from Step 6's state set.
- **Trust signals:** visible security/payment badges, clear return policy, real product
  imagery; reduce anxiety at the payment step.

**Done when** a guest can go land → product → cart → pay with no dead ends and all cart states
handled.
`← frontend.md §1.3, §7`

---

## Step 11 — Motion & interaction

**Build** — CSS first; reach for **Motion** (ex-Framer Motion) only for enter/exit, layout
animations, gestures.

**🎨 UX/UI design at this step**
- **Animate only `transform` and `opacity`** (GPU; no reflow). Never animate
  `width/height/top/left/margin`. Avoid `transition: all`.
- **Timing/easing:** 150–400ms (~150ms snappy, >500ms sluggish). `ease-out` entrances,
  `ease-in` exits, `ease-in-out` moves; `linear` only for spinners.
- **Purposeful, not decorative** — motion should guide attention or confirm an action, never
  just embellish.
- **`prefers-reduced-motion` is mandatory** — drop decorative motion, keep meaning-bearing
  motion reduced; offer fade as an alternative. **View Transitions API** (Baseline
  same-document) for smooth route/state changes, with a no-API fallback.

**Done when** motion is transform/opacity-only, ≤400ms, purposeful, and fully respects
reduced-motion.
`← frontend.md §8`

---

## Step 12 — Accessibility pass (WCAG 2.2 AA)

> a11y **is** UX. Build to WCAG 2.2 AA (WCAG 3.0 is draft — don't target it).

**Build / verify**
- **Semantic HTML first** (`button`, `a href`, `nav`, headings, `label`, `table`) for free
  roles/keyboard/focus.
- **ARIA 5 rules:** prefer native HTML; don't override native semantics; interactive ARIA must
  be keyboard-operable; don't `aria-hidden` a focusable element; every interactive element has
  an accessible name. "No ARIA > bad ARIA."

**🎨 UX/UI design at this step**
- **Keyboard & focus:** everything reachable/operable; visible `:focus-visible` (2px outline,
  2px offset); logical tab order; trap focus in modals and **return it**; manage focus on SPA
  route changes.
- **Target size ≥ 24×24 px** (2.5.8); focus not obscured by sticky bars (2.4.11); single-pointer
  alternative to drag (2.5.7).
- **Contrast:** 4.5:1 text / 3:1 large / 3:1 UI; **never color alone** (links need underline).
- **Alt text:** descriptive for meaningful images, `alt=""` for decorative.
- **Test:** axe DevTools + Lighthouse, **plus** a manual keyboard pass, 200–400% zoom,
  forced-colors, and a real screen reader (automation catches only ~30–40%).

**Done when** axe/Lighthouse are clean, keyboard-only works end-to-end, focus is always visible,
and a screen-reader sanity pass succeeds.
`← frontend.md §9`

---

## Step 13 — Responsive & mobile pass

**Build** — verify 320px → ultrawide; container queries for portable components; fluid grids /
`clamp()` to minimize breakpoints; `<meta viewport … viewport-fit=cover>` (never
`user-scalable=no`); `env(safe-area-inset-*)` for notches; `dvh/svh`.

**🎨 UX/UI design at this step**
- **Mobile-first** — design smallest screen first (>60% of traffic), enhance up.
- **Touch targets** — comfortable 44–48px, **24px floor**, ≥8px apart.
- **Responsive images** — `srcset`+`sizes` for resolution; `<picture>` for art direction /
  format (AVIF→WebP→JPEG); always set width/height (anti-CLS); `loading="lazy"` below the
  fold; `fetchpriority="high"` on the LCP image.

- **Alignment survives what the breakpoint hides** — a row usually gets its spacing from ONE
  element (`margin-inline-start:auto`, a `flex:1` spacer, a `grid-column`). Hide that element on
  mobile and the push dies with it: everything left of it slides back and the right edge of the
  screen is dead space. After every `display:none` inside a media query, ask what alignment that
  element was carrying and re-hang it on whatever is now last in the row. Real case (21/8/26):
  `.nav-links{margin-inline-start:auto}` pushed the header actions right; the ≤960px block hid the
  links, so the theme toggle and burger drifted back against the logo — fixed by
  `.nav-actions{margin-inline-start:auto}` inside the same block.
- **Reusable prompt for this class of fix** —
  > "On mobile, `<element>` should sit at the `<left|right>` edge of the screen instead of
  > `<where it sits now>`. Fix it in the media query that already handles this breakpoint (don't
  > add a new one), and check whether the alignment was being carried by an element that
  > breakpoint hides. Apply the same fix to every page sharing the stylesheet, bump the `?v=`,
  > and verify at 390px before saying it's done."

**Done when** there's no horizontal scroll at any width, targets meet the floor, images are
responsive and stable, and nothing that was flush to an edge on desktop has drifted inward on
mobile.
`← frontend.md §2.5, §10`

---

## Step 14 — Performance & SEO

**Build / verify**
- **Core Web Vitals (p75):** LCP ≤2.5s · INP ≤200ms · CLS ≤0.1. Don't lazy-load the LCP image;
  `fetchpriority="high"` + preload it; break up long tasks; reserve space for media/ads.
- **Ship less JS** — code-split, tree-shake, push `'use client'` deep (RSC),
  `optimizePackageImports`. Self-host + subset fonts (`display:swap`).
- **SEO:** one `<h1>`, crawlable `<a href>`, unique `<title>`/description, Open Graph + Twitter
  image (1200×630), canonical, sitemap.xml + robots.txt, JSON-LD for visible content. **Render
  SSR/SSG/PPR for SEO** — CSR is weakest. Next: Metadata API / `generateMetadata`.

**🎨 UX/UI design at this step**
- **Perceived performance** — skeletons (Step 6) and streaming make the app *feel* fast even
  when data is slow; perception matters as much as the number.
- **CLS is a design quality signal** — visual stability (no jumping layout) reads as polish;
  always size media and reserve space.

**Done when** CWV pass in Lighthouse/field data, metadata is server-rendered, and the layout
never shifts on load.
`← frontend.md §11–12`

---

## Step 15 — Deploy & infra (+ i18n)

**Build** — pick the platform (Vercel for Next, Cloudflare for global edge, Netlify for
JAMstack); scope env vars per environment (`NEXT_PUBLIC_`/`VITE_` are inlined at build — never
secrets); wire Git-integration CI/CD with deploy previews. Add i18n if needed (next-intl /
i18next; BCP 47 codes; `Intl.*`; ICU MessageFormat).

**🎨 UX/UI design at this step** *(thin)*
- **RTL & locale mirroring** — because you used **logical properties** in Steps 2–3, RTL
  mirrors automatically via `<html dir="rtl">` (no separate stylesheet). Verify number/date/
  plural formatting per locale and that translated strings don't break layout (allow ~30%
  text expansion).

**Done when** previews deploy on push, secrets stay server-side, and (if i18n) RTL + locale
formatting render correctly.
`← frontend.md §16`

---

## Step 16 — Test & ship

**Build** — Testing Trophy: TS strict + lint (static) → mostly **integration** tests (Testing
Library + user-event, MSW for network) → lean unit tests → a few **Playwright** E2E for
critical journeys → optional visual regression. CI: unit/integration every push; E2E sharded.

Then run the two gates below before shipping.

**🎨 Visual Quality Bar** (the "looks professional" check)
- [ ] All spacing from one scale; nothing eyeballed.
- [ ] One type scale; hierarchy via weight+color; body ≥16px; measure ~66ch.
- [ ] Cohesive color (neutral ramp w/ subtle saturation + semantic); 60-30-10; accents sparse.
- [ ] Contrast passes AA (4.5:1 / 3:1).
- [ ] Consistent radius, elevation, one icon family/stroke.
- [ ] Generous whitespace; one focal point per screen; aligned to a grid.
- [ ] Light, purposeful motion (150–400ms, transform/opacity); reduced-motion honored.
- [ ] **All UI states present:** loading (skeleton), empty, error (+retry), success.
- [ ] Dark mode (if any) via semantic tokens, no pure `#000`.
- [ ] Responsive 320px→wide; touch targets ≥24px (aim 44–48).

**Pre-Ship Checklist**
- [ ] CWV: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1.
- [ ] a11y: axe + Lighthouse clean; keyboard-only; visible focus; screen-reader sanity; zoom
      reflow; forced-colors.
- [ ] SEO: unique title/description, OG/Twitter image, canonical, sitemap+robots, JSON-LD,
      server-rendered metadata.
- [ ] Responsive 320px→ultrawide; no horizontal scroll; cross-browser incl. WebKit/Safari.
- [ ] TS strict passes; lint/format clean; tests green (integration + key E2E).
- [ ] Images/fonts: modern formats, sized (no CLS), LCP preloaded, fonts self-hosted/subset.
- [ ] Robustness: error boundaries; loading/empty/error states; no secrets in client bundle.

**Done when** both gates pass and the critical user journeys are green in Playwright.
`← frontend.md §15, §17–18`

---

## Appendix — relationship to `frontend.md`

`frontend.md` is the **topic-organized** deep reference (frameworks, CSS, design systems,
motion, a11y, perf, SEO, TS, testing, deploy, i18n). **This file** is the **sequence** that
tells you *when* to use each topic and *what design* each step needs. When a step's inline
design isn't enough, follow its `← frontend.md §X` pointer for the exhaustive version.
