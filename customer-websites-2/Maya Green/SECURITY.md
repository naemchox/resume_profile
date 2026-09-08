# MAYA GREEN — Security protocols

Scope: the whole site (`index.html`, `assets/`). Since 2026-07-26 the site is a
single page — the former `menu.html` and `visit.html` are sections `#selection`
and `#visit` inside `index.html`.
Compiled 2026-07-26 against the current source. **Internal document — do not deploy this file.**

## Site profile (what determines the list)

- **Fully static.** No server-side runtime, no database, no build step.
- **No forms, no login, no payments, no email capture.** Nothing on the site collects
  personal data from a visitor.
- **Client storage:** `localStorage` only — `mg-lang` (language choice) and `mg-age`
  (age-gate pass). No cookies, no analytics, no tracking pixels.
- **Third-party origins:** two. Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`)
  and one Google Maps `<iframe>` in the `#visit-details` section.
- **Regulated trade** (cannabis, Thailand medical-only / PT 33 regime) and a
  **Thai + Japanese audience** — so PDPA applies, and GDPR is worth respecting for
  Japanese/EU visitors.

Consequence: the real attack surface is **transport, third-party embeds, and deployment
hygiene** — not injection, sessions, or access control. The list below is ordered by
what actually protects this site.

---

## 1. Transport security (TLS)

| # | Control | Setting |
|---|---------|---------|
| 1.1 | HTTPS on every URL | TLS 1.2 minimum, **TLS 1.3 preferred** |
| 1.2 | Certificate | Let's Encrypt or host-managed, **auto-renewing** |
| 1.3 | Disable legacy protocols | No SSLv3 / TLS 1.0 / TLS 1.1; no RC4, 3DES, CBC-only suites |
| 1.4 | HTTP → HTTPS | Permanent **301** redirect, all paths |
| 1.5 | `www` ↔ apex | Pick one canonical host, 301 the other |
| 1.6 | HSTS | `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` |
| 1.7 | OCSP stapling | On |
| 1.8 | CAA record | Restrict which CA may issue for the domain |

> **Order of operations for HSTS:** ship HTTPS first, confirm *every* subdomain is
> HTTPS-clean, run `max-age=300` for a week, then raise to a year and only then submit
> to the preload list. Preload is effectively irreversible for months.

---

## 2. HTTP security response headers

Set these on **all** responses. On Netlify use a `_headers` file, on Cloudflare Pages
`_headers` or a Transform Rule, on Vercel `vercel.json`, on nginx `add_header`.

### 2.1 Content-Security-Policy

The hashes below are the **real** SHA-256 values of this site's inline scripts, computed
2026-07-26. The `<head>` watchdog is byte-identical across all three pages; the two
JSON-LD blocks differ, so both are listed.

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self'
    'sha256-PD+P/igz3aaX1dLrpaHp0hGHt+xal15RziV5xSAdzCI='
    'sha256-04U9hJONe/y+DEpAK5tddwMIQmLKuB7Vn9wr+0n94W4='
    'sha256-1zdotvQHWN6y3ncHielBiKo9GE7hzVwE/2iHGjdV5QE=';
  style-src 'self' https://fonts.googleapis.com;
  style-src-attr 'unsafe-inline';
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data:;
  frame-src https://www.google.com;
  connect-src 'self';
  base-uri 'none';
  form-action 'none';
  object-src 'none';
  frame-ancestors 'none';
  upgrade-insecure-requests
```

Notes, all of which matter:

- **`style-src-attr 'unsafe-inline'` is required.** The markup uses inline style
  attributes (`style="--d:120ms"` on `.reveal` elements) and `main.js` writes
  `document.body.style.overflow` when the age gate opens. Without it, the reveal
  stagger and the gate's scroll-lock break. Using `style-src-attr` instead of putting
  `'unsafe-inline'` in `style-src` keeps inline `<style>` *blocks* still blocked.
- **JSON-LD counts as a script.** `script-src` governs `<script type="application/ld+json">`
  even though it never executes — hence hashes 2 and 3.
- **Any edit to an inline script changes its hash**, including whitespace. Re-run the
  hash step (§9) as a pre-deploy check, or the page silently loses its watchdog.
- **`frame-src https://www.google.com`** exists only for the map in `#visit-details`. Drop it
  if you move to the click-to-load facade in §3.2.
- **Self-hosting the fonts (§3.1) collapses this policy** to `style-src 'self'; font-src 'self'`
  and removes both Google origins entirely. Do that first if you can.
- **Roll out in report mode.** Ship `Content-Security-Policy-Report-Only` with a
  `report-uri`/`report-to` endpoint, watch for a week, then switch to enforcing.

### 2.2 The rest

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

- `X-Frame-Options: DENY` is redundant with `frame-ancestors 'none'` but still read by
  older browsers. Keep both.
- **Do not set `Cross-Origin-Embedder-Policy: require-corp`** — it breaks the Google Maps
  iframe and the Google Fonts requests. No benefit here.
- **Do not set `X-XSS-Protection`.** The legacy auditor is removed from modern browsers
  and the header has caused vulnerabilities of its own. Omit it, or send `0`.
- Target **A+ on securityheaders.com and SSL Labs** — both are free and take a minute.

---

## 3. Third-party / supply-chain controls

### 3.1 Google Fonts → self-host (recommended)

Four families are pulled from `fonts.googleapis.com` on every page. Two problems: it is a
render-blocking dependency on someone else's uptime, and **every visitor's IP address is
disclosed to Google before a single pixel paints** — the exact pattern a German court
found unlawful under GDPR in 2022, and a poor look for a shop whose customers are
buying regulated goods.

Fix: download the WOFF2 files, drop them in `assets/fonts/`, declare `@font-face` in
`main.css` with `font-display: swap`, and delete the two `<link rel="preconnect">` and the
`<link rel="stylesheet">` from all three `<head>`s. This also removes the need for
Subresource Integrity, which **cannot** be applied to the Fonts CSS anyway (Google varies
the response by User-Agent, so no fixed hash exists).

### 3.2 Google Maps iframe (`index.html`, `#visit-details`)

Currently correct as far as it goes — it has `loading="lazy"` and
`referrerpolicy="no-referrer-when-downgrade"`. Two upgrades, in order of preference:

1. **Click-to-load facade (best).** Replace the iframe with a static map image plus a
   "Open in Google Maps" link. Google then sets nothing and sees nothing until the
   visitor chooses to go there. Removes `frame-src` from the CSP, removes the
   third-party cookie on page load, and speeds up the page.
2. **If the live embed stays:** tighten `referrerpolicy` to `no-referrer`, and add
   `allow=""` to block feature delegation (geolocation especially). Note that
   `sandbox` is *not* useful here — the embed needs both `allow-scripts` and
   `allow-same-origin`, which together neutralise the sandbox.

### 3.3 Rule for anything added later

Any future third-party script — analytics, LINE widget, booking, chat, Meta Pixel —
must arrive with:

- **Subresource Integrity**: `integrity="sha384-…" crossorigin="anonymous"`
- A **pinned version** in the URL. Never `@latest`, never an unversioned CDN path.
- A matching **CSP allowance** added deliberately, not `'unsafe-inline'` bolted on to
  make an error go away.
- A **PDPA consent review** (§5) — most of these collect personal data.

---

## 4. Client-side code rules

- **`innerHTML` at `assets/js/main.js:84`** — the age-gate "Sorry" message. The string is
  a static literal today, so there is no vulnerability. The standing rule: never route
  anything from `location`, `URLSearchParams`, `postMessage`, `localStorage`, or a
  network response through `innerHTML`. Use `textContent`. Converting this one call to
  DOM building now removes the pattern from the codebase before someone copies it.
- **No `eval`, `new Function`, `setTimeout('string')`, or `document.write`.** None
  present — keep it that way; each one forces `'unsafe-eval'` into the CSP.
- **No inline `on*` handlers** (`onclick=`, `onerror=`). None present. Adding one breaks
  the hash-based CSP.
- **`target="_blank"` always with `rel="noopener noreferrer"`.** Verified: all 12
  external links across the three pages already comply. Keep it as a review rule —
  without `noopener` the opened page gets `window.opener` and can redirect this tab.
- **No secrets in client code.** Nothing sensitive is in the repo today (`.env` is not
  used by this site). Any future API key that appears in JS is public by definition —
  scope it, restrict it by HTTP referrer, and never ship a secret key.

---

## 5. Data protection (PDPA / GDPR)

**Current position is genuinely good and worth protecting:** the site collects no
personal data at all. `mg-lang` and `mg-age` are non-identifying, strictly-functional
values in `localStorage`, so **no consent banner is legally required today**.

Controls to hold that line:

- **Self-host the fonts** (§3.1) — removes the IP disclosure to Google.
- **Facade the map** (§3.2) — removes Google's cookies on page load.
- **Adding any analytics flips the obligation.** GA4, Meta Pixel, Clarity, Hotjar and
  similar require, under PDPA: a lawful basis, **prior opt-in consent** (Thai PDPA has
  no "legitimate interest" carve-out for marketing cookies), a working reject path, and
  a published privacy notice. If you want traffic numbers without any of that, use a
  cookieless, IP-anonymising analytics tool (Plausible, Fathom, Umami) — self-hosted
  if possible.
- **There is no privacy policy page.** Not required while nothing is collected, but the
  moment analytics or a contact form lands, PDPA s.23 requires a notice at or before
  collection. Draft it in Thai and English.
- **If a contact / booking form is ever added**, it brings its own protocol set that
  none of the above covers: server-side validation, CSRF token, rate limiting,
  honeypot or CAPTCHA, TLS-only transmission, encryption at rest, a stated retention
  period, and a deletion path. Treat it as a new security review, not an increment.

---

## 6. Age gate — a compliance control, not a security control

Be clear-eyed about this. The gate (`main.js:45–94`) is client-side and backed by
`localStorage`; it is bypassed by clearing storage, disabling JS, or using `curl`. It is
also **deliberately** skipped when JS fails, so crawlers and no-JS visitors see the site.

That is the normal, accepted pattern for this industry and it is fine as-is — provided:

- **Nothing that must genuinely be restricted is ever placed behind it.** It gates
  presentation, not access.
- Nobody documents it to the client as "age verification". It is an age *declaration*.
- If a Thai regulator or a payment provider later demands enforceable verification,
  that requires an edge/server check (signed cookie validated at the CDN) or a
  third-party ID service — a different project.

Related: the site is public and indexable. Confirm with the client that indexing the
selection section is what they want under the medical-only regime. With one page a
`noindex` would now hide the whole site, so this is a robots/`X-Robots-Tag` decision, not a
one-line change if not. (Compliance question, not a security one — flagged here so it
isn't missed.)

---

## 7. Hosting & deployment hygiene

This is where this site's actual risk sits.

### 7.1 Files that must not be published

| Path | Why |
|------|-----|
| `FACTS.md` | Internal research notes — unresolved claims, "confirm with client" items, owner's personal Instagram, source-trust judgements. A static host will serve it at `/FACTS.md` to anyone who guesses. |
| `assets/img/README.md` | Internal notes on which photographs were used and why. Same exposure. |
| `SECURITY.md` (this file) | A map of the site's controls and their limits. |
| `.DS_Store` (root, `assets/`, `assets/images/`) | Leaks the full directory listing, including unpublished filenames. |
| `assets/images/` (~62 MB) | Originals, plus 19 desktop screenshots unrelated to the site. Only the derivatives in `assets/img/` are needed. |

Enforce with a deploy ignore list (`.gitignore`, Netlify `_redirects` returning 404, or
an explicit publish directory). Verify after launch by requesting `/FACTS.md` and
`/.DS_Store` directly — a 404 is the only acceptable answer.

**Best structural fix:** move the three HTML files and `assets/css`, `assets/js`,
`assets/img` into a `public/` (or `dist/`) directory and publish only that. Then
internal files cannot leak by omission.

### 7.2 Hosting platform

- **Static host, no server-side runtime** — Cloudflare Pages, Netlify, Vercel, or
  S3 + CloudFront. No WordPress, no PHP, no CMS. This eliminates the entire category
  of vulnerabilities that takes small business sites down.
- **Directory listing disabled** (default on all four).
- **Cache headers:** `Cache-Control: public, max-age=31536000, immutable` on hashed
  assets; `no-cache` on the three HTML files so fixes propagate.
- **DDoS / CDN** in front — free tier is sufficient at this traffic level.
- **`.env`, `credentials.json`, `token.json` never leave the workstation.** They belong
  to the WAT tooling, not to this site; confirm they are outside the publish root.

### 7.3 Domain & account security

- **MFA on the domain registrar, the DNS provider, and the hosting account.** Domain
  hijack is the single most damaging realistic attack on a site like this.
- **Registrar transfer lock** enabled.
- **DNSSEC** enabled.
- **CAA record** (also §1.8).
- **SPF + DMARC even if the domain never sends email** — publish
  `v=spf1 -all` and `_dmarc` with `v=DMARC1; p=reject; rua=mailto:…`. Without these,
  anyone can spoof mail from the brand's domain to its customers.
- Unique passwords in a manager; no shared logins with the client.

### 7.4 Source control & backup

- The site **is** under git — the repository root is `Customers/`, with a private GitHub
  remote at `monmon7735-coder/customer-websites`. Private visibility confirmed
  2026-07-26, which is what makes it acceptable for `FACTS.md` to be committed. **If that
  repo is ever made public, `FACTS.md` and `assets/img/README.md` go public with it,
  including their full history.**
- **The remote is stale.** As of 2026-07-26 the repo has a single commit
  (`855939c`, last push 2026-07-24) while `index.html` (now the whole site),
  `main.css` and both README/FACTS files carry uncommitted 2026-07-25/26 changes, and
  every client photograph in `assets/img/` and `assets/images/` is untracked. The
  recovery position is therefore worse than the presence of a git remote suggests.
- **Time Machine is configured but not running** — `tmutil latestbackup` fails to mount
  the destination. There is currently no working local backup either.
- Commit and push after every working session. The remote is both the off-machine copy
  and the audit trail for what changed and when.
- `.gitignore` correctly excludes `.DS_Store`, `node_modules/` and `.env`. Keep `.env`
  there permanently.

---

## 8. Monitoring & maintenance

| Cadence | Action |
|---------|--------|
| Continuous | Uptime + TLS-expiry monitor (UptimeRobot free tier or host-native) |
| Continuous | CSP violation reports to a collection endpoint |
| Quarterly | Re-scan: securityheaders.com, Mozilla Observatory, SSL Labs |
| Quarterly | Review every third-party embed — is it still needed, still pinned? |
| On change | Re-compute inline-script CSP hashes (§9) before deploying HTML edits |
| Annually | Rotate host/registrar credentials; confirm MFA still enrolled |

---

## 9. Pre-deploy verification

```bash
cd "Customers/Maya Green"

# 1. Re-compute CSP hashes for inline scripts — must match the deployed policy
python3 - <<'PY'
import re, hashlib, base64, glob
for f in sorted(glob.glob("*.html")):
    src = open(f, encoding="utf-8").read()
    for m in re.finditer(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', src, re.S):
        h = base64.b64encode(hashlib.sha256(m.group(2).encode()).digest()).decode()
        print(f"{f:12} [{m.group(1).strip() or 'inline js'}]  'sha256-{h}'")
PY

# 2. No unsafe DOM sinks or inline handlers crept in
grep -rnE "innerHTML|outerHTML|document\.write|eval\(|new Function|\son[a-z]+=" *.html assets/js/

# 3. Every external link carries rel="noopener noreferrer"
grep -rn 'target="_blank"' *.html | grep -v 'rel="noopener noreferrer"'

# 4. Junk that must not ship
find . -name ".DS_Store" -o -name "*.md" -not -path "./node_modules/*"
```

After launch, from outside the network:

```bash
curl -sI https://<domain>/ | grep -iE 'strict-transport|content-security|x-content-type|x-frame|referrer-policy|permissions-policy'
curl -sI https://<domain>/FACTS.md      # expect 404
curl -sI https://<domain>/.DS_Store     # expect 404
curl -sI http://<domain>/               # expect 301 to https
```

---

## 10. Explicitly not applicable

Listed so they are not bolted on for the sake of a checklist, and so it is obvious what
changes if the site's shape changes.

| Control | Why not | Becomes required if… |
|---------|---------|----------------------|
| Authentication / session management | No login exists | An admin or ordering area is added |
| SQL / NoSQL injection defence | No database | Any backend is added |
| CSRF tokens | No state-changing requests | A form or API is added |
| File-upload validation | No uploads | Customer photo/document upload is added |
| Application-layer WAF rules | No application logic to attack | A backend is added |
| Server patching, OS hardening | No server — static host | You move off static hosting |
| PCI-DSS | No payments taken online | Online ordering or deposits are added |
| Secrets management / key rotation | The site ships no keys | Any API integration is added |

---

## Priority order

If only some of this gets done, do it in this sequence:

1. **HTTPS + HSTS + HTTP→HTTPS redirect** (§1) — non-negotiable, and free.
2. **Keep `FACTS.md`, `assets/img/README.md`, `.DS_Store` and `assets/images/` out of the
   publish root** (§7.1) — the one item here that leaks real information today.
3. **Security headers, CSP last and in report-only first** (§2).
4. **MFA + registrar lock + DNSSEC on the domain** (§7.3).
5. **Self-host the fonts** (§3.1) — security, privacy, and speed in one change.
6. **SPF/DMARC** (§7.3) — cheap, and protects customers from spoofed mail.
7. Everything else.
