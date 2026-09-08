# Fix-everything spec — single source of truth for all agents

Read this before editing. Do NOT edit files you do not own (see Ownership).

## Architectural decision (already made — implement, don't relitigate)

**Language becomes real URLs instead of a client-side innerHTML swap.**

```
/index.html      /menu.html      /visit.html       → Thai   (lang="th")
/en/index.html   /en/menu.html   /en/visit.html    → English (lang="en")
```

The English pages are GENERATED from the Thai pages by `tools/build_en.py`,
which applies each `data-en` value and strips the i18n attributes.

This one change fixes five separate findings at once: English becomes
indexable, `hreflang` becomes possible, the language flash disappears,
language works with JS disabled, and JSON-LD can be per-language.

Consequence: the runtime i18n module in `main.js` is DELETED. The toggle is
two links, not two buttons.

## Toggle markup contract (must match exactly across CSS + all pages)

Thai page (`PAGE` = index | menu | visit):

```html
<div class="lang-toggle" data-active="th">
  <span class="lang-toggle__pill" aria-hidden="true"></span>
  <a class="lang-toggle__opt" href="PAGE.html" hreflang="th" aria-current="true">ไทย</a>
  <a class="lang-toggle__opt" href="en/PAGE.html" hreflang="en">EN</a>
</div>
```

The generator rewrites this for English pages to `data-active="en"`, hrefs
`../PAGE.html` and `PAGE.html`, and moves `aria-current="true"` to the EN link.

**Styling hook changes from `[aria-pressed="true"]` to `[aria-current]`.**
`.lang-toggle__opt` must now style `<a>`: `display:inline-flex; align-items:center;
justify-content:center; text-decoration:none;`

## Ownership — do not touch anything outside your list

| Agent | Owns (exclusive) |
|---|---|
| css | `assets/css/main.css` |
| js | `assets/js/main.js` |
| assets | `assets/og-image.png`, `robots.txt` (new files only) |
| page-index | `index.html` |
| page-menu | `menu.html` |
| page-visit | `visit.html` |

`tools/build_en.py`, `sitemap.xml`, `/en/*` are produced by the lead, not by agents.

## Facts that must not change

- Address: 12/7 ถนนลาดพร้าว แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900
- Phone: 087-330-8506 / +66873308506
- Instagram: https://www.instagram.com/highlandcafe_official/
- Hours: daily 16:30–23:30
- Canonical origin: `https://highlandcafe.co.th`
- Facebook URL is NOT confirmed — see the dead-link rule below.
- Do NOT invent an FDA licence number, an email address, or menu prices.

## Shared head block for Thai pages

Each Thai page must contain, with PAGE and its own title/description:

```html
<link rel="canonical" href="https://highlandcafe.co.th/PAGE.html">
<link rel="alternate" hreflang="th" href="https://highlandcafe.co.th/PAGE.html">
<link rel="alternate" hreflang="en" href="https://highlandcafe.co.th/en/PAGE.html">
<link rel="alternate" hreflang="x-default" href="https://highlandcafe.co.th/PAGE.html">
<meta property="og:image" content="https://highlandcafe.co.th/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Highland Café — Lat Phrao, Bangkok">
<meta property="og:url" content="https://highlandcafe.co.th/PAGE.html">
<meta name="twitter:card" content="summary_large_image">
```

For `index.html` the canonical/og:url/hreflang use `https://highlandcafe.co.th/`
(root, no filename).

## Dead Facebook link rule

`href="#"` is a broken control. Since the real URL is unconfirmed, REMOVE the
Facebook `<a class="social">` element entirely from the page (all three pages).
Do not guess a URL. Instagram and phone links stay.

## Verification each agent must run before reporting done

State in your report what you ran and what it output. Do not claim success
without evidence. If something cannot be verified, say so plainly.
