# Sports Association Website

A public website and a content admin for a national sports association, built for a client. Editors manage news, homepage banners, the event calendar, photo albums and page images from the admin; the public site reads that content live. The client's name has been replaced with a placeholder ("Sample Sports Association").

**Stack** — Firebase (Auth with Google sign-in, Firestore, Storage) · plain HTML/CSS/JS with ES modules, no build step

Docs: [`site/README.md`](./site/README.md) · [`admin/README.md`](./admin/README.md) (Thai first-time setup) · [`admin/PREVIEW.md`](./admin/PREVIEW.md) and [`admin/EDITOR.md`](./admin/EDITOR.md) (message contracts between admin and site)

---

## Features

**Public site (`site/`)**

- Home with banners, event participation, latest news, competition categories, national team, albums and partners.
- Organisation, news (filter by category) and article pages, competition calendar and details, downloads, media (photo albums and videos), about the sport, contact.
- Falls back to bundled sample data (`js/seed.js`) when Firebase is not configured or fails to load.

**Admin (`admin/`)**

- Google sign-in only. Access is limited to accounts that have a document in `admins/{uid}`.
- CRUD for news (search, filter, cover image, featured, draft or published), homepage banners (order, on/off), events (main or other, dates, venue, registration link, cover), albums (bulk upload, delete, set cover, link to an event) and nine fixed page images.
- Browser-side image resize before upload, and a focal-point picker that shows every crop frame the site uses for that image (`js/focal.js`).
- Preview that shows the real site in an iframe, before and after the unsaved edit, and an on-page edit mode with pen buttons on each editable section (`js/preview.js`, `js/live.js`).

## Layout

```
site/
  index.html, news.html, article.html, competition.html, media.html, album.html,
  organisation.html, downloads.html, about-jump-rope.html, contact.html
  css/style.css
  js/
    firebase-config.js     Firebase config and FIREBASE_READY flag
    data.js                Firestore reads
    content.js             Hand-edited content: address, menus, partners, board, coaches, downloads
    seed.js                Sample data for the unconfigured state
    layout.js  render.js  util.js
    pages/                 One module per page
admin/
  login.html, index.html, news.html, banners.html, events.html,
  albums.html, album.html, site-images.html
  css/admin.css
  js/
    firebase-config.js     Must match site/js/firebase-config.js
    config.js              SITE_URL, categories, image keys, resize settings
    auth.js  db.js  upload.js  ui.js  focal.js  preview.js  live.js  albums-common.js
    pages/                 One module per page
  firestore.rules  storage.rules  firebase.json
  PREVIEW.md  EDITOR.md  README.md
```

The docs refer to a `CONTRACT.md` (the data and path agreement between site and admin) and a `.firebaserc`; neither is included in this copy.

## Running locally

ES modules need HTTP, not `file://`. The admin preview expects the site on port 5610 when the admin runs on localhost.

```bash
cd site  && python3 -m http.server 5610 --bind 127.0.0.1
cd admin && python3 -m http.server 5500
```

## Setup

All Firebase values are placeholders (`REPLACE_WITH_YOUR_...`). Edit **both** files with the same web-app config and keep `FIREBASE_READY = true`:

- `admin/js/firebase-config.js`
- `site/js/firebase-config.js`

Also set `SITE_URL` in `admin/js/config.js` (used for the "view live site" link and preview outside localhost). Then, following `admin/README.md`:

1. Enable Google sign-in in Firebase Authentication and add the admin's domain to authorized domains.
2. Create Firestore (Production mode) and Storage. Create the Firestore database first, in the region you want, before deploying rules.
3. Sign in once so the app shows your UID, then create a document `admins/<uid>` in the Console.
4. Deploy rules:

   ```bash
   cd admin
   firebase deploy --only firestore:rules,storage
   ```

Content that is not edited through the admin lives in `site/js/content.js`. Placeholder values are marked `[รอข้อมูล]` ("awaiting data") and need real values before launch.

## Constraints / design notes

- **Rules are the security boundary.** The Firebase web config is public by design. Anyone can read published news, events and albums, banners and site images; only signed-in users with an `admins/{uid}` document can write. Signing in with Google alone gives no write access, and the admin signs such users out immediately. The admin list can only be edited in the Console, not from the app.
- **Cross-service rule.** `storage.rules` checks `admins/{uid}` in Firestore, so the deploying account has to grant Storage permission to read Firestore on first deploy. `admin/README.md` records the symptom (`storage/unauthorized`) and the fix.
- **Draft and published.** Firestore rules let the public read only documents with `status == 'published'`, and validate the status value and news category on write.
- **Preview by message passing.** The admin loads the real site in an iframe and sends unsaved edits with `postMessage` as a `patch` merged over live data on the site side. The site announces itself with `jr-preview-ready`, and the admin replies only to the site's origin. If no patch arrives within three seconds the site renders unmodified. The on-page edit mode extends the same protocol; both are specified in the two Markdown files.
- **Images are resized in the browser** before upload, with EXIF orientation applied through `createImageBitmap`, and a focal point is stored per image as `object-position` so one upload crops sensibly in every frame.
- **Regional and cost choices.** The docs record choosing the Singapore region (cannot be changed later) and the Blaze plan needed for Storage, with a billing alert; expected volume is a handful of albums per year.
- **Contact form** opens the visitor's mail client (`mailto:`); storing questions in the system was left out of scope.
