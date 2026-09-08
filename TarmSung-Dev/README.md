# TarmSung — web studio site and demo library

The site for a small web studio, plus the demo builds used to sell each package tier.

**Live:** https://tarmsung.pages.dev (Cloudflare Pages)
**Stack** — hand-written HTML/CSS/JS, no framework · Cloudflare Pages + Functions ·
Node scripts for auditing and deployment

---

## Why it is laid out this way

A studio site is only half the product; the other half is having something to show. The
`work/` directory holds 19 demo sites, each one built to represent a specific price tier
so a prospect can see the difference rather than read about it.

| Tier | What it demonstrates | Representative demos |
|---|---|---|
| Landing page | 6–7 blocks, sticky call/LINE bar, working lead form | `glow-clinic`, `krua-baansuan`, `the-terrace` |
| Multi-page | 5+ real pages, shared nav, per-service pages | `the-terrace-multi`, `the-bed-multi`, `glow-clinic-multi` |
| Web app | Cart → checkout → order lands in an admin back-office | `gamedock` |

`gamedock` is the fullest one: storefront, cart, checkout, member accounts, and an
`admin.html` back-office (demo/demo) where editing a price or stock level changes the
storefront immediately. It persists to **localStorage**, not a server — two browsers do
not see each other's orders. That limitation is stated up front rather than discovered by
a client.

## Repository layout

```
index.html, *.html   The studio site itself
work/                19 demo sites (see above)
css/, js/, assets/   Shared design tokens, scripts, brand assets
functions/api/       Cloudflare Functions — lead form endpoint
playbook/            Build, audit and deploy tooling
  deploy.mjs         Publishes from `git archive HEAD`
  regress.mjs        Full regression pass
  audit-nav.mjs      Header shrink/scroll behaviour
  audit-height.mjs   Layout height checks
  audit-heads.mjs    <head> completeness across every page it discovers
  snippets/          Single source for shared components
  sync-*.mjs         Distributes snippets into each demo
design/              Static mockups (not wired up)
google-apps-script/  Booking form back-end
```

## Running locally

```bash
node _serve.mjs                      # http://localhost:8000
PORT=8098 node _serve.mjs            # port the nav audit expects
node playbook/regress.mjs            # run the checks
node playbook/audit-nav.mjs          # needs a server on :8098
```

## Deploying

```bash
node playbook/deploy.mjs
```

It publishes from `git archive HEAD`, so **uncommitted work does not ship**. Commit first,
or pass `--dirty` deliberately.

## Conventions worth knowing

- **Shared components have one source.** `playbook/snippets/nav-shrink.css` and
  `booking-form.{css,js,html}` are copied into each demo by their `sync-*.mjs` script.
  Editing the copy inside a demo gets overwritten on the next sync.
- **The audit scripts used to lie.** `audit-nav` and `audit-height` returned ✅ while
  failing to open a single page; `audit-heads` checked a hardcoded list of three demos, so
  new ones were never covered. All three now exit non-zero on failure and discover pages
  themselves (33 → 36 found).
- **Contrast has to be measured after scroll.** The `.reveal` animation starts elements at
  opacity 0, so measuring too early reports a 1.00 ratio for everything — 48 false
  failures in one pass before that was understood.
